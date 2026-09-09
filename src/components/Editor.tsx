import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ChevronDown,
  Download,
  Plus,
  Scissors,
  Check,
  LoaderCircle,
  Trash2,
  Copy,
} from "lucide-react";
import type { Clip, Health, Job, Project, Segment } from "../../shared/types";
import { api, post } from "../lib/api";
import { time } from "../lib/utils";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Preview } from "./Preview";
import { Timeline } from "./Timeline";
import { Inspector } from "./Inspector";
import { sameClipEdits } from "../../shared/clips";
import { SuggestionDialog } from "./SuggestionDialog";

export function Editor({
  project,
  health,
  jobs,
  back,
  refresh,
  notify,
  openSettings,
  initialClip,
}: {
  project: Project;
  health: Health | null;
  jobs: Job[];
  back: () => void;
  refresh: () => Promise<void>;
  notify: (message: string, error?: boolean) => void;
  openSettings: () => void;
  initialClip?: string;
}) {
  const [selectedId, setSelectedId] = useState(
    initialClip || project.clips[0]?.id || "",
  );
  const selected = project.clips.find((c) => c.id === selectedId) || null;
  const [draft, setDraft] = useState<Clip | null>(selected);
  const [currentTime, setCurrentTime] = useState(0);
  const [saving, setSaving] = useState(false);
  const [captionDirty, setCaptionDirty] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [transcribeOpen, setTranscribeOpen] = useState(false);
  const [quality, setQuality] = useState("1080");
  const [language, setLanguage] = useState("auto");
  const [modelChoice, setModel] = useState<string | null>(null);
  const model = modelChoice ?? ["large-v3", "small", "base", "tiny"].find(
    (id) => health?.models.some((m) => m.id === id && m.installed),
  ) ?? "tiny";
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingSelect, setPendingSelect] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const dirty = !sameClipEdits(draft, selected);
  const activeJob = jobs.find(
    (j) =>
      j.projectId === project.id && ["running", "queued"].includes(j.status),
  );
  const busy = Boolean(activeJob);
  const previousSelected = useRef(selected);
  const allowNavigation = useRef(false);
  const finishCaptionFirst = useCallback(() => {
    notify("Save or cancel the caption you are editing before leaving.", true);
    const field = document.querySelector<HTMLTextAreaElement>(
      ".caption-edit textarea",
    );
    field?.scrollIntoView({ block: "center" });
    field?.focus();
  }, [notify]);
  useEffect(() => {
    if (previousSelected.current !== selected) {
      if (
        sameClipEdits(draft, previousSelected.current) ||
        selected?.id !== previousSelected.current?.id
      )
        setDraft(selected);
      previousSelected.current = selected;
    }
  }, [selected, draft]);
  useEffect(() => {
    function beforeUnload(e: BeforeUnloadEvent) {
      if (dirty || captionDirty) e.preventDefault();
    }
    function beforeNavigate(event: Event) {
      if (captionDirty) {
        event.preventDefault();
        finishCaptionFirst();
        return;
      }
      if (allowNavigation.current) {
        allowNavigation.current = false;
        return;
      }
      if (dirty) {
        event.preventDefault();
        setPendingSelect(`route:${(event as CustomEvent<string>).detail}`);
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("cutroom:before-navigate", beforeNavigate);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("cutroom:before-navigate", beforeNavigate);
    };
  }, [dirty, captionDirty, finishCaptionFirst]);
  function finishNavigation() {
    allowNavigation.current = true;
    if (pendingSelect === "back") back();
    else if (pendingSelect?.startsWith("route:"))
      window.location.hash = pendingSelect.slice(6);
    else if (pendingSelect) {
      setSelectedId(pendingSelect);
      allowNavigation.current = false;
    }
    setPendingSelect(null);
  }
  function change(patch: Partial<Clip>) {
    setDraft((c) => (c ? { ...c, ...patch } : c));
  }
  function seek(n: number) {
    if (video.current) video.current.currentTime = n;
    setCurrentTime(n);
  }
  function select(id: string) {
    if (dirty) {
      setPendingSelect(id);
      return;
    }
    setSelectedId(id);
    const c = project.clips.find((c) => c.id === id);
    if (c) seek(c.start);
  }
  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      await api(`/projects/${project.id}/clips/${draft.id}`, {
        method: "PUT",
        body: JSON.stringify(draft),
      });
      await refresh();
      notify("Clip changes saved.");
      return true;
    } catch (e) {
      notify((e as Error).message, true);
      return false;
    } finally {
      setSaving(false);
    }
  }
  async function action(fn: () => Promise<unknown>, message: string) {
    try {
      await fn();
      await refresh();
      notify(message);
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  const saveAfterField = useEffectEvent(() => {
    if (dirty && !saving) void save();
  });
  const shortcut = useEffectEvent((event: KeyboardEvent) => {
    if (document.querySelector('[role="dialog"]')) return;
    const target = event.target as HTMLElement;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (target.closest(".caption-edit")) {
        target
          .closest(".caption-edit")
          ?.querySelector<HTMLButtonElement>("button")
          ?.click();
        return;
      }
      if (target.closest(".timecode-field")) {
        target.blur();
        requestAnimationFrame(saveAfterField);
        return;
      }
      if (dirty && !saving) void save();
      return;
    }
    if (
      !draft ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      target.closest('input,textarea,select,[contenteditable="true"]')
    )
      return;
    if (
      event.key.toLowerCase() === "i" &&
      currentTime <= draft.end - 0.5 &&
      draft.end - currentTime <= 1800
    ) {
      event.preventDefault();
      change({ start: currentTime });
    }
    if (
      event.key.toLowerCase() === "o" &&
      currentTime >= draft.start + 0.5 &&
      currentTime - draft.start <= 1800
    ) {
      event.preventDefault();
      change({ end: currentTime });
    }
  });
  useEffect(() => {
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  async function create(
    start = Math.min(currentTime, Math.max(0, project.duration - 1)),
    end = Math.min(project.duration, start + 30),
    title = "Untitled clip",
  ) {
    if (dirty && !(await save())) return;
    const clip = {
      title,
      start,
      end,
      aspect: "16:9",
      cropX: 50,
      cropY: 50,
      fit: "cover",
      captionStyle: "highlight",
      captions: true,
      captionSize: 52,
      captionPosition: 20,
      accent: "#d6f58a",
    };
    try {
      const p = await post<Project>(`/projects/${project.id}/clips`, clip);
      await refresh();
      setSelectedId(p.clips.at(-1)!.id);
      seek(start);
      notify("New clip created.");
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  async function doExport() {
    if (!draft || (dirty && !(await save()))) return;
    await action(
      () =>
        post(`/projects/${project.id}/clips/${draft.id}/export`, { quality }),
      "Export added to the local queue.",
    );
    setExportOpen(false);
  }
  async function duplicate() {
    if (!draft) return;
    try {
      const p = await post<Project>(`/projects/${project.id}/clips`, {
        ...draft,
        title: `${draft.title.slice(0, 110)} copy`,
      });
      await refresh();
      setSelectedId(p.clips.at(-1)!.id);
      notify("Clip duplicated.");
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  return (
    <div className="editor">
      <header className="editor-header">
        <div className="editor-title">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (captionDirty) finishCaptionFirst();
              else if (dirty) setPendingSelect("back");
              else back();
            }}
            aria-label="Back to library"
          >
            <ArrowLeft size={20} />
          </Button>
          <div>
            <span className="eyebrow">
              {project.demo ? "Sample project" : "Local project"}
            </span>
            <h1>{project.name}</h1>
          </div>
        </div>
        <div className="editor-actions">
          <span className={`save-state ${dirty ? "unsaved" : ""}`}>
            {captionDirty ? (
              "Caption edit pending"
            ) : dirty ? (
              "Unsaved changes"
            ) : (
              <>
                <Check size={13} />
                Saved locally
              </>
            )}
          </span>
          <Button
            variant="secondary"
            size="small"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving && <LoaderCircle size={14} className="spin" />}Save changes
          </Button>
          <Button
            size="small"
            disabled={!draft || busy || saving || captionDirty}
            onClick={() => setExportOpen(true)}
          >
            <Download size={16} />
            Export clip
          </Button>
        </div>
      </header>
      {activeJob && (
        <div className="editor-job" role="status">
          <LoaderCircle size={15} className="spin" />
          <span>{activeJob.message}</span>
          <progress max={100} value={activeJob.progress} />
          <span>{Math.round(activeJob.progress)}%</span>
          <Button
            variant="ghost"
            size="small"
            onClick={() =>
              void action(
                () => post(`/jobs/${activeJob.id}/cancel`),
                "Processing cancelled.",
              )
            }
          >
            Cancel
          </Button>
        </div>
      )}
      <div className="editor-layout">
        <div className="editing-column">
          <div className="clip-titlebar">
            {draft ? (
              <>
                <input
                  className="clip-title-input"
                  aria-label="Clip title"
                  value={draft.title}
                  maxLength={120}
                  onChange={(e) => change({ title: e.target.value })}
                />
                <span className="format-label">
                  {draft.aspect} <ChevronDown size={12} />
                </span>
              </>
            ) : (
              <p>Create a clip or select a transcript passage to begin.</p>
            )}
          </div>
          <Preview
            project={project}
            clip={draft}
            currentTime={currentTime}
            onTime={setCurrentTime}
            videoRef={video}
            onPreviewError={() =>
              void action(
                () => post(`/projects/${project.id}/preview`),
                "Creating a compatible preview.",
              )
            }
          />
          <Timeline
            project={project}
            clip={draft}
            currentTime={currentTime}
            seek={seek}
            change={change}
          />
          <div className="clips-section">
            <div className="section-heading">
              <h3>
                Your clips <span>{project.clips.length}</span>
              </h3>
              <div className="row">
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => setSuggestOpen(true)}
                  disabled={!project.transcript.length || captionDirty}
                >
                  <Scissors size={15} />
                  Suggest cuts
                </Button>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => void create()}
                >
                  <Plus size={15} />
                  New clip
                </Button>
              </div>
            </div>
            {project.clips.length ? (
              <div className="clip-strip">
                {project.clips.map((c, index) => (
                  <button
                    key={c.id}
                    className={`clip-item ${selectedId === c.id ? "active" : ""}`}
                    onClick={() => select(c.id)}
                  >
                    <span className="clip-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="clip-item-copy">
                      <strong>{c.title}</strong>
                      <small>
                        {time(c.start)}–{time(c.end)} · {c.aspect}
                      </small>
                    </span>
                    <span className="clip-length">
                      {Math.round(c.end - c.start)}s
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="clips-empty">
                <Scissors size={22} />
                <p>
                  Your first cut is waiting. Add a clip, or transcribe to find a
                  passage.
                </p>
              </div>
            )}
            {draft && (
              <div className="clip-detail-row">
                <p>{draft.reason || "A cut you chose."}</p>
                <div className="row">
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={() => void duplicate()}
                  >
                    <Copy size={13} />
                    Duplicate
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete selected clip"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
        <Inspector
          project={project}
          clip={draft}
          currentTime={currentTime}
          change={change}
          seek={seek}
          busy={busy}
          onCaptionDraftChange={setCaptionDirty}
          saveTranscript={async (segments) => {
            try {
              await api(`/projects/${project.id}/transcript`, {
                method: "PUT",
                body: JSON.stringify({ segments }),
              });
              await refresh();
              notify("Caption updated.");
            } catch (e) {
              notify((e as Error).message, true);
              throw e;
            }
          }}
          importSubtitles={(file) =>
            void action(
              async () =>
                post(`/projects/${project.id}/subtitles`, {
                  text: await file.text(),
                }),
              "Subtitles imported.",
            )
          }
          transcribe={() => setTranscribeOpen(true)}
          reframe={() =>
            void (async () => {
              if (dirty && !(await save())) return;
              if (draft)
                await action(
                  () =>
                    post(`/projects/${project.id}/clips/${draft.id}/reframe`),
                  "Looking for a face in your clip.",
                );
            })()
          }
          createFromSegments={(segments: Segment[]) =>
            void create(
              Math.min(...segments.map((s) => s.start)),
              Math.max(...segments.map((s) => s.end)),
              segments[0].text.slice(0, 75),
            )
          }
        />
      </div>
      <Dialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        title="Ready for the outside world."
        description="Render an MP4 on this computer. Nothing is uploaded."
      >
        <div className="export-summary">
          <Scissors size={25} />
          <div>
            <strong>{draft?.title}</strong>
            <span>
              {draft ? time(draft.end - draft.start) : ""} · {draft?.aspect} ·
              H.264 MP4
            </span>
          </div>
        </div>
        <label className="field-label">
          Resolution
          <select value={quality} onChange={(e) => setQuality(e.target.value)}>
            <option value="1080">1080p · Full HD</option>
            <option value="720">720p · Smaller file, faster render</option>
          </select>
        </label>
        <p className="notice">
          {draft?.captions && project.transcript.length
            ? "Captions will be burned into the video. An editable SRT is also saved."
            : "This export will not include burned-in captions."}{" "}
          Rendering runs one job at a time.
        </p>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setExportOpen(false)}>
            Keep editing
          </Button>
          <Button onClick={() => void doExport()} disabled={saving}>
            <Download size={16} />
            Render video
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={transcribeOpen}
        onOpenChange={setTranscribeOpen}
        title="Turn speech into your first cut."
        description="Whisper runs locally. Review its transcript before exporting, especially names and specialist terms."
      >
        <label className="field-label">
          Local model
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {health?.models.map((m) => (
              <option key={m.id} value={m.id} disabled={!m.installed}>
                {m.name}
                {m.installed ? "" : " · not installed"}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Spoken language
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {[
              ["auto", "Detect automatically"],
              ["en", "English"],
              ["mn", "Mongolian"],
              ["es", "Spanish"],
              ["fr", "French"],
              ["de", "German"],
              ["ja", "Japanese"],
              ["ko", "Korean"],
              ["zh", "Chinese"],
              ["ru", "Russian"],
              ["pt", "Portuguese"],
              ["it", "Italian"],
              ["ar", "Arabic"],
              ["hi", "Hindi"],
              ["tr", "Turkish"],
            ].map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {project.transcript.length > 0 && (
          <p className="notice">
            This replaces the current transcript, including your edits. A copy
            is saved in the local transcript-history folder. Download the current
            SRT first if you want a subtitle file you can import again.
          </p>
        )}
        <p className="notice">
          {model === "tiny"
            ? "Tiny prioritizes speed and can miss words in noisy or overlapping conversation. Choose Small or Large v3 for a more careful pass."
            : model === "large-v3"
              ? "Large v3 uses more memory and can take much longer on CPU. Review names, slang, and overlapping speech; a larger model can still make mistakes."
            : "Review overlapping speech, slang, and names against the audio. Even the larger local models can miss words."}
        </p>
        <div className="dialog-actions">
          <Button
            variant="secondary"
            onClick={() => {
              setTranscribeOpen(false);
              openSettings();
            }}
          >
            Manage models
          </Button>
          <Button
            disabled={
              !health?.models.find((m) => m.id === model)?.installed || busy
            }
            onClick={() => {
              void action(
                () =>
                  post(`/projects/${project.id}/transcribe`, {
                    model,
                    language,
                  }),
                "Local transcription queued.",
              );
              setTranscribeOpen(false);
            }}
          >
            Transcribe locally
          </Button>
        </div>
      </Dialog>
      <SuggestionDialog key={project.suggestions?.id ?? "initial"} open={suggestOpen} close={() => setSuggestOpen(false)} project={project} health={health} jobs={jobs} refresh={refresh} notify={notify} />
      <Dialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this clip?"
        description="Your source video, transcript, and finished exports will stay intact."
      >
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
            Keep clip
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (draft)
                void action(
                  () =>
                    api(`/projects/${project.id}/clips/${draft.id}`, {
                      method: "DELETE",
                    }),
                  "Clip removed.",
                );
              setDraft(null);
              setSelectedId("");
              setDeleteOpen(false);
            }}
          >
            Delete clip
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={pendingSelect !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSelect(null);
        }}
        title="Keep your changes?"
        description="This clip has edits that have not been saved."
      >
        <div className="dialog-actions">
          <Button
            variant="secondary"
            onClick={() => {
              setDraft(selected);
              finishNavigation();
            }}
          >
            Discard edits
          </Button>
          <Button
            onClick={() =>
              void (async () => {
                if (await save()) {
                  finishNavigation();
                }
              })()
            }
          >
            Save and continue
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
