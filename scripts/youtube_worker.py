import argparse
import json
import os
import secrets
import subprocess
import threading
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_BYTES = 2 * 1024 ** 3
# Range imports re-encode the video; half the cores, between 2 and 8, keeps the studio responsive.
THREADS = str(max(2, min(8, (os.cpu_count() or 4) // 2)))
os.environ['YTDLP_NO_PLUGINS'] = '1'
# YouTube throttles one open-ended stream to about twice real time but serves 10 MB ranges at full speed.
CHUNK = 10 * 1024 ** 2
AHEAD = 4


def emit(progress, message):
    print(json.dumps({'progress': progress, 'message': message}), flush=True)


def validate_source(info, start=None, end=None):
    if info.get('is_live') or info.get('live_status') in ['is_live', 'is_upcoming', 'post_live']:
        return 'Wait until this livestream has finished processing on YouTube.'
    duration = info.get('duration')
    if start is not None:
        if duration is not None and (start >= duration or end > duration + .05):
            return 'The selected range is outside the video. Check the original start and end times.'
    elif duration is not None and not 1 <= duration <= 10800:
        return 'This video is longer than 3 hours. Enable Choose part of a long video and enter a time range.'
    if start is None and (info.get('filesize') or 0) > MAX_BYTES:
        return 'The video exceeds the 2 GB import limit. Choose a shorter range or lower quality.'


def describe(url, node):
    import yt_dlp
    options = {'noplaylist': True, 'quiet': True, 'no_warnings': True, 'cachedir': False, 'socket_timeout': 20,
               'js_runtimes': {'node': {'path': node}}, 'remote_components': set(), 'skip_download': True}
    with yt_dlp.YoutubeDL(options) as downloader:
        info = downloader.extract_info(url, download=False)
    if info.get('is_live') or info.get('live_status') in ['is_live', 'is_upcoming', 'post_live']:
        raise ValueError('Wait until this livestream has finished processing on YouTube.')
    duration = info.get('duration')
    if not isinstance(duration, (int, float)) or not 1 <= duration <= 86400:
        raise ValueError('The stream length could not be read, or it is longer than 24 hours.')
    print(json.dumps({'info': {'duration': duration, 'title': info.get('title') or 'YouTube stream'}}, ensure_ascii=False), flush=True)


def http_range(url, headers, first, last):
    request = urllib.request.Request(url, headers={**headers, 'Range': f'bytes={first}-{last}'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return response.headers.get('Content-Range', ''), response.read()
        except urllib.error.HTTPError as error:
            if error.code in (403, 404, 410) or attempt == 3:
                raise
        except OSError:
            if attempt == 3:
                raise
        time.sleep(1 + attempt * 2)


class ChunkedSource:
    """One remote file read in parallel 10 MB ranges, prefetching ahead of the reader."""

    def __init__(self, url, headers):
        self.url, self.headers = url, headers
        content_range, _ = http_range(url, headers, 0, 0)
        self.size = int(content_range.rsplit('/', 1)[1])
        self.pool = ThreadPoolExecutor(AHEAD)
        self.lock = threading.Lock()
        self.chunks = {}

    def fetch(self, index):
        first = index * CHUNK
        last = min(first + CHUNK, self.size) - 1
        data = http_range(self.url, self.headers, first, last)[1]
        if len(data) != last - first + 1:
            raise OSError('YouTube returned an incomplete part of the video.')
        return data

    def chunk(self, index):
        with self.lock:
            wanted = range(index, min(index + AHEAD, (self.size - 1) // CHUNK + 1))
            for ahead in wanted:
                if ahead not in self.chunks:
                    self.chunks[ahead] = self.pool.submit(self.fetch, ahead)
            # ffmpeg may read two places (index and media); keep a few chunks behind each.
            for old in [key for key in self.chunks if key not in wanted][:-AHEAD]:
                self.chunks.pop(old).cancel()
            future = self.chunks[index]
        return future.result()

    def read(self, first, last):
        while first <= last:
            index, offset = divmod(first, CHUNK)
            data = self.chunk(index)[offset:offset + last - first + 1]
            yield data
            first += len(data)


def serve_chunked(sources, failures):
    """Loopback-only proxy so ffmpeg can seek and read the YouTube streams through ChunkedSource."""
    token = secrets.token_urlsafe(16)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            name = self.path.removeprefix(f'/{token}/')
            source = sources.get(name) if self.path.startswith(f'/{token}/') else None
            if not source:
                self.send_error(404)
                return
            first, last = 0, source.size - 1
            requested = self.headers.get('Range', '').removeprefix('bytes=').split('-')
            if len(requested) == 2 and requested[0]:
                first, last = int(requested[0]), int(requested[1] or last)
            if first > last or last >= source.size:
                self.send_error(416)
                return
            self.send_response(206 if self.headers.get('Range') else 200)
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Content-Length', str(last - first + 1))
            self.send_header('Content-Range', f'bytes {first}-{last}/{source.size}')
            self.end_headers()
            try:
                for data in source.read(first, last):
                    self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                pass  # ffmpeg closes the connection whenever it seeks.
            except Exception as error:
                failures.append(error)
                self.close_connection = True

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f'http://127.0.0.1:{server.server_port}/{token}/'


def video_encoder():
    """NVENC encodes about 5x faster than libx264 here at slightly better quality; libx264 runs everywhere."""
    probe = ['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=0.2', '-c:v', 'h264_nvenc', '-f', 'null', '-']
    try:
        if subprocess.run(probe, stdin=subprocess.DEVNULL, capture_output=True, timeout=15).returncode == 0:
            return ['-c:v', 'h264_nvenc', '-preset', 'p5', '-tune', 'hq', '-rc', 'vbr', '-cq', '30', '-b:v', '0',
                    # Busy IRL footage reaches 3.3 Mbps; 4 Mbps keeps a one-hour part under the 2 GB limit.
                    '-maxrate', '4M', '-bufsize', '8M']
    except (OSError, subprocess.TimeoutExpired):
        pass
    return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-threads', THREADS]


def download_section(info, folder, start, end):
    """Cuts start..end through the chunked proxy. Returns False when the formats need yt-dlp's own downloader."""
    formats = info.get('requested_formats') or [info]
    if not 1 <= len(formats) <= 2 or any(f.get('protocol') not in ['https', 'http'] or not f.get('url') for f in formats):
        return False
    try:
        sources = {str(index): ChunkedSource(f['url'], f.get('http_headers') or {}) for index, f in enumerate(formats)}
    except (OSError, ValueError, IndexError):
        return False
    failures = []
    server, base = serve_chunked(sources, failures)
    inputs = []
    for name in sources:
        inputs += ['-ss', f'{start:.3f}', '-t', f'{end - start:.3f}', '-i', base + name]
    audio = ['-map', '1:a:0'] if len(sources) == 2 else ['-map', '0:a:0?']
    partial = folder / 'partial.mp4'
    command = ['ffmpeg', '-y', '-loglevel', 'error', '-hide_banner', '-threads', THREADS, *inputs, '-map', '0:v:0', *audio,
               *video_encoder(), '-c:a', 'aac', '-b:a', '128k', '-fs', str(MAX_BYTES), '-movflags', '+faststart',
               '-progress', str(folder / 'download-progress.txt'), str(partial)]
    try:
        result = subprocess.run(command, stdin=subprocess.DEVNULL, capture_output=True, text=True)
    finally:
        server.shutdown()
        server.server_close()
    if failures:
        raise failures[0]
    if result.returncode:
        raise ValueError(result.stderr.strip()[-500:] or 'ffmpeg could not cut the selected range.')
    partial.rename(folder / 'source.mp4')
    return True


def download(url, folder, node, start=None, end=None, quality=720):
    import yt_dlp
    from yt_dlp.utils import DownloadError

    completed = {}
    finished = set()
    def progress(event):
        filename = event.get('filename', '')
        downloaded = event.get('downloaded_bytes') or 0
        completed[filename] = downloaded
        if sum(completed.values()) > MAX_BYTES:
            raise DownloadError('The video exceeds the 2 GB import limit. Choose a shorter video.')
        if event['status'] == 'downloading':
            total = event.get('total_bytes') or event.get('total_bytes_estimate')
            # Video and audio can arrive separately; reserve half the bar for each.
            percent = min(94, len(finished) * 45 + downloaded / total * 45) if total else len(finished) * 45 + 1
            emit(percent, f'Downloading from YouTube · {sum(completed.values()) / 1024 ** 2:.1f} MB')
        elif event['status'] == 'finished':
            finished.add(filename)
            emit(min(95, len(finished) * 45), 'Preparing downloaded video and audio')

    def allowed(info, *, incomplete=False):
        return validate_source(info, start, end)

    options = {
        'noplaylist': True,
        'quiet': True,
        'no_warnings': True,
        'noprogress': True,
        'cachedir': False,
        'socket_timeout': 20,
        'retries': 3,
        'fragment_retries': 3,
        'concurrent_fragment_downloads': 1,
        'js_runtimes': {'node': {'path': node}},
        'remote_components': set(),
        'outtmpl': str(folder / 'source.%(ext)s'),
        'format': f'bv[height<={quality}][ext=mp4][vcodec^=avc1]+ba[ext=m4a]/b[height<={quality}][ext=mp4]/bv[height<={quality}]+ba/b[height<={quality}]',
        'merge_output_format': 'mp4',
        'max_filesize': MAX_BYTES if start is None else None,
        'match_filter': allowed,
        'break_on_reject': True,
        'progress_hooks': [progress],
    }
    stopped = threading.Event()
    if start is not None:
        from yt_dlp.utils import download_range_func
        options.update({
            'download_ranges': download_range_func(None, [(start, end)]),
            'force_keyframes_at_cuts': True,
            'external_downloader_args': {
                'ffmpeg_i': ['-threads', THREADS],
                'ffmpeg_o': ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-threads', THREADS,
                             '-c:a', 'aac', '-b:a', '128k', '-fs', str(MAX_BYTES),
                             '-progress', str(folder / 'download-progress.txt')],
            },
        })
        def section_progress():
            while not stopped.wait(1):
                try:
                    values = dict(line.split('=', 1) for line in (folder / 'download-progress.txt').read_text().splitlines() if '=' in line)
                    elapsed = int(values.get('out_time_us', 0)) / 1_000_000
                    emit(min(94, 5 + max(0, elapsed)/(end-start)*89), 'Downloading and cutting the selected range')
                except (OSError, ValueError):
                    pass
        threading.Thread(target=section_progress, daemon=True).start()
    emit(1, 'Reading the YouTube video')
    try:
        with yt_dlp.YoutubeDL(options) as downloader:
            info = None
            if start is not None:
                info = downloader.extract_info(url, download=False)
                problem = validate_source(info, start, end)
                if problem:
                    raise ValueError(problem)
                if not download_section(info, folder, start, end):
                    info = None
            if info is None:
                info = downloader.extract_info(url, download=True)
    finally:
        stopped.set()
    files = [p for p in folder.glob('source.*') if p.suffix in ['.mp4', '.mkv', '.webm', '.mov']]
    if len(files) != 1 or not info:
        raise ValueError('No complete video was downloaded. Try another video or import a local file.')
    if files[0].stat().st_size > MAX_BYTES:
        raise ValueError('The downloaded video exceeds the 2 GB import limit.')
    if start is not None:
        if files[0].stat().st_size >= MAX_BYTES - 1024 * 1024:
            raise ValueError('This part reached the 2 GB limit. Choose a shorter part or lower quality.')
        probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(files[0])], capture_output=True, text=True, check=True, timeout=15)
        if abs(float(probe.stdout.strip()) - (end-start)) > .5:
            raise ValueError('The downloaded section is incomplete or has unexpected timing. Try a shorter range.')
    (folder / 'result.json').write_text(json.dumps({'filename': files[0].name, 'title': info.get('title') or 'YouTube video'}))
    emit(100, 'Download complete')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--info', action='store_true')
    parser.add_argument('--url')
    parser.add_argument('--folder')
    parser.add_argument('--node')
    parser.add_argument('--start', type=float)
    parser.add_argument('--end', type=float)
    parser.add_argument('--quality', type=int, choices=[720, 1080], default=720)
    args = parser.parse_args()
    try:
        if args.check:
            import yt_dlp
            import yt_dlp_ejs
            print('ready')
        elif args.info:
            describe(args.url, args.node)
        else:
            if (args.start is None) != (args.end is None):
                raise ValueError('Provide both the start and end of the range.')
            if args.start is not None and not (0 <= args.start < args.end <= 86400 and 1 <= args.end-args.start <= 10800):
                raise ValueError('Each selected part must be between 1 second and 3 hours.')
            download(args.url, Path(args.folder).resolve(), args.node, args.start, args.end, args.quality)
    except Exception as error:
        message = str(error)
        if any(word in message.lower() for word in ['sign in', 'bot', 'cookies', 'private', 'members-only', 'age-restricted']):
            message = 'YouTube requires sign-in or has restricted this video. Try a public video or import a local file.'
        elif '403' in message or '429' in message:
            message = 'YouTube blocked this download. Try again later or import a local file.'
        print(message[-700:], file=sys.stderr)
        sys.exit(1)
