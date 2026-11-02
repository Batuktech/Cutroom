import unittest

import ai_worker


class WorkerThreadsTest(unittest.TestCase):
    def test_uses_half_the_cores_between_two_and_eight(self):
        self.assertEqual(ai_worker.worker_threads(16), 8)
        self.assertEqual(ai_worker.worker_threads(32), 8)
        self.assertEqual(ai_worker.worker_threads(8), 4)
        self.assertEqual(ai_worker.worker_threads(2), 2)
        self.assertEqual(ai_worker.worker_threads(0), 2)


class CudaLibrariesTest(unittest.TestCase):
    def test_cpu_choice_never_restarts_the_worker(self):
        import os
        previous = os.environ.get('CUTROOM_WHISPER_DEVICE')
        os.environ['CUTROOM_WHISPER_DEVICE'] = 'cpu'
        try:
            ai_worker.ensure_cuda_libraries()  # Would os.execv and end this process if it restarted.
        finally:
            if previous is None:
                os.environ.pop('CUTROOM_WHISPER_DEVICE')
            else:
                os.environ['CUTROOM_WHISPER_DEVICE'] = previous


if __name__ == '__main__':
    unittest.main()
