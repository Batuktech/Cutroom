# Changelog

## Unreleased

- Optional API keys for 16 providers (including GLM, Kimi, Gemini, DeepSeek, OpenAI, Anthropic, and OpenRouter) plus custom OpenAI-compatible endpoints for clip suggestions, with local Qwen remaining the default.
- Provider-specific JSON modes, explicit format selection, visible destinations, and environment-key names.
- Per-analysis transcript-sharing confirmation, editable model IDs, request caps, partial results, and reported token usage.
- Session-only key management, optional environment keys, cancellation, and provider-error redaction.
- Cloud setup/billing documentation and synthetic provider/API tests without paid requests.
- Claude Code (local CLI) provider: clip review and social copy can run through the user's own signed-in Claude Code with tools and customizations off, without Cutroom handling Claude credentials.
- Whisper transcription runs on an NVIDIA GPU when the optional CUDA libraries are installed (`npm run setup:ai -- --gpu`), falling back to the CPU; CPU transcription and range imports now use up to 8 threads instead of 2.
- Stream autopilot can review and write titles with Claude Code instead of local Qwen, with per-run transcript-sharing consent.
- Finished streams that posted fewer clips than requested offer **Post reviewed clips anyway**, which posts reviewed clips that scored under the autopilot bar after confirmation.
- Stream autopilot can send TikTok clips to the creator's inbox as drafts (the new default), with **Copy caption** beside each clip, so posts can be public without TikTok's app audit.
- TikTok uploads from unaudited apps fall back to a private post instead of failing when Public was chosen.
- YouTube range imports fetch the video in parallel 10 MB pieces instead of one throttled stream, and encode with NVENC when an NVIDIA encoder is available; a one-hour part now takes minutes instead of about half an hour.

## 0.1.0 — initial public source

This is the first public source import of the working local studio. The import commits group existing features by subsystem; they are not a reconstructed development timeline. There is no packaged desktop release yet.

- Local video import, transcript editing, manual cuts, crop/fit controls, MP4/SRT export, and delivery ZIPs.
- Optional Whisper Tiny/Base/Small/Large v3 transcription and sampled face assistance.
- Public YouTube video/range import, long-replay splitting, and confirmed project-file deletion.
- Optional Qwen3-8B suggestions with multiple interests, duration ceilings, Discovery/Reviewed/Strict modes, partial findings, and explicit acceptance.
- Seven caption styles with shared preview/render cue logic and word/short-phrase pacing.
- Highlight captions and 16:9 defaults for newly created clips.
- MIT license, portable setup docs, contributor/security policies, agent instructions, and CI.

See [known limits](README.md#limits) before using the app for a large editing job.
