import contextlib
import io
import json
import re
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch
import suggest_worker


class FakeModel:
    prompts = []
    closed = False

    def __init__(self, **kwargs):
        pass

    def tokenize(self, text, **kwargs):
        return text.split()

    def __call__(self, prompt, **kwargs):
        self.prompts.append(prompt)
        if 'Review this passage' in prompt:
            first, last = map(int, re.search(r'Original proposal \[(\d+),(\d+)\]', prompt).groups())
            data = {'first': first, 'last': last, 'context': False, 'ending': False, 'appeal': True, 'clarity': True,
                    'reason': 'An amusing comeback worth previewing.', 'weakness': 'Needs the earlier setup.',
                    'assessment': {'scores': {'hook': 2, 'payoff': 2, 'clarity': 2, 'novelty': 2, 'emotion': 2, 'value': 1},
                                   'anchors': {'hook': first, 'peak': first, 'payoff': last, 'contrast': -1}}}
        else:
            data = {'candidates': [{'first': i, 'last': i, 'title': f'Moment {i}',
                    'reason': 'A specific exchange worth watching.', 'weakness': 'Check the delivery.', 'strength': 2} for i in range(2)]}
        return {'choices': [{'text': json.dumps(data), 'finish_reason': 'stop'}]}

    def close(self):
        FakeModel.closed = True


class ReviewModesTest(unittest.TestCase):
    def run_mode(self, mode, count=25):
        FakeModel.prompts = []
        FakeModel.closed = False
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            data = {'segments': [{'start': i*30, 'end': i*30+20, 'text': ['He lost the bet and challenged his friend to double the stakes.', 'She answered the awkward question with a perfectly timed sarcastic comeback.'][i]} for i in range(2)],
                    'maxDuration': 100, 'interests': ['funny', 'reactions'], 'guidance': 'Focus on awkward comebacks.', 'strictness': mode, 'count': count}
            (folder/'input.json').write_text(json.dumps(data))
            runtime = types.SimpleNamespace(Llama=FakeModel, LlamaGrammar=types.SimpleNamespace(from_json_schema=lambda *a, **k: None))
            output = io.StringIO()
            with patch.dict('sys.modules', {'llama_cpp': runtime}), patch.object(suggest_worker, 'resources', return_value=(6000, 5400)), patch.object(suggest_worker, 'watchdog'), patch.object(suggest_worker.os, 'nice'), contextlib.redirect_stdout(output):
                suggest_worker.analyze(types.SimpleNamespace(model='fixture', input=folder/'input.json', output=folder/'output.json'))
            result = json.loads((folder/'output.json').read_text())
            checkpoints = [json.loads(line)['checkpoint'] for line in output.getvalue().splitlines() if 'checkpoint' in json.loads(line)]
        self.assertTrue(FakeModel.closed)
        self.assertIn('match ANY of:', FakeModel.prompts[0])
        self.assertIn('Focus on awkward comebacks.', FakeModel.prompts[0])
        return result, checkpoints

    def test_discovery_keeps_proposals_without_a_second_rejection_pass(self):
        result, checkpoints = self.run_mode('discovery')
        self.assertEqual(len(FakeModel.prompts), 1)
        self.assertEqual(len(result['candidates']), 2)
        self.assertEqual(result['reviewed'], 0)
        self.assertFalse(checkpoints[0]['complete'])
        self.assertTrue(result['complete'])

    def test_reviewed_retains_uncertain_choices_and_their_specific_concerns(self):
        result, checkpoints = self.run_mode('reviewed')
        self.assertEqual(len(FakeModel.prompts), 3)
        self.assertEqual(len(result['candidates']), 2)
        self.assertTrue(all(c['verdict'] == 'needs-review' and 'Needs earlier context' in c['weakness'] for c in result['candidates']))
        self.assertEqual([len(c['candidates']) for c in checkpoints], [2, 2, 2])

    def test_strict_records_rejections_instead_of_leaving_an_unexplained_zero(self):
        result, checkpoints = self.run_mode('strict')
        self.assertEqual(result['candidates'], [])
        self.assertEqual(result['diagnostics']['rejected'], 2)
        self.assertEqual(result['diagnostics']['reasons']['Needs earlier context'], 2)
        self.assertTrue(all(c['candidates'] == [] for c in checkpoints))

    def test_review_does_not_stop_at_the_first_acceptable_candidate(self):
        original = FakeModel.__call__

        def scored(model, prompt, **kwargs):
            response = original(model, prompt, **kwargs)
            if 'Review this passage' in prompt:
                data = json.loads(response['choices'][0]['text'])
                data.update(context=True, ending=True, appeal=True, clarity=True)
                value = 4 if data['first'] == 1 else 1
                data['assessment']['scores'] = {k: value for k in data['assessment']['scores']}
                response['choices'][0]['text'] = json.dumps(data)
            return response

        with patch.object(FakeModel, '__call__', scored):
            result, _ = self.run_mode('reviewed', count=1)
        self.assertEqual(result['reviewed'], 2)
        self.assertEqual(len(result['candidates']), 1)
        self.assertEqual(result['candidates'][0]['first'], 1)

    def test_invalid_boundary_review_never_relocates_a_moment(self):
        original = FakeModel.__call__

        def relocated(model, prompt, **kwargs):
            response = original(model, prompt, **kwargs)
            if 'Original proposal [0,0]' in prompt:
                data = json.loads(response['choices'][0]['text'])
                data.update(first=1, last=1, context=True, ending=True, appeal=True, clarity=True)
                data['assessment']['anchors'].update(hook=1, peak=1, payoff=1)
                response['choices'][0]['text'] = json.dumps(data)
            return response

        with patch.object(FakeModel, '__call__', relocated):
            result, _ = self.run_mode('reviewed')
        retained = next(c for c in result['candidates'] if c['first'] == 0)
        self.assertEqual(retained['last'], 0)
        self.assertEqual(retained['verdict'], 'needs-review')
        self.assertIn('original range kept', retained['weakness'])
        self.assertNotIn('assessment', retained)


if __name__ == '__main__':
    unittest.main()
