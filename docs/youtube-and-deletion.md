# YouTube import and disk deletion

**Import video → YouTube URL** downloads a public, finished video into a local project. Choose up to 720p or 1080p; actual formats depend on the source. For long replays choose a source range and optional 15/30/60-minute parts. See [long replays](long-streams-and-captions.md).

URL parsing accepts recognized YouTube video/Shorts forms and extracts a canonical video ID. The Python worker uses pinned yt-dlp, its EJS support, Node, and FFmpeg. It ignores user configuration, browser cookies, external plugins, and remote EJS components. Whole-video imports enforce three-hour/2 GB limits; bounded replay parts are validated separately.

Downloads enter the single processing queue, use a temporary job directory, and become projects only after successful probing. Cancellation stops the subprocess group and clears uncommitted output. Finished parts remain if another part fails. Sign-in requirements, region restrictions, ongoing streams, and upstream download blocking may prevent import.

**Project menu → Delete project and files** requires confirmation. It unlinks registered source/preview/thumbnail/export assets and transcript history, preserving assets referenced by another project. Active workers block deletion. Failed deletion leaves the project entry for retry; already deleted files cannot be recovered through metadata alone.

The API retains the legacy metadata-only `DELETE /api/projects/:id` route. The current UI uses `DELETE /api/projects/:id/files` with `{ "confirm": true }`. Tests cover deletion guards, shared references, cancellation, validation, persistence, and opt-in network downloads. See [testing](testing.md) and [privacy](privacy.md).
