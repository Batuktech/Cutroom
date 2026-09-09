import { useState } from "react";
import { Download, LoaderCircle, Plus, Scissors } from "lucide-react";
import type { Job, Project } from "../../shared/types";
import { post } from "../lib/api";
import { time } from "../lib/utils";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Empty } from "./Empty";

export function Clips({
  projects,
  openProject,
  upload,
  openLibrary,
  queued,
  notify,
}: {
  projects: Project[];
  openProject: (projectId: string, clipId: string) => void;
  upload: () => void;
  openLibrary: () => void;
  queued: () => Promise<void>;
  notify: (message: string, error?: boolean) => void;
}) {
  const [projectFilter, setProjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportOpen, setExportOpen] = useState(false);
  const [quality, setQuality] = useState("1080");
  const [busy, setBusy] = useState(false);
  const allClips = projects.flatMap((project) =>
    project.clips.map((clip) => ({ ...clip, project })),
  );
  const clips = allClips.filter(
    (clip) =>
      (!projectFilter || clip.project.id === projectFilter) &&
      (!statusFilter || clip.status === statusFilter),
  );
  const selection = allClips.filter((clip) => selected.has(clip.id));
  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < 50) next.add(id);
      return next;
    });
  }
  async function render() {
    setBusy(true);
    try {
      const jobs = await post<Job[]>("/exports/batch", {
        clips: selection.map((clip) => ({
          projectId: clip.project.id,
          clipId: clip.id,
        })),
        quality,
      });
      setExportOpen(false);
      setSelected(new Set());
      await queued();
      notify(
        `${jobs.length} clip${jobs.length === 1 ? "" : "s"} in the local render queue.`,
      );
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>The good parts.</h1>
          <p>
            Every cut, across every project. Choose a clip to edit or select a
            set to render.
          </p>
        </div>
        <Button onClick={upload}>
          <Plus size={17} /> Import video
        </Button>
      </div>
      {allClips.length ? (
        <>
          <div className="clip-filters">
            <label>
              Project
              <select
                value={projectFilter}
                onChange={(event) => {
                  setProjectFilter(event.target.value);
                  setSelected(new Set());
                }}
              >
                <option value="">All projects</option>
                {projects
                  .filter((project) => project.clips.length)
                  .map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setSelected(new Set());
                }}
              >
                <option value="">All clips</option>
                <option value="draft">Drafts</option>
                <option value="exported">Exported</option>
              </select>
            </label>
            <div className="batch-actions">
              <Button
                variant="ghost"
                size="small"
                disabled={!clips.length}
                onClick={() =>
                  setSelected(
                    selection.length
                      ? new Set()
                      : new Set(clips.slice(0, 50).map((clip) => clip.id)),
                  )
                }
              >
                {selection.length
                  ? "Clear selection"
                  : clips.length > 50
                    ? "Select first 50"
                    : "Select all"}
              </Button>
              <Button
                size="small"
                disabled={!selection.length}
                onClick={() => setExportOpen(true)}
              >
                <Download size={15} /> Export selected
                {selection.length ? ` (${selection.length})` : ""}
              </Button>
            </div>
          </div>
          <p className="clip-selection-note" aria-live="polite">
            {clips.length} clip{clips.length === 1 ? "" : "s"}
            {selection.length
              ? ` · ${selection.length} selected`
              : " · Select up to 50 clips to render together"}
          </p>
          {clips.length ? (
            <div className="all-clips-grid">
              {clips.map((clip, index) => (
                <article
                  className={`selectable-clip ${selected.has(clip.id) ? "selected" : ""}`}
                  key={clip.id}
                >
                  <label className="clip-checkbox">
                    <input
                      type="checkbox"
                      checked={selected.has(clip.id)}
                      disabled={!selected.has(clip.id) && selected.size >= 50}
                      aria-label={`Select ${clip.title} from ${clip.project.name}`}
                      onChange={() => toggle(clip.id)}
                    />
                  </label>
                  <button
                    className="global-clip-card"
                    onClick={() => openProject(clip.project.id, clip.id)}
                  >
                    <div className="global-clip-preview">
                      {clip.project.thumbnail && (
                        <img
                          src={`/api/projects/${clip.project.id}/thumbnail`}
                          alt=""
                        />
                      )}
                      <span className="global-clip-overlay">
                        <Scissors size={21} />
                        <b>{String(index + 1).padStart(2, "0")}</b>
                      </span>
                      <span className="duration-badge">
                        {time(clip.end - clip.start)}
                      </span>
                    </div>
                    <div>
                      <span className="eyebrow">{clip.project.name}</span>
                      <h3>{clip.title}</h3>
                      <p>
                        {clip.aspect} ·{" "}
                        {clip.status === "exported" ? "Exported" : "Draft"} ·{" "}
                        {time(clip.start)}–{time(clip.end)}
                      </p>
                    </div>
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              icon={Scissors}
              title="No clips in this view."
              copy="Try another project or status to find your next cut."
              action="Clear filters"
              onClick={() => {
                setProjectFilter("");
                setStatusFilter("");
              }}
            />
          )}
        </>
      ) : (
        <Empty
          icon={Scissors}
          title="A good cut starts with a source."
          copy="Import a video, transcribe it, and choose a passage. Your clips will collect here."
          action="Open the studio"
          onClick={openLibrary}
        />
      )}
      <Dialog
        open={exportOpen}
        onOpenChange={(open) => {
          if (!busy) setExportOpen(open);
        }}
        title={`Render ${selection.length} selected clip${selection.length === 1 ? "" : "s"}`}
        description="Each clip uses its saved framing and caption settings. Videos render one at a time on this computer."
      >
        <ul className="batch-summary">
          {selection.map((clip) => (
            <li key={clip.id}>
              <strong>{clip.title}</strong>
              <span>
                {clip.aspect} · {time(clip.end - clip.start)}
              </span>
            </li>
          ))}
        </ul>
        <label className="field-label">
          Export resolution
          <select
            value={quality}
            onChange={(event) => setQuality(event.target.value)}
            disabled={busy}
          >
            <option value="1080">Full HD · 1080p</option>
            <option value="720">Smaller file · 720p</option>
          </select>
        </label>
        <p className="restore-note">
          Each render includes an MP4 and a separate SRT. Review the results in
          Exports, then download the delivery pack.
        </p>
        <div className="dialog-actions">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => setExportOpen(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={busy || !selection.length}
            onClick={() => void render()}
          >
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Download size={16} />
            )}{" "}
            {busy ? "Adding to queue…" : "Start rendering"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
