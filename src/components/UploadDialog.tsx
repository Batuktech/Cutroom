import { useRef, useState } from "react";
import { Upload, FileVideo, LoaderCircle, Download } from "lucide-react";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { uploadVideo, post } from "../lib/api";
import { youtubeUrl } from "../../shared/youtube";
import { parseTimecode } from "../../shared/timecode";
import { youtubeParts, sourceTime } from "../../shared/youtube-range";
import { size } from "../lib/utils";
import type { Job } from "../../shared/types";
export function UploadDialog({
  open,
  close,
  imported,
  youtubeReady,
}: {
  open: boolean;
  close: () => void;
  imported: (job: Job, count?: number) => void;
  youtubeReady: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const [mode, setMode] = useState<"file" | "youtube">("file");
  const [url, setUrl] = useState("");
  const [section, setSection] = useState(false);
  const [start, setStart] = useState("00:00:00");
  const [end, setEnd] = useState("00:30:00");
  const [partMinutes, setPartMinutes] = useState(0);
  const [quality, setQuality] = useState(720);
  let rangeError = "", planned: ReturnType<typeof youtubeParts> = [];
  try {
    const a = parseTimecode(start), b = parseTimecode(end);
    if (section && (a === null || b === null)) throw new Error("Use hours:minutes:seconds for the start and end.");
    planned = youtubeParts(section ? { start: a!, end: b! } : undefined, section && partMinutes ? partMinutes : undefined);
  } catch (e) { rangeError = (e as Error).message; }
  const [queuing, setQueuing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  function choose(next?: File) {
    if (!next) return;
    setError("");
    if (next.size > 2 * 1024 ** 3) {
      setError("Choose a video smaller than 2 GB.");
      return;
    }
    if (!/\.(mp4|mov|mkv|webm|m4v|avi|mts|m2ts)$/i.test(next.name)) {
      setError("Choose an MP4, MOV, MKV, WebM, AVI, or MTS video.");
      return;
    }
    setFile(next);
  }
  async function upload() {
    if (!file) return;
    setProgress(0);
    setError("");
    controller.current = new AbortController();
    try {
      const job = await uploadVideo(file, setProgress, controller.current.signal);
      imported(job);
      setFile(null);
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  }
  function dismiss() {
    if (progress !== null || queuing) return;
    setFile(null);
    setError("");
    close();
  }
  async function download(event: React.FormEvent) {
    event.preventDefault();
    if (queuing) return;
    setError("");
    try {
      const canonical = youtubeUrl(url);
      setQueuing(true);
      if (rangeError) throw new Error(rangeError);
      const job = await post<Job & { queuedCount: number }>("/import/youtube", {
        url: canonical, quality,
        ...(section ? { range: { start: parseTimecode(start), end: parseTimecode(end) }, ...(partMinutes ? { partMinutes } : {}) } : {}),
      });
      imported(job, job.queuedCount);
      setUrl("");
      close();
    } catch (error) { setError((error as Error).message); }
    finally { setQueuing(false); }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={dismiss}
      title="Bring your footage in"
      description="Choose a file or download a YouTube video into your local library. Editing and transcription run on this computer."
    >
      <div className="import-method" role="group" aria-label="Import source">
        <Button variant={mode === "file" ? "default" : "secondary"} aria-pressed={mode === "file"}
          disabled={progress !== null || queuing} onClick={() => { setMode("file"); setError(""); }}>Choose file</Button>
        <Button variant={mode === "youtube" ? "default" : "secondary"} aria-pressed={mode === "youtube"}
          disabled={progress !== null || queuing} onClick={() => { setMode("youtube"); setError(""); }}>YouTube URL</Button>
      </div>
      {mode === "youtube" ? <form onSubmit={download}>
        <label className="field-label">YouTube video URL
          <input type="url" value={url} onChange={(event) => setUrl(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=…" required maxLength={2048}
            disabled={queuing} autoComplete="off" aria-describedby="youtube-help" />
        </label>
        <p id="youtube-help" className="muted">Public videos and finished livestreams. Download a time range from a long replay, or the whole video if it fits within 3 hours and 2 GB.</p>
        <label className="range-toggle"><input type="checkbox" checked={section} disabled={queuing} onChange={(e) => setSection(e.target.checked)} />Choose part of a long video</label>
        {section && <div className="youtube-range">
          <div className="youtube-time-fields">
            <label className="field-label">Start in original video<input value={start} disabled={queuing} onChange={(e) => setStart(e.target.value)} placeholder="02:00:00" aria-describedby="range-help" /></label>
            <label className="field-label">End in original video<input value={end} disabled={queuing} onChange={(e) => setEnd(e.target.value)} placeholder="03:00:00" aria-describedby="range-help" /></label>
          </div>
          <label className="field-label">Split into projects<select value={partMinutes} disabled={queuing} onChange={(e) => setPartMinutes(Number(e.target.value))}>
            <option value={0}>One project for this range</option><option value={15}>Every 15 minutes</option><option value={30}>Every 30 minutes</option><option value={60}>Every 60 minutes</option>
          </select></label>
          <p id="range-help" className="suggestion-note">Use HH:MM:SS. Each part becomes its own editable project starting at 0:00, with its original range in the title.</p>
          {rangeError ? <p role="status" className="error-message">{rangeError}</p> : <div className="range-summary" role="status"><strong>{planned.length} {planned.length === 1 ? "project" : "projects"} to download</strong><span>{sourceTime(planned[0]!.start)}–{sourceTime(planned.at(-1)!.end)} in the original stream</span></div>}
        </div>}
        <label className="field-label">Download quality<select value={quality} disabled={queuing} onChange={(e) => setQuality(Number(e.target.value))}><option value={720}>Up to 720p · smaller download</option><option value={1080}>Up to 1080p · more detail</option></select></label>
        <p className="suggestion-note">Each project is limited to 2 GB. Parts download one at a time; cancel them individually in the queue. Live broadcasts still in progress are not supported.</p>
        {!youtubeReady && <p role="status" className="error-message">The downloader is not ready. Run npm run setup:ai and restart Cutroom, or choose a file.</p>}
        {error && <p role="alert" className="error-message">{error}</p>}
        <div className="dialog-actions">
          <Button variant="secondary" disabled={queuing} onClick={dismiss}>Cancel</Button>
          <Button type="submit" disabled={!url.trim() || queuing || !youtubeReady || !!rangeError}>
            {queuing ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}
            {queuing ? "Adding to queue…" : section ? `Download ${planned.length || ""} ${planned.length === 1 ? "part" : "parts"}` : "Download and import"}
          </Button>
        </div>
      </form> : <>
      <input
        ref={input}
        type="file"
        className="sr-only"
        accept=".mp4,.mov,.mkv,.webm,.m4v,.avi,.mts,.m2ts"
        onChange={(e) => choose(e.target.files?.[0])}
        aria-label="Choose video file"
      />
      <button
        disabled={progress !== null}
        className={`upload-drop ${drag ? "dragging" : ""}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (progress === null) choose(e.dataTransfer.files[0]);
        }}
      >
        <span className="upload-symbol">
          {file ? <FileVideo size={28} /> : <Upload size={28} />}
        </span>
        <strong>
          {file ? file.name : "Drop a video here, or choose a file"}
        </strong>
        <span>
          {file ? size(file.size) : "MP4, MOV, WebM, MKV and more · up to 2 GB"}
        </span>
      </button>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {progress !== null && (
        <div className="upload-progress">
          <div className="row-between">
            <span>
              {progress >= 100
                ? "Preparing your video…"
                : "Copying to your local library…"}
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <progress value={progress} max={100} />
        </div>
      )}
      <div className="dialog-actions">
        <Button
          variant="secondary"
          onClick={() =>
            progress !== null ? controller.current?.abort() : dismiss()
          }
        >
          {progress !== null ? "Cancel upload" : "Cancel"}
        </Button>
        <Button disabled={!file || progress !== null} onClick={upload}>
          {progress !== null ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Upload size={16} />
          )}
          Import video
        </Button>
      </div>
      </>}
    </Dialog>
  );
}
