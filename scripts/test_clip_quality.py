import json
import unittest
from pathlib import Path
from clip_quality import normalized_scores, quality, review_context


class ClipQualityTest(unittest.TestCase):
    def setUp(self):
        self.segments = [{'start': i * 3, 'end': i * 3 + 3, 'text': f'Synthetic evidence for segment {i}.'} for i in range(10)]
        self.fixtures = json.loads((Path(__file__).resolve().parent.parent / 'shared' / 'clip-quality-fixtures.json').read_text())

    def test_matches_typescript_scoring_on_shared_fixtures(self):
        for fixture in self.fixtures:
            with self.subTest(fixture['name']):
                self.assertEqual(quality({'first': 0, 'last': 2, 'assessment': fixture}, self.segments), fixture['total'])

    def test_invalid_evidence_and_boolean_scores_are_rejected(self):
        value = self.fixtures[0]
        self.assertIsNone(normalized_scores({**value, 'anchors': {**value['anchors'], 'peak': 99}}, 0, 2, self.segments))
        self.assertIsNone(normalized_scores({**value, 'scores': {**value['scores'], 'hook': True}}, 0, 2, self.segments))

    def test_context_is_indexed_and_keeps_the_original_range(self):
        candidate = {'first': 2, 'last': 4}
        first, last, text = review_context(candidate, self.segments, len, 1000)
        self.assertEqual((first, last), (0, 6))
        self.assertIn('[2] 6.00-9.00:', text)
        first, last, _ = review_context(candidate, self.segments, len, 1)
        self.assertEqual((first, last), (2, 4))


if __name__ == '__main__':
    unittest.main()
