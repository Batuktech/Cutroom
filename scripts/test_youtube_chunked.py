import threading
import unittest
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock

import youtube_worker
from youtube_worker import ChunkedSource, download_section, serve_chunked

BODY = bytes(range(256)) * 400  # 102,400 bytes


class RangeOrigin(BaseHTTPRequestHandler):
    """Stands in for googlevideo: answers only bounded Range requests."""
    requests = []

    def log_message(self, *args):
        pass

    def do_GET(self):
        first, last = (int(value) for value in self.headers['Range'].removeprefix('bytes=').split('-'))
        RangeOrigin.requests.append((first, last))
        if self.path == '/forbidden':
            self.send_error(403)
            return
        data = BODY[first:last + 1]
        self.send_response(206)
        self.send_header('Content-Range', f'bytes {first}-{first + len(data) - 1}/{len(BODY)}')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)


class ChunkedSourceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.origin = ThreadingHTTPServer(('127.0.0.1', 0), RangeOrigin)
        threading.Thread(target=cls.origin.serve_forever, daemon=True).start()
        cls.url = f'http://127.0.0.1:{cls.origin.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.origin.shutdown()
        cls.origin.server_close()

    def setUp(self):
        RangeOrigin.requests.clear()
        patcher = mock.patch.object(youtube_worker, 'CHUNK', 4096)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_reads_across_chunk_boundaries_in_bounded_ranges(self):
        source = ChunkedSource(self.url + '/video', {})
        self.assertEqual(source.size, len(BODY))
        self.assertEqual(b''.join(source.read(4000, 13000)), BODY[4000:13001])
        self.assertEqual(b''.join(source.read(len(BODY) - 10, len(BODY) - 1)), BODY[-10:])
        self.assertTrue(all(last - first < 4096 for first, last in RangeOrigin.requests))

    def test_proxy_serves_ranges_and_hides_other_paths(self):
        source = ChunkedSource(self.url + '/video', {})
        server, base = serve_chunked({'0': source}, [])
        try:
            request = urllib.request.Request(base + '0', headers={'Range': 'bytes=5000-'})
            with urllib.request.urlopen(request) as response:
                self.assertEqual(response.status, 206)
                self.assertEqual(response.headers['Content-Range'], f'bytes 5000-{len(BODY) - 1}/{len(BODY)}')
                self.assertEqual(response.read(), BODY[5000:])
            with urllib.request.urlopen(base + '0') as response:
                self.assertEqual(response.read(), BODY)
            for url in [f'http://127.0.0.1:{server.server_port}/0', base + 'missing']:
                with self.assertRaises(urllib.error.HTTPError) as caught:
                    urllib.request.urlopen(url)
                caught.exception.close()
        finally:
            server.shutdown()
            server.server_close()

    def test_forbidden_origin_is_not_retried(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:
            ChunkedSource(self.url + '/forbidden', {})
        caught.exception.close()
        self.assertEqual(len(RangeOrigin.requests), 1)

    def test_streaming_protocols_fall_back_to_yt_dlp(self):
        info = {'requested_formats': [{'protocol': 'm3u8_native', 'url': self.url + '/video'}]}
        self.assertFalse(download_section(info, Path('.'), 0, 10))
        self.assertEqual(RangeOrigin.requests, [])


if __name__ == '__main__':
    unittest.main()
