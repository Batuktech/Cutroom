import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  RotateCcw,
  Monitor,
  Smartphone,
} from "lucide-react";
import type { Clip, Project } from "../../shared/types";
import { Button } from "./ui/button";
import { time } from "../lib/utils";
import { useVideoClock } from "../lib/useVideoClock";
import {
  captionEmScale,
  captionCues, captionPopScale,
  usesCyrillic,
} from "../../shared/captions";

export function Preview({
  project,
  clip,
  currentTime,
  onTime,
  videoRef,
  onPreviewError,
}: {
  project: Project;
  clip: Clip | null;
  currentTime: number;
  onTime: (n: number) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onPreviewError: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [source, setSource] = useState(false);
  const [error, setError] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const captionTime = useVideoClock(videoRef) ?? currentTime;
  const active = project.transcript.find(
    (s) => captionTime >= s.start && captionTime < s.end,
  );
  const cue = active
    ? captionCues(active, clip?.captionStyle || "studio", clip ?? {}).find(
        (c) => captionTime >= c.start && captionTime < c.end,
      )
    : null;
  const caption = cue?.text;
  const aspect =
    source || !clip
      ? `${project.width}/${project.height}`
      : clip.aspect.replace(":", "/");
  const aspectRatio =
    Number(aspect.split("/")[0]) / Number(aspect.split("/")[1]);
  function play() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (
        !source &&
        clip &&
        (video.currentTime < clip.start || video.currentTime >= clip.end)
      )
        video.currentTime = clip.start;
      void video.play().catch(() => setError(true));
    } else video.pause();
  }
  useEffect(() => {
    function key(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        target.closest(
          'input,textarea,select,button,[role="dialog"],[contenteditable="true"]',
        )
      )
        return;
      if (event.code === "Space") {
        event.preventDefault();
        const v = videoRef.current;
        if (v?.paused) void v.play();
        else v?.pause();
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const v = videoRef.current;
        if (v)
          v.currentTime = Math.max(
            0,
            Math.min(
              project.duration,
              v.currentTime + (event.key === "ArrowLeft" ? -5 : 5),
            ),
          );
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [project.duration, videoRef]);
  return (
    <section className="preview-panel" aria-label="Video preview">
      <div className="preview-toolbar">
        <div className="segmented">
          <button
            className={!source ? "active" : ""}
            onClick={() => setSource(false)}
            aria-pressed={!source}
          >
            <Smartphone size={14} />
            Clip preview
          </button>
          <button
            className={source ? "active" : ""}
            onClick={() => setSource(true)}
            aria-pressed={source}
          >
            <Monitor size={14} />
            Source
          </button>
        </div>
        <span className="preview-resolution">
          {!source && clip
            ? clip.aspect
            : `${project.width} × ${project.height}`}
        </span>
      </div>
      <div
        className={`preview-canvas${aspectRatio >= 1 ? " wide-preview" : ""}`}
      >
        <div
          className="video-stage"
          ref={stage}
          style={
            {
              aspectRatio: aspect,
              "--video-ratio": aspectRatio,
              "--caption-color": clip?.accent || "#d6f58a",
            } as React.CSSProperties
          }
        >
          <video
            ref={videoRef}
            src={`/api/projects/${project.id}/media${project.previewFile ? "?preview=1" : ""}`}
            preload="metadata"
            playsInline
            muted={muted}
            style={{
              objectFit: source ? "contain" : clip?.fit || "cover",
              objectPosition: `${clip?.cropX ?? 50}% ${clip?.cropY ?? 50}%`,
            }}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              onTime(v.currentTime);
              if (!source && clip && !v.paused && v.currentTime >= clip.end) {
                v.pause();
                v.currentTime = clip.start;
              }
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onError={() => setError(true)}
            onLoadedMetadata={(event) => {
              setError(false);
              if (clip) {
                event.currentTarget.currentTime = clip.start;
                onTime(clip.start);
              }
            }}
            onClick={play}
            aria-label="Source video"
          />
          {!source && clip?.captions && caption && (
            <div
              className={`caption-preview caption-${clip.captionStyle}`}
              style={{
                bottom: `${clip.captionPosition}%`,
                fontSize: `${(clip.captionSize * captionEmScale(caption)) / 10.8}cqw`,
                fontFamily: usesCyrillic(caption)
                  ? '"Cutroom Caption Fallback", sans-serif'
                  : undefined,
              }}
            >
              <span className="caption-content" style={cue && ["pop", "punch"].includes(clip.captionStyle) ? { display: "inline-block", transform: `scale(${captionPopScale(captionTime-cue.start)})` } : undefined}>
                {["highlight", "reveal"].includes(clip.captionStyle) && cue
                  ? cue.words.map((word, index) => (
                    clip.captionStyle === "reveal" && captionTime < word.start ? null :
                      <span
                        key={index}
                        className={
                          captionTime >= word.start &&
                          captionTime < (cue.words[index + 1]?.start ?? cue.end)
                            ? "active-word"
                            : ""
                        }
                      >
                        {word.word}
                        {index < cue.words.length - 1 ? " " : ""}
                      </span>
                    ))
                  : caption}
              </span>
            </div>
          )}
          {!playing && !error && (
            <button
              className="play-overlay"
              onClick={play}
              aria-label="Play video"
            >
              <Play size={28} fill="currentColor" />
            </button>
          )}
          {error && (
            <div className="video-error">
              <strong>This format needs a preview copy.</strong>
              <p>Your original video will stay intact.</p>
              <Button size="small" onClick={onPreviewError}>
                Create browser preview
              </Button>
            </div>
          )}
        </div>
      </div>
      <div className="transport">
        <div className="transport-buttons">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (videoRef.current)
                videoRef.current.currentTime = clip?.start || 0;
            }}
            aria-label="Back to clip start"
          >
            <RotateCcw size={17} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={play}
            aria-label={playing ? "Pause video" : "Play video"}
          >
            {playing ? (
              <Pause size={19} fill="currentColor" />
            ) : (
              <Play size={19} fill="currentColor" />
            )}
          </Button>
          <span className="timecode">
            {time(currentTime, true)} <span>/ {time(project.duration)}</span>
          </span>
        </div>
        <div className="transport-buttons">
          <Button
            variant="ghost"
            size="icon"
            aria-label={muted ? "Unmute video" : "Mute video"}
            onClick={() => setMuted(!muted)}
          >
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Fullscreen preview"
            onClick={() =>
              void stage.current?.requestFullscreen().catch(() => {})
            }
          >
            <Maximize size={17} />
          </Button>
        </div>
      </div>
    </section>
  );
}
