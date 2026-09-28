# Privacy and local files

Cutroom has no accounts or analytics. Fonts and the sample video are bundled locally. The source repository contains no user library or model weights. Optional [Postiz publishing](publishing.md) uploads selected rendered clips and social copy to your configured Postiz instance and selected social channels.

Network operations are explicit: dependency installation, speech/Qwen model downloads, YouTube URL import, optional [cloud transcript review](byok.md), social copy generation and Postiz publishing after confirmation. Once installed, Whisper and Qwen read local model files; rendering uses local FFmpeg. YouTube import does not read browser cookies or sign in to an account.

Cloud review sends transcript text, timestamps, interests, and guidance to the selected provider (and OpenRouter's upstream model provider when applicable). Audio and video remain local. Provider data policies apply. UI-entered API keys stay in server memory and are excluded from metadata backups. Optional `.env` keys persist as plaintext outside the data folder; keep that file private. Chat subscriptions do not substitute for API keys.

## Storage

The default `.cutroom/` directory contains:

| Location | Contents |
| --- | --- |
| `projects.json` | Project metadata, transcripts, clips, review candidates, export records. |
| Social metadata in `projects.json` | Saved descriptions/hashtags, video fingerprints, channel IDs and submission receipts. No API keys. |
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

Postiz drafts also upload media outside this computer. Remote retention and platform policies apply. Cancelling local work, forgetting a key or deleting a local project does not remove uploads or cancel posts already accepted by Postiz. Manage those copies and schedules in Postiz and the social platforms.
