# Optional Qwen3-8B setup

The clip analyzer uses Qwen3-8B Q4_K_M GGUF through llama-cpp-python. This is separate from Whisper. Model weights are not included in Git and there is no paid inference API.

The current worker is specific to **Linux with NVIDIA monitoring and Vulkan acceleration**. It reads `/proc/meminfo`, calls `nvidia-smi`, and uses a fixed 24-layer GPU preset. AMD, Apple Silicon, Windows, multi-GPU selection, and CPU-only Qwen are not supported by this integration as shipped.

## Runtime

You need a working NVIDIA driver, `nvidia-smi`, Vulkan development tools, Python venv support, a C/C++ compiler, and CMake. On Ubuntu the relevant build packages typically include `build-essential`, `cmake`, `ninja-build`, `libvulkan-dev`, `glslc`, and `vulkan-tools`. Check your distribution before installing them. These instructions do not change drivers.

```sh
python3 -m venv .venv-qwen
CMAKE_ARGS="-DGGML_VULKAN=ON" .venv-qwen/bin/python -m pip install --no-binary=llama-cpp-python -r scripts/requirements-qwen.txt
```

The project pins the tested runtime version. Build support comes from [llama-cpp-python's Vulkan installation instructions](https://llama-cpp-python.readthedocs.io/en/latest/#supported-backends). The source build can take time and needs free disk/RAM; it is not part of normal installation or CI.

## Model

Download `Qwen3-8B-Q4_K_M.gguf` from the [official Qwen GGUF repository](https://huggingface.co/Qwen/Qwen3-8B-GGUF). Place it at `models/qwen3-8b/Qwen3-8B-Q4_K_M.gguf` inside your configured data directory; by default this is `.cutroom/models/qwen3-8b/`.

The verified upstream revision is `7c41481f57cb95916b40956ab2f0b139b296d974`. Its file is 5,027,783,488 bytes and has SHA-256:

```text
d98cdcbd03e17ce47681435b5150e34c1417f50b5c0019dd560e4882c5745785
```

Use the model's Apache-2.0 license and model card from that upstream repository. Do not add the weights to Git.

## Device and readiness

Inspect `vulkaninfo --summary` and `nvidia-smi`. Set `CUTROOM_VULKAN_DEVICE` in `.env` to the NVIDIA Vulkan physical device index. The default `1` reflects the tested hybrid-GPU laptop and may be wrong for your computer. Memory monitoring reads the first NVIDIA GPU; do not use the preset on a multi-NVIDIA system without adapting device selection and monitoring together.

```sh
npm run doctor
```

Restart the studio after installing the runtime/model. A missing runtime or model disables Local AI review and keeps fast rules available. Before starting inference, the worker requires approximately 3 GB available system RAM and 3.8 GB free GPU memory. It uses two CPU threads, 2,048 context tokens, lower process priority, and unloads afterward. Repeated low-memory readings stop the job. Other apps can still compete for resources.

The original working installation was tested on an RTX 3060 Laptop GPU with 6 GB VRAM and about 16 GB RAM. These generic build instructions have not been validated on every distribution or GPU. See [usage](ai-suggestions.md), [testing](testing.md), and [the bounded performance trial](qwen-trial.md).
