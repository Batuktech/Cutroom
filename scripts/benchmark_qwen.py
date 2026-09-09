import argparse
import json
import os
import signal
import subprocess
import time
import urllib.request
from pathlib import Path


def memory():
    values = {}
    for line in Path('/proc/meminfo').read_text().splitlines():
        key, value = line.split(':', 1)
        values[key] = int(value.split()[0])
    swap_io = dict(line.split() for line in Path('/proc/vmstat').read_text().splitlines() if line.startswith(('pswpin ', 'pswpout ')))
    return {'availableMiB': values['MemAvailable'] / 1024,
            'swapUsedMiB': (values['SwapTotal'] - values['SwapFree']) / 1024,
            'swapInPages': int(swap_io['pswpin']), 'swapOutPages': int(swap_io['pswpout'])}


def gpu():
    result = subprocess.run(['nvidia-smi', '--query-gpu=memory.used,memory.free,utilization.gpu',
                             '--format=csv,noheader,nounits'], capture_output=True, text=True, timeout=5)
    used, free, utilization = map(int, result.stdout.strip().splitlines()[0].split(','))
    return {'usedMiB': used, 'freeMiB': free, 'utilization': utilization}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--layers', type=int, default=24)
    parser.add_argument('--input', required=True, type=Path, help='JSON file containing a segments array; use permission-cleared text.')
    parser.add_argument('--model', type=Path, default=Path('.cutroom/models/qwen3-8b/Qwen3-8B-Q4_K_M.gguf'))
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    output = root / 'output/qwen-check' / f'layers-{args.layers}'
    output.mkdir(parents=True, exist_ok=True)
    before = {'memory': memory(), 'gpu': gpu()}
    if not args.input.is_file() or not args.model.is_file():
        parser.error('The input transcript and model must both exist.')
    environment = {**os.environ, 'GGML_VK_VISIBLE_DEVICES': os.environ.get('CUTROOM_VULKAN_DEVICE', '1'), 'OMP_NUM_THREADS': '2', 'OPENBLAS_NUM_THREADS': '2'}
    with (output / 'worker.log').open('w') as log:
        worker = subprocess.Popen([
            'nice', '-n', '10', str(root / '.venv-qwen/bin/python'), str(root / 'scripts/qwen_trial.py'),
            '--model', str(args.model.resolve()),
            '--input', str(args.input.resolve()),
            '--output', str(output / 'result.json'), '--layers', str(args.layers),
        ], cwd=root, env=environment, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        print(json.dumps({'pid': worker.pid, 'before': before}), flush=True)
        started = time.monotonic()
        samples = []
        stopped = None
        pressure = 0
        while worker.poll() is None:
            sample = {'elapsed': time.monotonic() - started, 'memory': memory(), 'gpu': gpu()}
            try:
                status = Path(f'/proc/{worker.pid}/status').read_text().splitlines()
                sample['processRssMiB'] = next(int(line.split()[1])/1024 for line in status if line.startswith('VmRSS:'))
            except (FileNotFoundError, StopIteration):
                pass
            try:
                request_start = time.monotonic()
                with urllib.request.urlopen('http://127.0.0.1:4318/api/health', timeout=3) as response:
                    response.read()
                sample['studioResponseMs'] = (time.monotonic()-request_start)*1000
            except OSError:
                sample['studioResponseFailed'] = True
            samples.append(sample)
            pressure = pressure + 1 if sample['memory']['availableMiB'] < 512 or sample['gpu']['freeMiB'] < 256 else 0
            if pressure >= 3 or sample['elapsed'] > 600:
                stopped = 'Memory pressure' if pressure >= 3 else 'Ten-minute trial limit'
                os.killpg(worker.pid, signal.SIGTERM)
                try:
                    worker.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(worker.pid, signal.SIGKILL)
                break
            time.sleep(1)
        code = worker.wait()
    time.sleep(2)
    report = {'exitCode': code, 'stopped': stopped, 'before': before,
              'after': {'memory': memory(), 'gpu': gpu()}, 'samples': samples}
    (output / 'resources.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({'exitCode': code, 'stopped': stopped, 'evidence': str(output)}), flush=True)
    raise SystemExit(code != 0)


if __name__ == '__main__':
    main()
