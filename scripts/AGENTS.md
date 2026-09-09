# Worker and tooling guidance

Follow the root [AGENTS.md](../AGENTS.md). Python workers emit JSON progress on stdout and errors on stderr; preserve those contracts. Keep CPU/thread limits, subprocess cancellation, and offline model loading.

Qwen currently requires Linux, NVIDIA memory monitoring, and a Vulkan-enabled runtime. Do not imply universal GPU/CPU support. Whisper runs on CPU. Model downloads, YouTube network checks, and real GPU inference are opt-in operations, separate from ordinary CI.

Use `python3 -m unittest discover -s scripts -p 'test_*.py'` for the standard-library worker tests. Test scripts must create isolated output directories and stop only their own processes. Do not include real project IDs or transcripts in committed fixtures.
