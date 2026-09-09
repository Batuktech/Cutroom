import type { Clip, Project } from "../../shared/types";
import { time } from "../lib/utils";
import { Scissors, AudioLines } from "lucide-react";
import { TimecodeInput } from "./TimecodeInput";
import { Button } from "./ui/button";
export function Timeline({
  project,
  clip,
  currentTime,
  seek,
  change,
}: {
  project: Project;
  clip: Clip | null;
  currentTime: number;
  seek: (n: number) => void;
  change: (patch: Partial<Clip>) => void;
}) {
  const duration = project.duration;
  const points = Array.from({ length: 7 }, (_, i) => (i * duration) / 6);
  const waveform = Array.from(
    { length: Math.min(100, project.waveform.length) },
    (_, i) => {
      const start = Math.floor(
        (i * project.waveform.length) / Math.min(100, project.waveform.length),
      );
      const end = Math.floor(
        ((i + 1) * project.waveform.length) /
          Math.min(100, project.waveform.length),
      );
      return Math.max(...project.waveform.slice(start, end), 0);
    },
  );
  return (
    <section className="timeline-panel" aria-label="Clip timeline">
      <div className="timeline-heading">
        <h2>
          <Scissors size={15} />
          The cut
        </h2>
        <span>
          {clip
            ? `${time(clip.end - clip.start, true)} selected`
            : "Select a clip to trim"}
        </span>
      </div>
      <div className="timeline-ruler">
        {points.map((n) => (
          <span key={n}>{time(n)}</span>
        ))}
      </div>
      <div className="waveform-track">
        <div className="waveform" aria-hidden="true">
          {project.waveform.length ? (
            waveform.map((n, i) => (
              <i key={i} style={{ height: `${Math.max(5, n * 85)}%` }} />
            ))
          ) : (
            <span className="no-audio">
              <AudioLines size={18} />
              {project.hasAudio
                ? "Waveform unavailable"
                : "Video without audio"}
            </span>
          )}
        </div>
        {clip && (
          <div
            className="timeline-selection"
            style={{
              left: `${(clip.start / duration) * 100}%`,
              width: `${((clip.end - clip.start) / duration) * 100}%`,
            }}
          >
            <span className="trim-edge left" />
            <span className="trim-edge right" />
          </div>
        )}
        <div
          className="playhead"
          style={{ left: `${(currentTime / duration) * 100}%` }}
        />
        <input
          aria-label="Seek video"
          className="timeline-seek"
          type="range"
          min={0}
          max={duration}
          step={0.05}
          value={Math.min(currentTime, duration)}
          onChange={(e) => seek(Number(e.target.value))}
        />
      </div>
      {clip && (
        <div className="precise-trim" key={clip.id}>
          <div className="timecode-pair">
            <TimecodeInput
              key={`in-${clip.start}`}
              label="In time"
              value={clip.start}
              min={Math.max(0, clip.end - 1800)}
              max={clip.end - 0.5}
              commit={(start) => {
                change({ start });
                seek(start);
              }}
            />
            <TimecodeInput
              key={`out-${clip.end}`}
              label="Out time"
              value={clip.end}
              min={clip.start + 0.5}
              max={Math.min(duration, clip.start + 1800)}
              commit={(end) => change({ end })}
            />
          </div>
          <div className="mark-buttons">
            <Button
              variant="ghost"
              size="small"
              disabled={
                currentTime > clip.end - 0.5 || clip.end - currentTime > 1800
              }
              onClick={() => change({ start: currentTime })}
            >
              Set in here <kbd>I</kbd>
            </Button>
            <Button
              variant="ghost"
              size="small"
              disabled={
                currentTime < clip.start + 0.5 ||
                currentTime - clip.start > 1800
              }
              onClick={() => change({ end: currentTime })}
            >
              Set out here <kbd>O</kbd>
            </Button>
          </div>
        </div>
      )}
      {clip && (
        <div className="trim-sliders">
          <label>
            <span>
              In point <b>{time(clip.start, true)}</b>
            </span>
            <input
              type="range"
              min={Math.max(0, clip.end - 1800)}
              max={Math.max(0, clip.end - 0.5)}
              step={0.001}
              value={clip.start}
              onChange={(e) => {
                change({ start: Number(e.target.value) });
                seek(Number(e.target.value));
              }}
            />
          </label>
          <label>
            <span>
              Out point <b>{time(clip.end, true)}</b>
            </span>
            <input
              type="range"
              min={clip.start + 0.5}
              max={Math.min(duration, clip.start + 1800)}
              step={0.001}
              value={clip.end}
              onChange={(e) => change({ end: Number(e.target.value) })}
            />
          </label>
        </div>
      )}
      <p className="timeline-hint">
        Click the waveform to seek. Trim with the sliders or enter exact times.
      </p>
    </section>
  );
}
