import { useRef, useState } from "react";
import {
  Captions,
  ScanFace,
  Search,
  FileUp,
  Pencil,
  Check,
  X,
  SlidersHorizontal,
  AlignCenter,
  Download,
  Plus,
  AudioLines,
} from "lucide-react";
import type { Clip, Project, Segment } from "../../shared/types";
import { Button } from "./ui/button";
import { hasMeasuredWords } from "../../shared/captions";
import { time } from "../lib/utils";

export function Inspector({
  project,
  clip,
  currentTime,
  change,
  seek,
  saveTranscript,
  importSubtitles,
  transcribe,
  reframe,
  createFromSegments,
  busy,
  onCaptionDraftChange,
}: {
  project: Project;
  clip: Clip | null;
  currentTime: number;
  change: (patch: Partial<Clip>) => void;
  seek: (n: number) => void;
  saveTranscript: (segments: Segment[]) => Promise<void>;
  importSubtitles: (file: File) => void;
  transcribe: () => void;
  reframe: () => void;
  createFromSegments: (segments: Segment[]) => void;
  busy: boolean;
  onCaptionDraftChange: (dirty: boolean) => void;
}) {
  const [tab, setTab] = useState("transcript");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const captionDirty =
    editing !== null &&
    text !== project.transcript.find((segment) => segment.id === editing)?.text;
  const filtered = project.transcript.filter((s) =>
    s.text.toLowerCase().includes(query.toLowerCase()),
  );
  async function save(segment: Segment) {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await saveTranscript(
        project.transcript.map((s) =>
          s.id === segment.id
            ? { ...s, text: text.trim(), words: undefined }
            : s,
        ),
      );
      setEditing(null);
      onCaptionDraftChange(false);
    } catch {
      /* The editor reports the save error and preserves the caption draft. */
    } finally {
      setSaving(false);
    }
  }
  return (
    <aside className="inspector" aria-label="Clip inspector">
      <div className="inspector-tabs" role="tablist" aria-label="Clip tools">
        {[
          { id: "transcript", icon: Captions, label: "Transcript" },
          { id: "style", icon: SlidersHorizontal, label: "Style" },
          { id: "frame", icon: ScanFace, label: "Frame" },
        ].map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            id={`tab-${t.id}`}
            className={tab === t.id ? "active" : ""}
            disabled={captionDirty && tab !== t.id}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>
      <div
        className="inspector-body"
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        {tab === "transcript" && (
          <>
            <input
              type="file"
              ref={input}
              accept=".srt,.vtt"
              className="sr-only"
              aria-label="Import subtitles"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importSubtitles(f);
                e.target.value = "";
              }}
            />
            {project.transcript.length ? (
              <>
                <div className="transcript-toolbar">
                  <div className="search-field">
                    <Search size={15} />
                    <input
                      aria-label="Search transcript"
                      placeholder="Find a word or a moment…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <div className="row-between">
                    <span className="subtle">
                      {project.transcript.length} passages ·{" "}
                      {project.language?.toUpperCase() || "Imported"}
                    </span>
                    <div className="row">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Import SRT or VTT"
                        disabled={captionDirty}
                        onClick={() => input.current?.click()}
                      >
                        <FileUp size={15} />
                      </Button>
                      <a
                        className="button button-ghost button-icon"
                        href={`/api/projects/${project.id}/subtitles`}
                        aria-label="Download transcript as SRT"
                      >
                        <Download size={15} />
                      </a>
                    </div>
                  </div>
                </div>
                {captionDirty && (
                  <p className="caption-draft-note" role="status">
                    Save or cancel this caption edit before leaving.
                  </p>
                )}
                <div className="transcript-list">
                  {filtered.map((s) => (
                    <article
                      key={s.id}
                      className={`transcript-segment ${currentTime >= s.start && currentTime < s.end ? "current" : ""} ${selected.includes(s.id) ? "selected" : ""}`}
                    >
                      <div className="segment-meta">
                        <div className="segment-select">
                          <label className="segment-checkbox">
                            <input
                              type="checkbox"
                              aria-label={`Select passage at ${time(s.start)}`}
                              checked={selected.includes(s.id)}
                              onChange={(e) =>
                                setSelected(
                                  e.target.checked
                                    ? [...selected, s.id]
                                    : selected.filter((id) => id !== s.id),
                                )
                              }
                            />
                          </label>
                          <button
                            className="time-link"
                            onClick={() => seek(s.start)}
                          >
                            {time(s.start)}
                          </button>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit caption at ${time(s.start)}`}
                          disabled={captionDirty && editing !== s.id}
                          onClick={() => {
                            setEditing(s.id);
                            setText(s.text);
                            onCaptionDraftChange(false);
                          }}
                        >
                          <Pencil size={13} />
                        </Button>
                      </div>
                      {editing === s.id ? (
                        <div className="caption-edit">
                          <textarea
                            aria-label="Caption text"
                            value={text}
                            onChange={(e) => {
                              setText(e.target.value);
                              onCaptionDraftChange(e.target.value !== s.text);
                            }}
                            autoFocus
                            rows={3}
                            maxLength={4000}
                          />
                          <div className="row">
                            <Button
                              size="small"
                              disabled={!text.trim() || saving}
                              onClick={() => void save(s)}
                            >
                              <Check size={14} />
                              Save
                            </Button>
                            <Button
                              variant="ghost"
                              size="small"
                              onClick={() => {
                                setEditing(null);
                                onCaptionDraftChange(false);
                              }}
                            >
                              <X size={14} />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="transcript-text"
                          onClick={() => seek(s.start)}
                        >
                          {s.text}
                        </button>
                      )}
                    </article>
                  ))}
                  {!filtered.length && (
                    <div className="small-empty">
                      <Search size={24} />
                      <p>No passages match “{query}”.</p>
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={() => setQuery("")}
                      >
                        Clear search
                      </Button>
                    </div>
                  )}
                </div>
                <div className="transcript-footer">
                  {selected.length ? (
                    <Button
                      size="small"
                      onClick={() => {
                        createFromSegments(
                          project.transcript.filter((s) =>
                            selected.includes(s.id),
                          ),
                        );
                        setSelected([]);
                      }}
                    >
                      <Plus size={15} />
                      Clip selected range ({selected.length})
                    </Button>
                  ) : (
                    <p>Select passages to make a clip. Click text to seek.</p>
                  )}
                  <Button
                    variant="ghost"
                    size="small"
                    disabled={busy || captionDirty}
                    onClick={transcribe}
                  >
                    Transcribe again
                  </Button>
                </div>
              </>
            ) : (
              <div className="inspector-empty">
                <span className="empty-icon">
                  <AudioLines size={30} />
                </span>
                <h3>
                  Find the words.
                  <br />
                  Find the good parts.
                </h3>
                <p>
                  Local Whisper turns speech into an editable transcript. Then
                  choose the passages worth sharing.
                </p>
                <Button
                  onClick={transcribe}
                  disabled={busy || !project.hasAudio}
                >
                  <Captions size={16} />
                  Transcribe video
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => input.current?.click()}
                >
                  <FileUp size={16} />
                  Import SRT / VTT
                </Button>
                <small>
                  {project.hasAudio
                    ? "Audio stays on this computer."
                    : "No audio track. Add captions with an SRT file."}
                </small>
              </div>
            )}
          </>
        )}
        {tab === "style" &&
          (clip ? (
            <div className="style-panel">
              <div className="row-between">
                <div>
                  <h3>Make it readable.</h3>
                  <p className="subtle">Captions that fit your footage.</p>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    aria-label="Show captions"
                    checked={clip.captions}
                    onChange={(e) => change({ captions: e.target.checked })}
                  />
                  <span />
                </label>
              </div>
              {!project.transcript.length && (
                <p className="notice">
                  Transcribe or import subtitles to see captions in your video.
                </p>
              )}
              <fieldset className="preset-grid">
                <legend>Caption preset</legend>
                {[
                  { id: "pop", label: "Word Pop", sample: "MOMENT." },
                  { id: "punch", label: "Punchy Phrases", sample: "THIS IS THE MOMENT." },
                  { id: "reveal", label: "Build-up", sample: "This is the…" },
                  { id: "studio", label: "Studio", sample: "Make it count." },
                  { id: "bold", label: "Bold", sample: "MAKE IT COUNT." },
                  { id: "minimal", label: "Minimal", sample: "Make it count." },
                  {
                    id: "highlight",
                    label: "Highlight",
                    sample: "Make it count.",
                  },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={clip.captionStyle === p.id}
                    className={`caption-preset ${clip.captionStyle === p.id ? "active" : ""}`}
                    onClick={() =>
                      change({ captionStyle: p.id as Clip["captionStyle"], captionMode: p.id === "pop" ? "word" : ["punch", "reveal"].includes(p.id) ? "short" : "auto" })
                    }
                  >
                    <span className={`preset-sample preset-${p.id}`}>
                      {p.sample}
                    </span>
                    <span>
                      {p.label}
                      {clip.captionStyle === p.id && <Check size={13} />}
                    </span>
                  </button>
                ))}
              </fieldset>
              <p className="caption-style-description">{
                clip.captionStyle === "pop" ? "One bold word lands on each spoken beat, with a quick scale pop."
                  : clip.captionStyle === "punch" ? "Short uppercase phrases pop into view, then clear for the next thought."
                  : clip.captionStyle === "reveal" ? "Words appear as they are spoken. The current word carries your accent color."
                  : "Choose the pacing below. Measured word timings stay tied to the original speech."
              }</p>
              <label className="field-label">Words on screen
                <select value={clip.captionMode ?? "auto"} onChange={(e) => change({ captionMode: e.target.value as Clip["captionMode"] })}>
                  <option value="auto">Preset pacing</option><option value="word">One word at a time</option><option value="short">Short phrases · 1–2 seconds</option>
                </select>
              </label>
              {(clip.captionMode === "short" || ((!clip.captionMode || clip.captionMode === "auto") && ["punch", "reveal"].includes(clip.captionStyle))) && <label className="field-label">Maximum phrase duration
                <select value={clip.captionDuration ?? 1.5} onChange={(e) => change({ captionDuration: Number(e.target.value) })}>
                  <option value={1}>1 second</option><option value={1.5}>1.5 seconds</option><option value={2}>2 seconds</option>
                </select>
              </label>}
              {project.transcript.some((s) => s.end > clip.start && s.start < clip.end && !hasMeasuredWords(s)) && <p className="notice">
                Some words use estimated timing. SRT/VTT and edited passages do not have measured word timestamps. Transcribe the source with Whisper for speech-aligned word timing.
              </p>}
              <label className="control-label">
                Caption size <b>{clip.captionSize}</b>
                <input
                  type="range"
                  min={24}
                  max={96}
                  step={2}
                  value={clip.captionSize}
                  onChange={(e) =>
                    change({ captionSize: Number(e.target.value) })
                  }
                />
              </label>
              <label className="control-label">
                Position from bottom <b>{clip.captionPosition}%</b>
                <input
                  type="range"
                  min={10}
                  max={45}
                  step={1}
                  value={clip.captionPosition}
                  onChange={(e) =>
                    change({ captionPosition: Number(e.target.value) })
                  }
                />
              </label>
              {["highlight", "pop", "reveal"].includes(clip.captionStyle) && (
                <fieldset className="color-options">
                  <legend>Highlight color</legend>
                  {[
                    ["#d6f58a", "lime"],
                    ["#ffffff", "white"],
                    ["#ffe28a", "warm yellow"],
                    ["#a9d9ff", "sky blue"],
                    ["#ffc6a8", "peach"],
                  ].map(([color, name]) => (
                    <button
                      key={color}
                      className={clip.accent === color ? "active" : ""}
                      style={{ background: color }}
                      aria-label={`Use ${name} highlight`}
                      aria-pressed={clip.accent === color}
                      onClick={() => change({ accent: color })}
                    >
                      {clip.accent === color && <Check size={17} />}
                    </button>
                  ))}
                </fieldset>
              )}
              <div className="inspector-note">
                <AlignCenter size={18} />
                <p>
                  Check caption placement in the final export. Leave space for
                  the buttons and labels on your publishing platform.
                </p>
              </div>
            </div>
          ) : (
            <div className="small-empty">
              <p>Create a clip to customize captions.</p>
            </div>
          ))}
        {tab === "frame" &&
          (clip ? (
            <div className="style-panel">
              <div>
                <h3>A frame for every feed.</h3>
                <p className="subtle">
                  Choose a format, then place your subject.
                </p>
              </div>
              <fieldset className="aspect-grid">
                <legend>Aspect ratio</legend>
                {(["9:16", "1:1", "16:9", "4:5"] as const).map((a) => (
                  <button
                    key={a}
                    className={clip.aspect === a ? "active" : ""}
                    aria-pressed={clip.aspect === a}
                    onClick={() => change({ aspect: a })}
                  >
                    <i style={{ aspectRatio: a.replace(":", "/") }} />
                    <strong>{a}</strong>
                    <small>
                      {a === "9:16"
                        ? "Vertical"
                        : a === "1:1"
                          ? "Square"
                          : a === "16:9"
                            ? "Landscape"
                            : "Portrait"}
                    </small>
                  </button>
                ))}
              </fieldset>
              <fieldset>
                <legend>How footage fits</legend>
                <div className="segmented full">
                  <button
                    className={clip.fit === "cover" ? "active" : ""}
                    aria-pressed={clip.fit === "cover"}
                    onClick={() => change({ fit: "cover" })}
                  >
                    Fill the frame
                  </button>
                  <button
                    className={clip.fit === "contain" ? "active" : ""}
                    aria-pressed={clip.fit === "contain"}
                    onClick={() => change({ fit: "contain" })}
                  >
                    Fit full video
                  </button>
                </div>
              </fieldset>
              <label className="control-label">
                Horizontal position <b>{Math.round(clip.cropX)}%</b>
                <input
                  disabled={clip.fit === "contain"}
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={clip.cropX}
                  onChange={(e) => change({ cropX: Number(e.target.value) })}
                />
              </label>
              <label className="control-label">
                Vertical position <b>{Math.round(clip.cropY)}%</b>
                <input
                  disabled={clip.fit === "contain"}
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={clip.cropY}
                  onChange={(e) => change({ cropY: Number(e.target.value) })}
                />
              </label>
              <Button
                variant="secondary"
                disabled={busy || clip.fit === "contain"}
                onClick={reframe}
              >
                <ScanFace size={17} />
                Find the face
              </Button>
              <p className="subtle">
                Samples seven frames and centers the largest detected face. Best
                for a single speaker; this is a fixed crop, not motion tracking.
              </p>
              <Button
                variant="ghost"
                size="small"
                onClick={() => change({ cropX: 50, cropY: 50 })}
              >
                Reset to center
              </Button>
            </div>
          ) : (
            <div className="small-empty">
              <p>Create a clip to adjust framing.</p>
            </div>
          ))}
      </div>
    </aside>
  );
}
