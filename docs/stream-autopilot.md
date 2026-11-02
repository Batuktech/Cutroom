# Stream autopilot

Stream autopilot turns a finished YouTube VOD into short vertical clips with no manual steps:

1. Cutroom reads the stream length and splits it into one-hour parts. Each part becomes its own project named `… · Part N/M`.
2. Each part is transcribed with Whisper large-v3 on this computer.
3. The reviewer you choose, local Qwen3-8B by default or [Claude Code](#review-with-claude-code), reviews each transcript in Reviewed mode and proposes 15–60 second moments.
4. Across the whole stream, Cutroom ranks the reviewed candidates by their evidence-backed editorial score. Only candidates scoring at least 60/100 with clear hooks, payoffs and standalone clarity qualify. It can return fewer clips than requested, including zero; it does not fill missing slots with uncertain passages or weaker parts. Repeated wording across parts is filtered. If a finished stream posted fewer clips than requested, **Post reviewed clips anyway** asks for confirmation and then posts, up to the same limit, the clips that passed the reviewer's context, ending, appeal and clarity checks but scored under 60. Candidates that were never reviewed are still skipped.
5. Each pick becomes a 9:16 clip with face framing and burned-in captions. The same reviewer writes a title and description. The clip is rendered at 1080×1920 and, if you opted in, uploaded directly to YouTube Shorts and TikTok.

Open **Streams** in the sidebar to start a run and follow its parts, clips, and post links.

## Requirements

- The YouTube downloader and FFmpeg (`npm run setup:ai`).
- Whisper Large v3 installed in Settings.
- The local Qwen runtime and model ([Qwen setup](qwen-setup.md)), or a signed-in [Claude Code](byok.md#claude-code-local-cli) when Claude reviews.

Everything runs in the single local queue, one job at a time. Downloading a one-hour part usually takes a few minutes, depending on the connection; it is cut and re-encoded with NVENC on an NVIDIA GPU and with x264 elsewhere. On CPU, large-v3 can take several hours per one-hour part; with [GPU transcription](installation.md#faster-transcription-on-an-nvidia-gpu-linux) it usually takes minutes. Streams up to 24 hours are accepted; live or still-processing broadcasts are refused until YouTube finishes them.

## Review with Claude Code

Under **Find clips and write titles with**, choose **Claude Code · your Claude sign-in** to review with your own signed-in Claude Code instead of local Qwen. It needs no API key and runs on your Claude plan; setup is in [Claude Code (local CLI)](byok.md#claude-code-local-cli).

- Each run asks for separate consent, because every part's transcript text and timestamps go to Anthropic. The video and audio stay on this computer, and Whisper transcription still runs locally.
- Each part makes up to about 20 requests with the default `opus` model. Those count toward your Claude plan's usage limits; a reached limit fails that part, and **Retry failed steps** continues from the review.
- Claude is usually much faster than local Qwen on a laptop GPU, and stronger in languages other than English and Chinese. The same scoring threshold applies, so a run can still produce no clips.
- If Claude Code signs out mid-run, the part fails with a sign-in message. Sign in with `claude` in a terminal, then retry.

## Publishing accounts

Publishing uses your own developer apps. Postiz is not needed. Open **Settings → Auto-publishing accounts**, paste each app's client ID (or TikTok client key) and client secret, and choose **Save app credentials**. Then use **Connect**. Sign-in opens in a new tab and returns to the loopback redirect URI shown in Settings. App secrets and refresh tokens are stored owner-only (mode 600) in `social-accounts.json` inside the data folder. The secret is never sent back to the browser; Settings shows only the start of the client ID. They are never written to projects, backups, or job history. Saving a different client ID disconnects that platform's account, because its sign-in belongs to the old app.

As an alternative, set `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET` and `TIKTOK_CLIENT_KEY`/`TIKTOK_CLIENT_SECRET` in your private `.env` and restart. Credentials saved in Settings take precedence over `.env`.

### YouTube

1. In Google Cloud, enable **YouTube Data API v3**.
2. Create an OAuth client of type **Desktop app**. Loopback redirects are accepted automatically; for a Web client, register the URI shown in Settings.
3. Paste the client ID and secret in Settings.

Each upload costs 1,600 of the default 10,000 daily quota units, so about six uploads per day. Videos uploaded through API projects that Google has not audited are locked to private, even when Public is selected. Clips of three minutes or less are vertical, so YouTube classifies them as Shorts.

### TikTok

1. Create a TikTok developer app on the **Desktop** platform with Login Kit and the Content Posting API.
2. Register the redirect URI shown in Settings, for example `http://127.0.0.1:4318/api/social/tiktok/callback`.
3. Request the `user.info.basic`, `video.upload` and `video.publish` scopes, then paste the client key and secret in Settings. If you added `video.upload` after connecting, connect TikTok again.

Each stream chooses how clips reach TikTok:

- **Drafts** (the default) send each clip to your TikTok inbox. Open the TikTok notification, paste the caption (use **Copy caption** beside the clip) and choose who can watch. Your account can stay public, and the app does not need TikTok's audit. TikTok keeps at most 5 drafts waiting per day; further clips fail with a message until you post or delete some.
- **Exports → Post to TikTok** posts one rendered video with TikTok's own posting choices: who can watch (no default), comment, Duet and Stitch (all off until you turn them on), content disclosure, and TikTok's music-usage consent. This screen follows TikTok's [content sharing guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines) so the app can be submitted for TikTok's audit; until the audit passes, TikTok only accepts **Only me** posts from a private account.
- **Post directly** publishes without opening TikTok. Until TikTok audits the app, posts are private only and the account itself must be private (**Settings and privacy → Privacy → Private account**). When a run asks for Public, Cutroom retries as private and says so beside the clip. TikTok's [content sharing guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines) also expect a manual privacy choice for each post, so an audit for unattended posting is unlikely to pass.

## Consent, duplicates, and recovery

Posting requires ticking the consent box for each stream. Choosing no platforms still prepares and renders the top clips without posting anything.

Before each upload, Cutroom records the intent. If the platform refuses before accepting any video data, the post is marked **failed** and **Retry failed steps** can send it again. If the connection drops after video data was sent, it is marked **unknown** and never sent again automatically; check YouTube Studio or the TikTok app. Quota, audit, and expired sign-in errors stop that platform for the rest of the run.

If Cutroom stops mid-run, unfinished parts are marked failed. Retry continues from the last finished stage (download, transcription, or review) instead of starting over. Cancelling a stream stops queued work. Posts that were already published stay on the platforms.

AI picks are editorial suggestions, not a guarantee of views. Review what was published.

The [scoring rubric](ai-suggestions.md#scoring-and-boundary-review) evaluates transcript text, not faces, vocal emotion or view predictions. Stream autopilot uses local Qwen unless you choose Claude Code for that run. Existing saved clips are preserved. Old unscored reviews do not qualify for newly selected autopilot clips; analyze the part again to obtain a scored review. A transcript edit also invalidates selection from its previous review. The threshold is a product heuristic that needs evaluation against your own editorial preferences, not a measured success rate.
