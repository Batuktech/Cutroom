# Changelog

## Unreleased

- Optional OpenAI, Anthropic, and OpenRouter API keys for clip suggestions, with local Qwen remaining the default.
- Per-analysis transcript-sharing confirmation, editable model IDs, request caps, partial results, and reported token usage.
- Session-only key management, optional environment keys, cancellation, and provider-error redaction.
- Cloud setup/billing documentation and synthetic provider/API tests without paid requests.

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
