# Install Cutroom

Ubuntu/Linux is the tested platform. Windows and macOS are not verified end to end; Python executable paths and Qwen monitoring currently assume Linux. A GPU is optional for the studio and Whisper, but required by the current Qwen integration.

## Core studio

Install Node 22.12+ (the `.nvmrc` selects Node 22), npm, and FFmpeg/FFprobe with libass and libx264. On Ubuntu, the system package for the media tools is `ffmpeg`.

```sh
git clone https://github.com/Batuktech/Cutroom.git
cd Cutroom
npm ci
npm run build
npm run doctor
npm start
```

Open **http://127.0.0.1:4318**. Stop with Ctrl+C. Manual clipping, the synthetic sample, SRT/VTT import, and MP4 rendering work without Python or AI weights.

To develop, use `npm run dev` instead of `npm start`; the UI is on port 5173 and API on 4318. Do not run both against the same port/data directory. After source changes, rebuild before `npm start`.

## Optional speech recognition and YouTube import

Install Python 3.10+ and venv support (`python3` and `python3-venv` on Ubuntu), then:

```sh
npm run setup:ai
```

This creates `.venv/` and installs the pinned requirements from PyPI. It does not install system packages or download speech weights. Restart the studio. For transcription, open **Studio settings → Speech models → Install model**. Choose Tiny, Base, Small, or Large v3; downloads go into the configured data directory. The transcription dialog defaults to the largest installed model. Review accuracy and resource use before starting a long recording.

YouTube import uses the same environment, yt-dlp, FFmpeg, and the Node runtime. It needs an internet connection and supports public finished videos subject to source availability. No browser cookies or account sign-in are used.

## Optional local clip analysis

Qwen uses a separate environment and approximately 5 GB of weights. The current preset targets Linux/NVIDIA/Vulkan and is not a universal installer. Follow [Qwen setup](qwen-setup.md). Fast transcript rules and manual clipping remain available without it.

## Configuration and storage

Copy `.env.example` to `.env` only when overriding defaults. `CUTROOM_PORT` changes the local API port; `CUTROOM_DATA_DIR` changes the storage directory. Both development and normal startup read `.env`. The development UI remains on port 5173. See [configuration](configuration.md) and [privacy/storage](privacy.md).

Keep `.env`, environments, models, and user data out of Git. `npm run doctor` reports required tools and optional features separately. No models or Python environments ship in this source repository. See [troubleshooting](troubleshooting.md) for startup and media issues.
