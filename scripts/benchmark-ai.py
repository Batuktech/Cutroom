import json
import re
import subprocess
import time
from pathlib import Path

root = Path(__file__).resolve().parent.parent
output = root / 'output' / 'ai-benchmark'
output.mkdir(parents=True, exist_ok=True)
reference = ' '.join(line for line in (root / 'public/demo/studio-session.srt').read_text().splitlines() if line.strip() and not line.strip().isdigit() and '-->' not in line)

def words(text):
    return re.findall(r"[a-z]+", text.lower())

def distance(reference, hypothesis):
    row = list(range(len(hypothesis) + 1))
    for index, word in enumerate(reference, 1):
        current = [index]
        for position, candidate in enumerate(hypothesis, 1):
            current.append(min(current[-1] + 1, row[position] + 1, row[position - 1] + (word != candidate)))
        row = current
    return row[-1]

results = []
for model in ['tiny', 'base', 'small']:
    if not (root / '.cutroom/models' / model / '.ready').exists():
        continue
    target = output / f'{model}.json'
    started = time.perf_counter()
    result = subprocess.run([str(root / '.venv/bin/python'), str(root / 'scripts/ai_worker.py'), 'transcribe', '--model', model, '--models', str(root / '.cutroom/models'), '--input', str(root / 'public/demo/studio-session.mp4'), '--output', str(target), '--language', 'en'], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    seconds = time.perf_counter() - started
    transcript = json.loads(target.read_text())
    hypothesis = ' '.join(segment['text'] for segment in transcript['segments'])
    errors = distance(words(reference), words(hypothesis))
    measurement = {'model': model, 'seconds': round(seconds, 2), 'referenceWords': len(words(reference)), 'wordErrors': errors, 'wordErrorRate': round(errors / len(words(reference)), 4), 'segments': len(transcript['segments'])}
    results.append(measurement)
    print(json.dumps(measurement), flush=True)
(output / 'report.json').write_text(json.dumps({'sample': 'Original 40.69-second English synthetic narration. This is a functional comparison, not a general accuracy benchmark.', 'results': results}, indent=2))
