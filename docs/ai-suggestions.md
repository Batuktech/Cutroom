# AI clip suggestions

Qwen3-8B is integrated into Cutroom's **Suggest cuts** dialog. It is separate from Whisper: Whisper turns audio into timed text; Qwen reads that text to propose passages. The model name is Qwen3-8B (8 billion parameters).

For optional cloud API models, including GLM, Kimi, OpenAI, Anthropic, and Gemini, see [cloud BYOK](byok.md). The selection and preview controls below apply to both; runtime and worker details refer to local Qwen.

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

Proposals must use valid source segment indexes. The worker copies evidence directly from the corresponding transcript rather than requiring the model to reproduce a quote exactly. Overlong proposals are rejected instead of dropping the ending to fit. Deterministic filters require at least four words, duration within the configured minimum and maximum, and no internal pause above the configured limit (15 seconds by default). Overlapping and near-duplicate proposals are removed. Discovery ranks passages by a coarse 1–3 editorial strength without preferring durations near the maximum.

Discovery saves its shortlist directly. Reviewed and Strict examine up to three times the requested count before selecting the final shortlist, so a later stronger candidate can replace an early plausible one. Cloud requests remain subject to the existing per-run cap. The final API independently validates source bounds, duration, pauses, evidence, and duplicate ranges before saving. Selection details show proposed, invalid, duplicate, rejected, and empty-section counts with available rejection reasons. These counts explain filtering; they do not predict audience performance.

### Scoring and boundary review

New Reviewed and Strict runs use a shared [editorial rubric](../shared/clip-rubric.json) in local Qwen and cloud review. Discovery stays a cheaper single pass, but uses the same guidance about concrete moments, emotional changes and complete payoffs.

| Dimension | Weight | What the reviewer looks for |
| --- | --- | --- |
| Hook | 25% | An opening that gives the viewer an immediate reason to watch. |
| Payoff | 25% | The answer, reveal, punchline or resolved point actually appears. |
| Clarity | 20% | The passage makes sense without unseen earlier footage. |
| Novelty | 15% | A specific unexpected development, not a claim that nobody has said it before. |
| Emotion | 10% | A change supported by preceding words and the moment itself, rather than intensity alone. |
| Value | 5% | A concrete takeaway or memorable insight. |

Each dimension uses 0 (absent), 1 (weak), 2 (clear), 3 (strong), or 4 (exceptional). The server calculates the weighted 0–100 editorial priority, capped at 49 if hook, payoff or clarity is below 2. These weights and the autopilot threshold are explicit product heuristics, not calibrated probabilities or evidence of improved view counts. A quiet explanation can rank well with emotion 0.

The review supplies source indexes for the hook, peak, payoff and preceding emotional baseline. Cutroom copies the associated quotes and times from the transcript into `candidate.assessment.evidence`; the model cannot supply invented evidence text. Missing baseline or baseline after the peak removes the emotion score. Missing payoff removes its score. A hook starting more than five seconds into the clip is capped at 1, and more than five seconds of trailing material after the payoff caps payoff at 2. Evidence anchoring proves where the text came from, not that the model's interpretation is correct.

The reviewer sees up to two neighboring segments on each side, subject to context limits. It can move the start/end to retain setup and finish the payoff, but must keep the original proposal's peak. Revised clips still have to pass duration and pause checks. If refinement or evidence is invalid, Reviewed keeps the original passage with a warning; Strict rejects it. No words or frames are synthesized. Trimming stays at transcript-segment boundaries.

The API and metadata backups preserve `strength` and the optional versioned `assessment` for new reviews. Existing saved clips and reviews remain unchanged; older reviews do not receive invented scores. The current interface continues to show ordered findings, the reviewer's reason and weaknesses. Detailed numeric dimensions and evidence anchors are stored in metadata, not a new score dashboard. Re-run **Analyze transcript** in **Reviewed** or **Strict** mode to use the new scoring.

This does not add audio-emotion recognition, face-expression analysis, visual-event detection or performance analytics. It does not reconstruct moments split across separate imported projects. A larger local review pool costs additional inference time; cloud review can hit the existing request cap sooner. Use a labeled set of your preferred moments to evaluate selection quality before relying on unattended output.

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
