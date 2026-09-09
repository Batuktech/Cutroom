# Testing

Use a checkout with `npm ci`. Never use the live media library as a fixture or stop an unrelated running job.

## Ordinary checks

```sh
npm run lint
npm run typecheck
npm test
npm run test:python
npm run check:docs
npm run build
```

TypeScript tests use Vitest. Python tests use Python 3's standard library, mock inference where needed, and require no model downloads or GPU. The documentation check verifies relative file links, not external URLs or heading anchors. CI runs these checks on Ubuntu with Node 22 and 24, plus an isolated caption-render job.

## Optional suites

| Command | Prerequisites and scope |
| --- | --- |
| `npm run test:captions` | FFmpeg/FFprobe; uses the bundled sample, synthetic word timings, and port 4326. No AI environment required. Checks actual MP4/SRT output. |
| `npm run test:integration` | FFmpeg, `.venv`, all pinned Python dependencies, Tiny installed at `.cutroom/models/tiny`, port 4320. Runs real transcription/rendering and API persistence/cancellation checks. |
| `npm run test:youtube` | `.venv`, FFmpeg, internet access, port 4323. Downloads a public test video and tests range import/deletion. YouTube availability can change. |
| `npm run test:qwen` | [Qwen runtime and model](qwen-setup.md), FFmpeg, idle compatible GPU, port 4324. Tests real inference, persistence, acceptance, stale edits, and cancellation. |
| `node scripts/qwen-partial-integration.mjs PROJECT_ID` | Explicitly reads the first four minutes of that local project's transcript from port 4318, copies it into isolated data, and uses port 4328. Tests live checkpoints and cancellation. Reports contain transcript excerpts; keep them private. |

For full integration, install Tiny through Studio settings or run `.venv/bin/python scripts/ai_worker.py install --model tiny --models .cutroom/models`. This is an explicit network download. Do not run Qwen tests while a studio inference job is active. Benchmarks assume default storage paths unless their arguments say otherwise.

Every integration suite uses a separate `output/` directory and stops its own test server. It can still consume CPU/GPU, memory, and disk. Inspect prerequisites before running; a missing optional model is not a reason to download it silently. Generated reports, screenshots, and transcripts are ignored by Git.

## UI verification

Use the original synthetic demo, desktop and 320/390px views, keyboard focus, loading/error/empty states, and reduced motion. For captions, inspect both preview and rendered output at the same source time. Automated accessibility scans complement manual checks; they do not establish complete accessibility compliance.

See [verification](verification.md) for release checks and their limits. Do not infer general transcription accuracy or viral potential from a passing integration test.
