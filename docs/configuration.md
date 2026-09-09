# Configuration

Run all commands from the checkout root. Copy [.env.example](../.env.example) to `.env` for overrides; no API keys are required.

| Variable | Default | Meaning |
| --- | --- | --- |
| `CUTROOM_PORT` | `4318` | Loopback API and built UI port. |
| `CUTROOM_DATA_DIR` | `.cutroom` | Project metadata, copied media, exports, history, and downloaded models. Relative paths resolve from the working directory. |
| `CUTROOM_VULKAN_DEVICE` | `1` | Vulkan physical device index used by the Qwen worker. Hardware-specific; check [Qwen setup](qwen-setup.md). |

The API intentionally binds to `127.0.0.1`; there is no public-host setting. Development uses a Vite UI on 5173 with an API proxy. Start one server per data directory. Stop processing before moving storage or restarting.

Python environments live at `.venv/` and `.venv-qwen/` in the checkout even when data is elsewhere. Tests use their own `output/` directories and ports. Some opt-in benchmarks assume models under the default `.cutroom/models`; see [testing](testing.md).

Changing creation defaults does not migrate saved clips. New clips use Highlight captions and a 16:9 frame. Clip-specific frame, caption style, color, and pacing are saved with each clip.
