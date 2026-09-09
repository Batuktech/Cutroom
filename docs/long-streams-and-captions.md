# Long replays, larger reviews, and timed captions

## Import a part of a long stream

Open **Import video → YouTube URL**, paste a public replay URL, and enable **Choose part of a long video**. Enter the start and end in the original video's timeline as `HH:MM:SS`.

For example, `02:00:00` to `04:00:00` with **Every 30 minutes** creates four independently editable projects. Each project starts at 0:00 and includes its original source range in its title. Choose **One project for this range** to download a single section instead.

- Quality is **up to 720p** by default, with **up to 1080p** available.
- Each project is limited to 2 GB and three hours. Choose shorter parts or lower quality if a part reaches the size limit.
- Split intervals are 15, 30, or 60 minutes. Up to 24 parts can be queued together, within a source range of 0–24 hours. A twelve-hour replay can therefore become 24 half-hour projects.
- Parts download sequentially. Each has its own progress/cancellation entry labelled with its original source range. Completed parts stay in the library if a later part fails or is cancelled; a batch is not an all-or-nothing operation.
- Source ranges beyond the video's actual duration fail clearly. Ongoing, upcoming, and not-yet-processed livestreams remain unsupported. These controls are for finished replays.
- Whole-video import retains the three-hour/2 GB limits. Local-file upload is unchanged.

The worker uses yt-dlp's FFmpeg-backed time-range downloads and re-encodes the section for a clean cut. Its subprocess group is cancellable, it caps the output file, and FFprobe verifies the resulting duration before import. Only the section is stored as project media; transfer overhead and seeking behavior depend on YouTube's available formats. See the [yt-dlp time-range documentation](https://pypi.org/project/yt-dlp/) for the underlying downloader feature.

## Review 20–30 possible clips

**Suggest cuts → Local AI review → Candidates to review** defaults to **up to 25**. Options include 5, 10, 20, 25, and 30. **Maximum clip length** offers 20–100 seconds in ten-second increments. Shorter clips qualify: selecting 100 seconds allows a 20-second passage.

Choose multiple interests together, with any matching interest eligible. Discovery saves first-pass findings as sections finish; Reviewed adds another assessment while retaining uncertain passages; Strict requires all second-pass checks. Minimum duration, allowed pauses, and custom guidance offer additional control. Stop analysis to keep and select findings before the entire scan completes. The count remains an upper bound; the model can return fewer candidates. See [current AI controls and selection behavior](ai-suggestions.md).

## Caption styles and pacing

Select a saved clip and open the editor's **Style** tab.

| Preset | Behavior |
| --- | --- |
| Word Pop | One uppercase word at a time, in the accent color, with a brief scale pop |
| Punchy Phrases | Short uppercase phrases with a brief scale pop |
| Build-up | Words appear as spoken, with the current word in the accent color |
| Highlight | Shows the phrase and highlights the current spoken word |
| Studio / Bold / Minimal | Existing visual presets, now also usable with the pacing controls |

**Words on screen** selects preset pacing, one word at a time, or short phrases. Short phrases have a maximum duration of **1, 1.5, or 2 seconds**. Actual cues can be shorter at pauses or the end of a sentence. The duration option does not stretch speech or invent missing words.

Word boundaries use Whisper's measured timestamps when present and still consistent with the transcript. SRT/VTT text and passages edited after transcription use evenly estimated word timing; the Style panel flags this. Choosing a visual preset cannot fix inaccurate recognition or missing timestamps.

Preview and export share the cue segmentation and scale curve. Animation follows media time, so seeking and pausing show the corresponding animation phase. A cut starting in the middle of a cue preserves its existing phase. Word Pop/Punchy Phrases scale from 88% to 106% and settle at 100% over 140 ms. Build-up emits timed word-reveal events in the exported ASS subtitles. SRT retains word/phrase boundaries but does not carry styling or animation; the MP4 contains the burned-in appearance.

Reduced-motion preference suppresses the pop transform in the editor preview. The selected animation remains in the exported video; use Highlight, Studio, Bold, or Minimal for a non-popping export. Caption size, color, placement, aspect ratio, and framing remain editable. Save settings before rendering.

## Verification

Use the optional YouTube and caption integration suites described in [testing](testing.md). They cover bounded downloads, cancellation, and actual rendered caption output with synthetic timing fixtures. A short network test does not establish reliability for every long replay or YouTube format.
