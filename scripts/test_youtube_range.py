import unittest
from youtube_worker import validate_source, MAX_BYTES


class ReplayPolicyTest(unittest.TestCase):
    def test_finished_long_replay_allows_only_a_bounded_range(self):
        info = {'duration': 43200, 'live_status': 'was_live', 'filesize': MAX_BYTES * 12}
        self.assertIn('longer than 3 hours', validate_source(info))
        self.assertIsNone(validate_source(info, 7200, 9000))

    def test_live_upcoming_processing_and_outside_source_are_rejected(self):
        for state in ['is_live', 'is_upcoming', 'post_live']:
            self.assertIn('finished processing', validate_source({'live_status': state}, 0, 30))
        self.assertIn('outside', validate_source({'duration': 60}, 30, 61))
        self.assertIn('outside', validate_source({'duration': 60}, 60, 90))
        self.assertIsNone(validate_source({'duration': 60}, 30, 60))


if __name__ == '__main__':
    unittest.main()
