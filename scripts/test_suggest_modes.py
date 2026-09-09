import contextlib
import io
import json
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
            data = {'standalone': False, 'complete': False, 'interesting': True, 'faithful': True,
                    'reason': 'An amusing comeback worth previewing.', 'weakness': 'Needs the earlier setup.'}
        else:
            data = {'candidates': [{'first': i, 'last': i, 'title': f'Moment {i}',
                    'reason': 'A specific exchange worth watching.', 'weakness': 'Check the delivery.', 'strength': 2} for i in range(2)]}
        return {'choices': [{'text': json.dumps(data), 'finish_reason': 'stop'}]}

    def close(self):
        FakeModel.closed = True


class ReviewModesTest(unittest.TestCase):
    def run_mode(self, mode):
        FakeModel.prompts = []
        FakeModel.closed = False
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            data = {'segments': [{'start': i*30, 'end': i*30+20, 'text': ['He lost the bet and challenged his friend to double the stakes.', 'She answered the awkward question with a perfectly timed sarcastic comeback.'][i]} for i in range(2)],
                    'maxDuration': 100, 'interests': ['funny', 'reactions'], 'guidance': 'Focus on awkward comebacks.', 'strictness': mode}
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


if __name__ == '__main__':
    unittest.main()
