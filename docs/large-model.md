# Whisper model choices

Cutroom supports Tiny, Base, Small, and full Large v3 through faster-whisper. No weights ship with the repository. Install models in **Studio settings → Speech models**, then choose one when transcribing. The dialog defaults to the largest installed model.

| Model | Approximate download | Tradeoff |
| --- | --- | --- |
| Tiny | 75 MB | Fast rough drafts; struggles with noisy or overlapping speech. |
| Base | 145 MB | Modest memory cost and more capacity than Tiny. |
| Small | 465 MB | More capacity, with longer CPU processing time. |
| Large v3 | 3.1 GB | Largest exposed option; most memory and CPU time. |

Transcription runs on CPU with int8 computation, two threads, five-beam decoding, the original audio timeline, and measured word timestamps. A larger model can still mishear names, slang, quiet speech, and overlaps. Review the source and captions; model size is not an accuracy guarantee.

Initial installation downloads weights. Later model loading is local. Existing transcripts change only after a transcription is submitted and successfully applied. Previous captions and completed results are saved in transcript history; empty results and concurrent caption edits are protected. See [caption repair](transcription-repair.md), [installation](installation.md), and [testing](testing.md).
