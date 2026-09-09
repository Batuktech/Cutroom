import unittest
from suggest_logic import valid, windows, shortlist, ground, rejection


class SuggestionLogicTest(unittest.TestCase):
    def setUp(self):
        self.segments = [{'start': i*5, 'end': (i+1)*5, 'text': f'This is sentence number {i} with enough words to explain the point.'} for i in range(40)]
        self.candidate = {'first': 0, 'last': 4, 'quote': 'This is sentence number 0', 'strength': 2}

    def test_every_segment_is_covered_and_sections_overlap(self):
        sections = windows(self.segments, lambda text: len(text.split()), 110)
        covered = {index for first, end, _ in sections for index in range(first, end)}
        self.assertEqual(covered, set(range(40)))
        self.assertTrue(all(b[0] < a[1] for a, b in zip(sections, sections[1:])))
        self.assertTrue(all(len(text.split()) <= 110 for _, _, text in sections))

    def test_long_single_subtitle_fails_without_skipping_it(self):
        with self.assertRaisesRegex(ValueError, 'too long'):
            windows([{'start': 0, 'end': 10, 'text': 'word '*100}], lambda text: len(text.split()), 20)

    def test_fragments_gaps_invented_quotes_and_reversed_ranges_are_rejected(self):
        self.assertTrue(valid(self.candidate, self.segments, 35))
        for changed in [{'last': 0}, {'first': 5}, {'quote': 'fabricated transcript words'}]:
            self.assertFalse(valid({**self.candidate, **changed}, self.segments, 35, minimum=10))
        self.segments[2]['start'] = 15
        self.assertFalse(valid(self.candidate, self.segments, 35, max_pause=4))

    def test_shortlist_deduplicates_overlapping_ranges(self):
        self.assertEqual(len(shortlist([self.candidate, {**self.candidate, 'last': 5}], self.segments, 35)), 1)

    def test_maximum_never_imposes_a_proportional_minimum(self):
        self.assertTrue(valid(self.candidate, self.segments, 100))
        self.assertFalse(valid(self.candidate, self.segments, 20))
        self.assertEqual(rejection(self.candidate, self.segments, 20), 'Outside duration limits')

    def test_oversized_proposal_snaps_to_a_source_boundary_and_copies_evidence(self):
        candidate = {**self.candidate, 'last': 15, 'title': 'A test title', 'reason': 'An example', 'weakness': ''}
        selected = ground(candidate, self.segments, 0, 40, 20)
        self.assertEqual(selected['last'], 3)
        self.assertIn('Trimmed', selected['weakness'])
        self.assertIn(selected['quote'], ' '.join(s['text'] for s in self.segments[:4]))
        self.assertTrue(valid(selected, self.segments, 20))
        self.assertIsNone(ground(candidate, self.segments, 20, 40, 100))


if __name__ == '__main__':
    unittest.main()
