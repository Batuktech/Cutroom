# Privacy and local files

Cutroom has no accounts, analytics, cloud media storage, remote inference endpoint, or automatic social publishing. Fonts and the sample video are bundled locally. The source repository contains no user library or model weights.

Network operations are explicit: dependency installation, speech/Qwen model downloads, and YouTube URL import. Once installed, Whisper and Qwen read local model files; rendering uses local FFmpeg. YouTube import does not read browser cookies or sign in to an account.

## Storage

The default `.cutroom/` directory contains:

| Location | Contents |
| --- | --- |
| `projects.json` | Project metadata, transcripts, clips, review candidates, export records. |
| `jobs.json` | Recent job status and errors. |
| `media/` | Imported source copies, thumbnails, compatible previews. |
| `exports/` | Rendered MP4 and SRT files. |
| `models/` | Optional downloaded model weights. |
| `temp/` | Job working files. |
| `transcript-history/` | Previous captions and completed recognition results. |

These files are not encrypted by the app. Anyone with access to the operating-system account or data directory may be able to read them. File imports copy footage; they do not rewrite the original source outside Cutroom.

## Backup and deletion

Stop the app and copy the entire data directory for a complete backup. Metadata exports contain editing decisions and transcripts, not media. Restore metadata adds missing projects only when their source files exist, skips existing IDs, and omits missing renders.

**Delete project and files** permanently removes Cutroom's registered source copy, preview, thumbnail, exports, and caption history after confirmation. Files referenced by another project are preserved. A metadata-only backup cannot recover deleted footage. Keep your original source or a complete backup if you need recovery.

Before sharing logs, screenshots, or bug reports, remove personal paths, video titles, transcript text, and project identifiers. Tests and browser traces can contain this data too. See [security](../SECURITY.md).
