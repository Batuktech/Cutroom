import argparse
import json
import os
import sys
from pathlib import Path

os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ['OMP_NUM_THREADS'] = '2'

def emit(data):
    print(json.dumps(data, ensure_ascii=False), flush=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['install', 'transcribe', 'reframe', 'check'])
    parser.add_argument('--model', default='tiny')
    parser.add_argument('--models', default='.cutroom/models')
    parser.add_argument('--input')
    parser.add_argument('--output')
    parser.add_argument('--language', default='auto')
    parser.add_argument('--start', type=float, default=0)
    parser.add_argument('--end', type=float, default=30)
    args = parser.parse_args()
    if args.model not in ['tiny', 'base', 'small', 'large-v3']:
        raise ValueError('Unsupported model')
    if args.action == 'check':
        import faster_whisper
        import cv2
        if not hasattr(cv2, 'CascadeClassifier'):
            raise RuntimeError('The installed OpenCV build does not support the face detector. Install scripts/requirements.txt.')
        emit({'ready': True})
    elif args.action == 'install':
        from faster_whisper.utils import download_model
        folder = str(Path(args.models).resolve() / args.model)
        emit({'progress': 10, 'message': 'Downloading the model to this computer'})
        download_model(args.model, output_dir=folder)
        (Path(folder) / '.ready').write_text('installed')
        emit({'progress': 100, 'message': 'Model installed'})
    elif args.action == 'transcribe':
        os.environ['HF_HUB_OFFLINE'] = '1'
        from faster_whisper import WhisperModel
        folder = str(Path(args.models).resolve() / args.model)
        if not all((Path(folder) / name).is_file() for name in ['.ready', 'model.bin', 'config.json', 'tokenizer.json']):
            raise ValueError('The local model is incomplete. Install it again in Studio settings.')
        emit({'progress': 3, 'message': 'Loading local Whisper model'})
        model = WhisperModel(folder, device='cpu', compute_type='int8', cpu_threads=2, num_workers=1, local_files_only=True)
        # Keep the original audio timeline intact; concatenated VAD islands can
        # lose quiet exchanges and produce caption groups spanning long pauses.
        segments, info = model.transcribe(
            args.input,
            beam_size=5,
            language=None if args.language == 'auto' else args.language,
            word_timestamps=True,
            vad_filter=False,
            condition_on_previous_text=False,
        )
        result = []
        import uuid
        for segment in segments:
            result.append({'id': str(uuid.uuid4()), 'start': segment.start, 'end': segment.end, 'text': segment.text.strip(), 'words': [{'start': w.start, 'end': w.end, 'word': w.word} for w in segment.words or []]})
            emit({'progress': min(96, 5 + segment.end / max(info.duration, 1) * 90), 'message': f'Transcribing {int(segment.end)} of {int(info.duration)} seconds'})
        Path(args.output).write_text(json.dumps({
            'segments': result,
            'language': info.language,
            'model': args.model,
            'settings': {'beamSize': 5, 'vadFilter': False, 'wordTimestamps': True},
        }, ensure_ascii=False))
        emit({'progress': 100, 'message': 'Transcript ready'})
    elif args.action == 'reframe':
        import cv2
        import statistics
        detector = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        cap = cv2.VideoCapture(args.input)
        positions = []
        for i in range(7):
            cap.set(cv2.CAP_PROP_POS_MSEC, (args.start + (args.end - args.start) * (i + .5) / 7) * 1000)
            ok, frame = cap.read()
            if not ok:
                continue
            height, width = frame.shape[:2]
            scale = min(1, 640 / width)
            gray = cv2.cvtColor(cv2.resize(frame, (int(width * scale), int(height * scale))), cv2.COLOR_BGR2GRAY)
            faces = detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(25, 25))
            if len(faces):
                x, y, w, h = max(faces, key=lambda face: face[2] * face[3])
                positions.append({'x': (x + w / 2) / gray.shape[1] * 100, 'y': (y + h / 2) / gray.shape[0] * 100})
            emit({'progress': (i + 1) / 7 * 95, 'message': 'Looking for a face in sampled frames'})
        cap.release()
        result = {'found': bool(positions), 'centerX': statistics.median(p['x'] for p in positions) if positions else 50, 'centerY': statistics.median(p['y'] for p in positions) if positions else 50, 'samples': len(positions)}
        Path(args.output).write_text(json.dumps(result))
        emit({'progress': 100, 'message': 'Framing suggestion ready'})

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
