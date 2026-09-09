# Third-party notices

Cutroom's original application code is under [MIT](LICENSE). That license does not replace licenses attached to fonts, dependencies, separately downloaded models, or system tools. The files below retain their notices.

## Included assets

- **Manrope Bold**: copyright the Manrope Project Authors, SIL Open Font License 1.1. Full license: [public/fonts/OFL.txt](public/fonts/OFL.txt). The design concept also includes [its Manrope notice](opendesign/design-systems/cutroom/fonts/OFL-Manrope.txt).
- **Noto Sans Bold**: copyright Google and contributors, SIL Open Font License 1.1. Full license: [public/fonts/OFL-Noto.txt](public/fonts/OFL-Noto.txt).
- **Synthetic demo**: original Cutroom text and motion-card artwork. Speech was generated locally using FFmpeg's Flite `slt` voice. No third-party video footage or personal recording is included. See [demo provenance](public/demo/README.txt) and [generation script](scripts/create_demo.py). Regeneration uses system FFmpeg/Flite and DejaVu fonts under their respective licenses.

## Installed dependencies and tools

React, Vite, Express, Radix, Motion, Lucide, Zod, and other JavaScript dependencies are installed from the committed npm lockfile. Fontsource supplies Manrope/Fraunces web fonts under the upstream font licenses. Consult each installed package's license before redistributing a bundled build. The shadcn registry configuration is a development aid; it does not install or grant a license to registry components.

The optional Python requirements include faster-whisper, OpenCV, yt-dlp, and their transitive dependencies. FFmpeg/FFprobe, Python, Node, and GPU drivers are external system dependencies and are not distributed in this repository. FFmpeg build options can affect its redistribution requirements. Review upstream terms when packaging binaries.

The former copied React Bits counter is not included in this public source import. Its project count uses ordinary React rendering; no React Bits component code is redistributed.

## Downloaded models

Whisper models are obtained separately through faster-whisper. Consult the selected model's upstream card and license. Qwen3-8B GGUF is downloaded separately from the [official Qwen repository](https://huggingface.co/Qwen/Qwen3-8B-GGUF), which identifies Apache-2.0 licensing. The application does not embed or relicense model weights. See [Qwen setup](docs/qwen-setup.md) for the pinned reference and file checksum.

Imported recordings and subtitles remain subject to their owners' rights. Publishing this editor does not grant permission to download, edit, or redistribute someone else's footage.
