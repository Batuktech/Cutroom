# Transcript accuracy and caption timing

Whisper produces estimates, especially on noisy conversation. Wrong words, missing exchanges, and timing errors can have different causes. Listen to the original source, select the spoken language explicitly, try a larger installed model on a short passage, and correct captions before delivery. Imported SRT/VTT is useful when a reviewed transcript already exists.

## Current implementation

- The worker keeps the original audio timeline, disables VAD concatenation, and uses five-beam decoding with measured word timestamps.
- Shared caption grouping splits measured cues at pauses and prevents neighboring cues from overlapping through a display hold.
- Whitespace/tokenizer differences do not unnecessarily discard valid measured timings. Manual text changes can require estimated timing within a segment.
- Preview follows displayed video frames, with a frame-loop fallback. Caption updates do not rerender the entire transcript at video frame rate.
- Every transcription saves prior captions as JSON/SRT and retains the completed result in `transcript-history/`. Empty recognition cannot erase captions, and newer edits are not replaced by a stale job result.

A `-before.srt` file can restore prior text and segment timing through subtitle import. JSON history retains word timings. Back up the data directory before manual recovery work; do not edit project storage while the server is running.

Unit tests exercise cue timing and token matching; integration tests check real recognition, backup, cancellation, and edit conflicts. Synthetic fixtures test display behavior, not general speech-recognition accuracy. See [testing](testing.md) and [model choices](large-model.md).
