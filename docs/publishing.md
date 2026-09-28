# Publishing through Postiz

Cutroom renders a saved clip, uploads the MP4, and submits descriptions and hashtags to connected YouTube, TikTok and Instagram channels through Postiz. Manual MP4 download remains optional. Postiz manages the social accounts and publishing schedule; its source code needs no changes.

## Configure your account

1. Use hosted Postiz or your self-hosted instance. Connect your social channels in Postiz and complete their account authorizations.
2. In Postiz, open **Developers → Access** and copy the API key. An OAuth app is unnecessary for your own account.
3. In Cutroom, open **Studio settings → Publish through Postiz**. Paste the key and choose **Use key for this session**, then **Load connected channels**.
4. For persistence, configure your private, untracked `.env` instead:

```dotenv
POSTIZ_API_KEY=your-postiz-api-key
CUTROOM_POSTIZ_API_URL=https://api.postiz.com/public/v1
```

The hosted API URL is the default. Self-hosting uses the actual backend URL ending in `/public/v1`, commonly `https://your-postiz.example/api/public/v1`. This is trusted server configuration; browser requests, model output and backups cannot change it. HTTPS is required except for explicitly configured localhost HTTP. Postiz media storage must provide publicly reachable HTTPS URLs so the social platforms can fetch the MP4.

Session keys clear on restart and override environment keys. Forgetting a session key does not remove an environment key or cancel a job. Keys are excluded from browser storage, project metadata and job history. `.env` files are plaintext; keep them private. No Postiz package, MCP server or CLI is required by Cutroom.

## Prepare a clip

1. Find clips through Qwen or cloud review and add the passages you choose.
2. Set a **9:16** frame, trim to **3 seconds–3 minutes**, and review crop and captions. These are Cutroom's workflow limits; individual accounts can impose stricter limits. Existing clips and creation defaults are preserved.
3. Choose **Prepare posts**. Unsaved clip settings are saved first. Generate social copy with Qwen or a configured cloud provider, or enter it manually. Generation replaces saved social copy. Cloud generation sends the clip's overlapping transcript passages, title and requested language in one confirmed request; video is not sent to the AI provider.
4. Review each platform's copy: titles support 2–90 characters, descriptions up to 1,800 characters, and up to five hashtags. The server also checks each channel's live character limit. Instagram uses the description and hashtags as its caption; its separate title is a local editorial field.
5. Select channels and review visibility, audience and disclosures. YouTube and TikTok initially use private visibility; change this when you want public posts. Instagram submits the MP4 as a Reel. Original audio is kept; adding trending music is not implemented.
6. Choose **Draft in Postiz**, **Schedule through Postiz**, or **Publish when ready**. Times use the browser's displayed time zone and are sent as UTC. Allow time for rendering/uploading; if the selected time is no longer at least a minute away, remaining submissions stop.
7. Confirm the destination and action, then submit. Cutroom creates a fresh render, uploads it once and submits each channel independently. The render also remains in Exports. No separate export click or download is needed.

Keep Cutroom running until upload and submission finish. Postiz then manages the schedule. A completed Cutroom job means **accepted by Postiz**, not necessarily published by a platform. Check the Postiz calendar for delivery results, errors, post links and schedule changes.

This version automates delivery of one selected clip to several channels per action. It does not automatically accept discoveries or continuously publish every candidate. AI produces editorial suggestions, not predictions of views. Local Qwen retains its Linux/NVIDIA/Vulkan and memory requirements; dense clips can exceed its context limit. Cloud generation uses one bounded request, which may be billed even if it fails or is cancelled.

## Failure and duplicate handling

Cancel stops remaining work but cannot retract an upload or post already received by Postiz. Edit or cancel those posts in Postiz. Deleting a local project does not delete remote media or schedules.

Cutroom persists intent before each channel submission. The same clip version cannot be submitted again while a post on that channel is pending, confirmed or uncertain. Saving copy does not change the video fingerprint. Changing the saved video or transcript creates a new version that can produce another post.

A lost receipt produces an **unknown** state and blocks resubmission. Check the Postiz calendar, then select **I found this post in Postiz** or **I confirmed no post exists** in the submission history. Only the latter allows resubmission. Post creation is never automatically retried, including on HTTP failures, because a post may already exist.

On restart, pending work becomes failed and in-flight submissions become unknown. Backups preserve history but never resume publishing. The record limit is 500 per project. Uploads require regular MP4 files under 500 MB; Postiz or platforms may impose lower limits. Try 720p or shorter clips for oversized renders.

## Verification and references

See the scoped [publishing UI delivery gate](publishing-design-gate.md) for design and browser verification evidence.

`npm run test:postiz` starts an isolated studio on port 4334 with synthetic media and blocked external network access. It exercises copy generation, actual FFmpeg rendering, multipart upload, channel payloads, consent, partial success, duplicate handling, queued/running cancellation, stale edits, abrupt server crash recovery, backups and credential redaction. It needs FFmpeg, but no API credit, models, GPU or social accounts. Live authorizations, quotas and publication are not verified.

- [Postiz authentication and API URLs](https://docs.postiz.com/public-api/introduction)
- [Channel settings and limits](https://docs.postiz.com/public-api/integrations/settings)
- [MP4 upload](https://docs.postiz.com/public-api/uploads/upload-file)
- [Draft, schedule and immediate submissions](https://docs.postiz.com/public-api/posts/create)
- [YouTube settings](https://docs.postiz.com/public-api/providers/youtube), [TikTok settings](https://docs.postiz.com/public-api/providers/tiktok), [Instagram Reels](https://docs.postiz.com/public-api/providers/instagram)
