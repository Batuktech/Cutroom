# Keep a local editing session moving

Start with `npm run doctor` from the project directory. It checks the tools, fonts, model files, and built interface without changing your projects.

| What you see | What to do |
| --- | --- |
| The studio URL does not open | Run `npm start` from the project directory, then open `http://127.0.0.1:4318`. If you changed `CUTROOM_PORT` in `.env`, use that port. |
| The terminal asks you to build | Run `npm run build`, then `npm start`. |
| Port 4318 is already in use | Check whether Cutroom is already open at that address. Stop the earlier Cutroom terminal with Ctrl+C before starting another copy. Do not stop an unrelated process. |
| A video needs a preview copy | Choose **Create browser preview** in the editor. This makes a browser-compatible local copy. Exports still use the original imported source. |
| Transcription is unavailable | Check **Studio settings**. Run `npm run setup:ai` if the Python worker is missing, then restart the studio so it checks the environment again. Install a model if none is ready. |
| A model download fails | Check the connection and available disk space, then retry **Install model**. Installation needs internet access; subsequent transcription uses local weights. |
| A job stays queued | The studio processes one job at a time. Check the currently running job in processing history. Cancel it if you want to free the queue. |
| Transcription is slow | Try Tiny on a short recording first. CPU time depends on the model, hardware, and recording. Other running applications also compete for memory and CPU. |
| Speech is wrong or missing | Listen to the source, choose its spoken language explicitly, and try a larger installed model. Correct the transcript or import a reviewed SRT. Silent footage has no speech to transcribe. |
| A transcription job says captions changed | Your newer caption edit was preserved. Keep it, or deliberately start transcription again after saving it. |
| The face tool finds no face | Set the crop manually, or choose **Fit full video**. The tool detects frontal faces in sampled frames and suggests a fixed position. It does not follow moving people. |
| Captions look different in the downloaded file | Inspect the actual render in **Exports**. Adjust size/position and render again. Latin/Cyrillic fonts are bundled; other writing systems may need an appropriate system font. |
| An export does not show your newest changes | Save the clip and render it again. Each file captures the settings at the time its job was queued. The default delivery pack uses the latest completed render per clip. |
| A job was interrupted after closing the app | Restart and run that operation again. Project edits and completed files persist; unfinished jobs do not automatically resume. |
| A deleted project is missing | **Delete project and files** permanently removes stored media. Restore a complete file backup before importing metadata. Older metadata-only library removals kept the media and can still be recovered with **Studio settings → Restore metadata**. |
| YouTube import is unavailable | Run `npm run setup:ai`, restart Cutroom, and check `npm run doctor`. File import remains available. |
| YouTube download fails | Review the queue message. A video can be unavailable, require sign-in, or be blocked by YouTube. Try another public video or choose a local file. |
| Project deletion reports a file error | The project entry remains so you can fix file permissions and retry. Some files may already have been deleted; this action cannot undo those deletions. |

If the interface displays its recovery screen, reload first. The metadata download is available there as an escape hatch. If startup reports an unreadable project database, preserve `.cutroom/projects.json` and the rest of the data directory before attempting a repair. Do not replace it with an empty file.

For a useful problem report, record the action, visible job message, source format and duration, and `npm run doctor` output. Keep private footage and local paths out of anything you choose to share externally.
