import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent.parent
folder = root / 'public' / 'demo'
folder.mkdir(parents=True, exist_ok=True)
lines = [
    'Here is a simple way to make a better short video. Start with one useful idea. Not five ideas. Just one thing your viewer can use today.',
    'The first sentence matters. Tell people what they will learn. Then show them. A clear example is better than a long introduction.',
    'Keep the parts that move the story forward. Leave a little room to breathe. Captions help people follow along when the sound is off.',
    'Before you export, watch it once on a small screen. Can you read the words? Is the subject in frame? Does the ending give people a next step?',
    'You do not need a perfect setup to make something useful. Record an idea, make a thoughtful cut, and share what you know.'
]
font = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
bold = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
segments = []
clock = 0
for i, line in enumerate(lines):
    speech = folder / f'voice-{i}.txt'
    speech.write_text(line)
    audio = folder / f'voice-{i}.wav'
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', f'flite=textfile={speech}:voice=slt', '-y', str(audio)], check=True)
    duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(audio)]).decode().strip()) + .5
    headings = [('ONE USEFUL', 'IDEA.'), ('MAKE THE', 'OPENING COUNT.'), ('FIND YOUR', 'RHYTHM.'), ('WATCH IT', 'SMALL.'), ('MAKE IT.', 'SHARE IT.')]
    a, b = headings[i]
    color = ['0xd6f58a', '0xebddbb', '0xaecbc5', '0xc4b8df', '0xd6f58a'][i]
    fg = '0x192017'
    filters = f"drawbox=x=74:y=70:w=8:h=35:color={fg}:t=fill,drawtext=fontfile={bold}:text='CUTROOM  /  FIELD NOTES':fontsize=21:fontcolor={fg}:x=100:y=74,drawtext=fontfile={bold}:text='{a}':fontsize=73:fontcolor={fg}:x=74:y=235,drawtext=fontfile={bold}:text='{b}':fontsize=73:fontcolor={fg}:x=74:y=323,drawtext=fontfile={font}:text='A small idea, well told.':fontsize=27:fontcolor={fg}:x=80:y=459,drawtext=fontfile={font}:text='ORIGINAL DEMO  ·  0{i+1} / 05':fontsize=18:fontcolor={fg}:x=80:y=627,drawbox=x=880:y=180:w=260:h=340:color={fg}:t=3,drawbox=x=910:y=210:w=200:h=280:color={fg}:t=2,drawtext=fontfile={bold}:text='0{i+1}':fontsize=104:fontcolor={fg}:x=935:y=290"
    video = folder / f'part-{i}.mp4'
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', f'color=c={color}:s=1280x720:r=25:d={duration}', '-i', str(audio), '-vf', filters, '-af', 'apad', '-t', str(duration), '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', str(video)], check=True)
    sentences = [s.strip() + '.' for s in line.split('.') if s.strip()]
    weights = [len(s) for s in sentences]
    total = sum(weights)
    offset = 0
    for sentence, weight in zip(sentences, weights):
        d = (duration - .5) * weight / total
        segments.append({'start': clock + offset, 'end': clock + offset + d, 'text': sentence})
        offset += d
    clock += duration
    print(f'Created demo scene {i+1}/5', flush=True)
listing = folder / 'concat.txt'
listing.write_text('\n'.join(f"file '{folder / f'part-{i}.mp4'}'" for i in range(len(lines))))
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', str(listing), '-c', 'copy', '-movflags', '+faststart', '-y', str(folder / 'studio-session.mp4')], check=True)
def timestamp(s):
    ms = round(s * 1000)
    return f'{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}'
(folder / 'studio-session.srt').write_text('\n\n'.join(f"{i+1}\n{timestamp(s['start'])} --> {timestamp(s['end'])}\n{s['text']}" for i, s in enumerate(segments)))
(folder / 'studio-session.transcript.json').unlink(missing_ok=True)
(folder / 'README.txt').write_text('Original Cutroom demonstration. Text and motion-card artwork created for this app. Speech synthesized locally with FFmpeg flite (slt voice). Timing in the bundled SRT is approximate; run local Whisper to generate measured timings. No third-party video footage.\n')
for i in range(len(lines)):
    for suffix in [f'voice-{i}.txt', f'voice-{i}.wav', f'part-{i}.mp4']:
        (folder / suffix).unlink(missing_ok=True)
listing.unlink(missing_ok=True)
print(json.dumps({'duration': clock, 'file': str(folder / 'studio-session.mp4')}))
