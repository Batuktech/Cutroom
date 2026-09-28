import argparse
import json
import os
import subprocess
import threading
import sys
from pathlib import Path

MAX_BYTES = 2 * 1024 ** 3
os.environ['YTDLP_NO_PLUGINS'] = '1'


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
                'ffmpeg_i': ['-threads', '2'],
                'ffmpeg_o': ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-threads', '2',
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
