# Qwen performance notes

An initial bounded trial used an Intel i5-12500H, approximately 16 GB RAM, and an RTX 3060 Laptop GPU with 6 GB VRAM. The Q4_K_M model ran with llama-cpp-python 0.3.35 and Vulkan. Private transcript excerpts and raw resource logs are intentionally excluded from this repository.

| Setting | 24 GPU layers | 30 GPU layers |
| --- | ---: | ---: |
| Model initialization | 33.6 s | 34.1 s |
| Excerpt analysis | 48.6 s | 30.3 s |
| Total | 82.2 s | 64.3 s |
| Peak total GPU memory | 3,677 MiB | 4,373 MiB |

These are historical development measurements on one short transcript, not independently reproduced public benchmarks. GPU figures include other applications. They do not establish full-video completion time, browser smoothness, transcription quality, or viral potential. The app currently uses 24 layers for more resource headroom.

## Reproduce with your own permission-cleared excerpt

Install [Qwen](qwen-setup.md). Prepare a small JSON object with a `segments` array containing timed text and use an idle GPU:

```sh
.venv-qwen/bin/python scripts/benchmark_qwen.py --input /path/to/excerpt.json --layers 24
```

Use `--model` for a nondefault GGUF path and `CUTROOM_VULKAN_DEVICE` for the correct device. This Python command does not load `.env` automatically. Reports are written under `output/qwen-check/layers-24/` and replace earlier reports for the same layer count. They may contain transcript text; keep them out of Git. The ten-minute monitor stops on repeated low memory and only signals its own inference process.

The trial prompt differs from the production selector. For actual app behavior, use [the optional API tests](testing.md) and inspect [AI review limitations](ai-suggestions.md).
