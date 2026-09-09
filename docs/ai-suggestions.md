# AI clip suggestions

Qwen3-8B is integrated into Cutroom's **Suggest cuts** dialog. It is separate from Whisper: Whisper turns audio into timed text; Qwen reads that text to propose passages. The model name is Qwen3-8B (8 billion parameters).

For optional OpenAI, Anthropic, or OpenRouter API models, see [cloud BYOK](byok.md). The selection and preview controls below apply to both; runtime and worker details refer to local Qwen.

## Use it

1. Import a video, transcribe it, and save any caption corrections.
2. Open **Suggest cuts → AI review → Local Qwen3-8B**.
3. Check any combination of the nine **Interests**. A passage can match any one selected interest; it need not satisfy all of them. Choices cover conversations, humor, advice, stories, surprises, disagreements, emotion, reactions, and quotable lines.
4. Set **Maximum clip length** to **Up to 20, 30, 40, … 100 seconds**. This is a ceiling, not a target: a 20-second clip is eligible under 100 seconds. The default minimum is five seconds. Set **Candidates to review** to 5, 10, 20, 25 (default), or 30.
5. Keep **Discovery** for the broadest first selection, or choose the modes below. Expand **Timing limits & custom guidance** to adjust the minimum duration, allowed pause, and a prompt of up to 600 characters.
6. Choose **Analyze transcript**. Findings appear as sections finish, before the whole scan completes. Preview them while analysis runs. **Keep working** closes the dialog without stopping analysis.
7. Wait for completion or choose **Stop analysis, keep findings**. Once processing stops, select candidates and choose **Add selected clips**. Then adjust their boundaries, framing, captions, and export as usual.

Suggestions do not automatically become clips. Repeated acceptance does not create duplicate time ranges. **Fast transcript rules** remains available and adds up to six editable cuts immediately without Qwen's content review; its separate target-length control is unchanged.

| Mode | Behavior |
| --- | --- |
| Discovery (default) | One model selection pass. Keeps plausible passages with explicit weaknesses for your review. |
| Reviewed | Adds a second model check for context, ending, a specific moment, and coherence. Keeps uncertain passages, marked **Needs a closer look**, with concerns. |
| Strict | Adds that second check and only keeps passages that pass all four checks. Can return no candidates. |

The selected count is an upper bound, not a quota. Short or unclear transcripts may have fewer useful passages. Existing saved reviews retain their old settings; reviews without the new settings display **Legacy review**. Choose **Analyze transcript** to use the new controls. No retranscription is required if the existing transcript is usable.

## How selection works

The worker loads the model once and reads the entire transcript in sections bounded by the 2,048-token context, with approximately 25% overlap. Each section can propose up to three continuous passages. The request combines all selected interests with ANY-match semantics and optional custom guidance. The model can return no proposals from a section.

Proposals must use valid source segment indexes. The worker copies evidence directly from the corresponding transcript rather than requiring the model to reproduce a quote exactly. Whole trailing segments can be removed to respect the maximum; such candidates carry an ending-check warning. Deterministic filters require at least four words, duration within the configured minimum and maximum, and no internal pause above the configured limit (15 seconds by default). Overlapping and near-duplicate proposals are removed. Editorial strength ranks the remaining passages without preferring durations near the maximum.

Discovery saves its shortlist directly. Reviewed and Strict add the second pass described above. The final API independently validates source bounds, duration, pauses, evidence, and duplicate ranges before saving. Selection details show proposed, invalid, duplicate, rejected, and empty-section counts with available rejection reasons. These counts explain filtering; they do not predict audience performance.

Each completed section saves a partial review and updates job checkpoint metadata, which triggers a browser library refresh. Candidate IDs remain stable for matching time ranges within that review. Selection is disabled during processing so an evolving shortlist cannot change underneath acceptance. Stopping analysis preserves the latest saved findings, and those findings survive a server restart. A newly completed review replaces the previous review; this includes an empty final result. Empty early checkpoints do not erase an existing useful review.

A saved review records a SHA-256 fingerprint of the source duration and complete transcript, including word timing. Editing the transcript invalidates old suggestions. Edits made during analysis prevent its result from replacing the saved review. Cancellation prevents later queued writes; existing clips are preserved. Metadata backups include partial and completed reviews.

## Optional runtime and resources

Follow [Qwen setup](qwen-setup.md) to install the separate runtime and model. The repository includes neither. No account or paid inference API is used. Initial model/runtime installation requires downloads; analysis then uses local files.

The current Linux/NVIDIA/Vulkan preset uses 24 GPU layers, a 2,048-token context, two CPU threads, and lower process priority. Before inference it requires approximately 3 GB available RAM and 3.8 GB free GPU memory. Repeated low-memory readings stop analysis. These safeguards do not guarantee that every other app will remain smooth. The model unloads after completion or cancellation.

`npm run doctor` checks the optional runtime/model. Missing dependencies disable local Qwen review while leaving fast rules available. `npm run setup:ai` installs Whisper and the downloader, not Qwen. Virtual environments are not portable between computers.

## Limits and checks

Long videos need many section passes and can take substantially longer than a short trial. Jobs have a two-hour timeout and can be cancelled. An individual subtitle paragraph too large for the local context fails with an instruction to split it; it is never silently skipped. A truncated structured model response also fails visibly. The single processing queue prevents Qwen, transcription, and export jobs in this studio from running simultaneously.

The analysis reads text, not video frames, music, facial expressions, or audience analytics. It cannot repair missing or incorrect speech recognition. It can miss good moments, misjudge humor, or reject everything. Review the actual footage. No score or model can guarantee virality, views, or income.

Commands used to verify this integration:

```sh
npm test
.venv-qwen/bin/python scripts/test_suggest_logic.py
.venv-qwen/bin/python scripts/test_suggest_modes.py
npm run test:integration
npm run test:qwen
npm run build
npm run lint
npm run doctor
```

The opt-in Qwen test uses the real GPU and isolated sample projects under `output/`; it does not modify the user's library. Do not run it simultaneously with an analysis job in the studio. See [testing](testing.md) for prerequisites and [verification](verification.md) for scope.
