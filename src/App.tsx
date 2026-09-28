import { useCallback, useEffect, useRef, useState } from "react";
import {
  Film,
  Scissors,
  Download,
  Settings2,
  Search,
  ArrowUpRight,
  HardDrive,
  Check,
  LoaderCircle,
  AlertCircle,
  X,
  ArrowRight,
  MonitorPlay,
  RefreshCw,
  Captions,
  Radio,
} from "lucide-react";
import type { Health, Job, Project } from "../shared/types";
import { api, post } from "./lib/api";
import { time } from "./lib/utils";
import { Button } from "./components/ui/button";
import { Dialog } from "./components/ui/dialog";
import { UploadDialog } from "./components/UploadDialog";
import { DeleteProjectDialog } from "./components/DeleteProjectDialog";
import { Editor } from "./components/Editor";
import { Library } from "./components/Library";
import { Settings } from "./components/Settings";
import { JobHistory } from "./components/JobHistory";
import { Exports } from "./components/Exports";
import { Clips } from "./components/Clips";
import { Streams } from "./components/Streams";
import { latestExports } from "../shared/exports";

type Page = "library" | "streams" | "clips" | "exports" | "settings";
function currentRoute() {
  return window.location.hash.slice(1) || "library";
}
function App() {
  const [projects, setProjects] = useState<Project[]>([]),
    [jobs, setJobs] = useState<Job[]>([]),
    [health, setHealth] = useState<Health | null>(null);
  const [page, setPage] = useState<Page>(
      () =>
        (["library", "streams", "clips", "exports", "settings"].includes(currentRoute())
          ? currentRoute()
          : "library") as Page,
    ),
    [projectId, setProjectId] = useState<string | null>(() =>
      currentRoute().startsWith("project/")
        ? currentRoute().split("/")[1]
        : null,
    ),
    [initialClip, setInitialClip] = useState<string | undefined>(
      () => currentRoute().split("/")[2],
    );
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [upload, setUpload] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false),
    [search, setSearch] = useState(""),
    [help, setHelp] = useState(false);
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    error: boolean;
  } | null>(null);
  const [rename, setRename] = useState<Project | null>(null),
    [name, setName] = useState(""),
    [remove, setRemove] = useState<Project | null>(null);
  const [exportPreview, setExportPreview] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const seenScans = useRef(new Map<string, number>());
  const seen = useRef(new Map<string, string>()),
    lastHealth = useRef(0);
  const lastRoute = useRef(currentRoute());
  const searchResults = useRef<HTMLDivElement>(null);
  const openWhenReady = useRef<string | null>(null);
  const notify = useCallback(
    (message: string, isError = false) =>
      setToast({ id: Date.now(), message, error: isError }),
    [],
  );
  const refresh = useCallback(async () => {
    const [p, j, h] = await Promise.all([
      api<Project[]>("/projects"),
      api<Job[]>("/jobs"),
      api<Health>("/health"),
    ]);
    setProjects(p);
    setJobs(j);
    setHealth(h);
    setError("");
    lastHealth.current = Date.now();
  }, []);
  useEffect(() => {
    Promise.resolve()
      .then(refresh)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [refresh]);
  useEffect(() => {
    let alive = true,
      polling = false;
    const timer = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const next = await api<Job[]>("/jobs");
        if (!alive) return;
        setJobs(next);
        let changed = false;
        for (const j of next) {
          const scanned = j.kind === "suggest" ? (j.result as { scanned?: number } | undefined)?.scanned : undefined;
          if (scanned !== undefined && seenScans.current.get(j.id) !== scanned) {
            changed = true;
            seenScans.current.set(j.id, scanned);
          }
          const previous = seen.current.get(j.id);
          if (
            previous !== j.status &&
            ["completed", "failed", "cancelled"].includes(j.status)
          ) {
            changed = true;
            if (openWhenReady.current === j.id) {
              openWhenReady.current = null;
              const id = (j.result as { projectId?: string })?.projectId;
              if (
                j.status === "completed" &&
                id &&
                currentRoute() === "library"
              )
                window.location.hash = `project/${id}`;
            }
            if (previous) {
              if (j.status === "failed") notify(j.message, true);
              else if (j.status === "cancelled") notify(j.kind === "publish" ? "Remaining preparation stopped. Manage posts already accepted in Postiz." : "Processing cancelled.");
              else if (j.kind === "reframe")
                notify(
                  (j.result as { applied?: boolean })?.applied === false
                    ? "Your framing changed during face detection, so your newer edit was kept."
                    : (j.result as { found?: boolean })?.found
                      ? "Face found. Framing updated."
                      : "No face found. Use the position sliders to frame your subject.",
                );
              else if (j.kind === "export")
                notify("Your video is ready in Exports.");
              else if (j.kind === "transcribe")
                notify(
                  (j.result as { segments?: number })?.segments
                    ? "Transcript ready. Review it and choose your cuts."
                    : "No speech detected. You can import subtitles instead.",
                );
              else if (j.kind === "import" || j.kind === "download")
                notify("Video imported. Your editing room is ready.");
              else if (j.kind === "model") notify("Local model installed.");
              else if (j.kind === "suggest") notify("Clip analysis finished. Open Suggest cuts to review the result.");
              else if (j.kind === "social-copy" && j.status === "completed") notify("Social copy is ready. Open Prepare posts to review it.");
              else if (j.kind === "publish" && j.status === "completed") notify("Posts accepted by Postiz. Check its calendar for publishing status.");
            }
          }
          seen.current.set(j.id, j.status);
        }
        if (changed) {
          const p = await api<Project[]>("/projects");
          if (alive) setProjects(p);
        }
        if (changed || Date.now() - lastHealth.current > 15000) {
          const h = await api<Health>("/health");
          if (alive) setHealth(h);
          lastHealth.current = Date.now();
        }
      } catch {
        /* Keep an open edit intact during a temporary server disconnect. */
      } finally {
        polling = false;
      }
    }, 1500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [notify]);
  useEffect(() => {
    function route() {
      const hash = currentRoute();
      if (hash !== lastRoute.current) {
        const event = new CustomEvent("cutroom:before-navigate", {
          cancelable: true,
          detail: hash,
        });
        if (!window.dispatchEvent(event)) {
          window.history.replaceState(null, "", `#${lastRoute.current}`);
          return;
        }
      }
      lastRoute.current = hash;
      if (hash.startsWith("project/")) {
        setProjectId(hash.split("/")[1]);
        setInitialClip(hash.split("/")[2]);
      } else {
        setProjectId(null);
        setPage(
          (["library", "streams", "clips", "exports", "settings"].includes(hash)
            ? hash
            : "library") as Page,
        );
      }
    }
    window.addEventListener("hashchange", route);
    return () => window.removeEventListener("hashchange", route);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.error ? 9000 : 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  function navigate(next: Page) {
    window.location.hash = next;
  }
  function openProject(id: string, clip?: string) {
    window.location.hash = `project/${id}${clip ? "/" + clip : ""}`;
    setSearchOpen(false);
  }
  async function demo() {
    try {
      const r = await post<{ project?: Project; job?: Job }>("/demo");
      if (r.project) openProject(r.project.id);
      else {
        openWhenReady.current = r.job?.id || null;
        notify("Preparing the sample project…");
      }
      await refresh();
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  const active = jobs.filter((j) => ["queued", "running"].includes(j.status));
  const clips = projects.flatMap((p) =>
    p.clips.map((c) => ({ ...c, project: p })),
  );
  const current = projects.find((p) => p.id === projectId);
  const searchProjects = projects.filter((p) =>
      p.name.toLowerCase().includes(search.toLowerCase()),
    ),
    searchClips = clips.filter((c) =>
      c.title.toLowerCase().includes(search.toLowerCase()),
    );
  return (
    <>
      <a
        href="#main-content"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <div className={`app-shell ${current ? "in-editor" : ""}`}>
        <aside className="sidebar">
          <a
            className="brand"
            href="#library"
            onClick={() => navigate("library")}
            aria-label="Cutroom library"
          >
            <span className="brand-mark">
              <i />
              <i />
              <i />
            </span>
            <span>
              cutroom<span className="brand-dot">.</span>
            </span>
          </a>
          <div className="workspace-label">
            <span className="workspace-icon">C</span>
            <div>
              <strong>Your workspace</strong>
              <span>Local video studio</span>
            </div>
          </div>
          <button
            className="sidebar-search"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={16} />
            <span>Find anything</span>
            <kbd>⌘ K</kbd>
          </button>
          <nav aria-label="Main navigation">
            <span className="nav-label">Workspace</span>
            {[
              {
                id: "library",
                label: "Studio",
                icon: Film,
                count: projects.length,
              },
              {
                id: "streams",
                label: "Streams",
                icon: Radio,
                count: 0,
              },
              {
                id: "clips",
                label: "Your clips",
                icon: Scissors,
                count: clips.length,
              },
              {
                id: "exports",
                label: "Exports",
                icon: Download,
                count: projects.reduce(
                  (count, project) =>
                    count + latestExports(project.exports).length,
                  0,
                ),
              },
            ].map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={() => navigate(item.id as Page)}
                aria-current={
                  !projectId && page === item.id ? "page" : undefined
                }
                className={!projectId && page === item.id ? "active" : ""}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
                {item.count > 0 && <b>{item.count}</b>}
              </a>
            ))}
            <span className="nav-label tools-label">Tools</span>
            <a
              href="#settings"
              aria-label="Models and settings"
              onClick={() => navigate("settings")}
              aria-current={
                !projectId && page === "settings" ? "page" : undefined
              }
              className={!projectId && page === "settings" ? "active" : ""}
            >
              <Settings2 size={18} />
              <span>Models & settings</span>
            </a>
          </nav>
          <div className="sidebar-bottom">
            <div className="local-status">
              <span className={`status-dot ${health?.ai ? "" : "pending"}`} />
              <strong>
                {health?.ai ? "Local engine ready" : "Checking local engine"}
              </strong>
              <p>Your footage stays yours.</p>
            </div>
            <button className="help-link" onClick={() => setHelp(true)}>
              <MonitorPlay size={17} />
              <span>A quick tour</span>
              <ArrowUpRight size={14} />
            </button>
            <div className="sidebar-footer">
              <span>Made for the cut.</span>
              <span>v0.1</span>
            </div>
          </div>
        </aside>
        <main id="main-content" tabIndex={-1} className="main-content">
          {loading ? (
            <div className="loading-screen" role="status">
              <LoaderCircle className="spin" size={28} />
              <h2>Opening your studio…</h2>
              <p>Reading projects from this computer.</p>
            </div>
          ) : error ? (
            <div className="loading-screen">
              <AlertCircle size={32} />
              <h2>The local studio is offline.</h2>
              <p>
                Start Cutroom with <code>npm run dev</code>, then reconnect.
              </p>
              <p className="subtle">{error}</p>
              <Button
                onClick={() => {
                  setLoading(true);
                  refresh()
                    .catch((e) => setError(e.message))
                    .finally(() => setLoading(false));
                }}
              >
                <RefreshCw size={16} />
                Reconnect
              </Button>
            </div>
          ) : current ? (
            <Editor
              key={`${current.id}:${initialClip || "default"}`}
              project={current}
              initialClip={initialClip}
              jobs={jobs}
              health={health}
              back={() => navigate("library")}
              refresh={refresh}
              notify={notify}
              openSettings={() => navigate("settings")}
            />
          ) : (
            <div className="workspace-content">
              <header className="page-topline">
                <span>
                  {page === "library"
                    ? "The editing room"
                    : page === "streams"
                      ? "Hands-off clipping"
                    : page === "clips"
                      ? "Your selection"
                      : page === "exports"
                        ? "Ready to share"
                        : "Under the hood"}
                </span>
                <div className="row">
                  <span className="local-chip">
                    <HardDrive size={13} />
                    On this computer
                  </span>
                  <button
                    className="top-search"
                    aria-label="Search projects and clips"
                    onClick={() => setSearchOpen(true)}
                  >
                    <Search size={18} />
                  </button>
                </div>
              </header>
              {page === "library" && (
                <Library
                  projects={projects}
                  openProject={openProject}
                  upload={() => setUpload(true)}
                  demo={() => void demo()}
                  rename={(p) => {
                    setRename(p);
                    setName(p.name);
                  }}
                  remove={setRemove}
                  showClips={() => navigate("clips")}
                />
              )}
              {page === "streams" && (
                <Streams
                  health={health}
                  openProject={openProject}
                  openSettings={() => navigate("settings")}
                  notify={notify}
                />
              )}
              {page === "clips" && (
                <Clips
                  projects={projects}
                  openProject={openProject}
                  upload={() => setUpload(true)}
                  openLibrary={() => navigate("library")}
                  queued={refresh}
                  notify={notify}
                />
              )}
              {page === "exports" && (
                <Exports
                  projects={projects}
                  preview={setExportPreview}
                  chooseClip={() => navigate("clips")}
                />
              )}
              {page === "settings" && (
                <Settings
                  health={health}
                  projects={projects}
                  jobs={jobs}
                  install={(m) =>
                    void post(`/models/${m}/install`)
                      .then(() => refresh())
                      .catch((e) => notify(e.message, true))
                  }
                  restored={(count) => {
                    notify(
                      `${count} project${count === 1 ? "" : "s"} restored to your library.`,
                    );
                    void refresh().catch((e) => notify(e.message, true));
                  }}
                />
              )}
              <JobHistory jobs={jobs} />
              {active.length > 0 && (
                <section className="queue-panel" aria-label="Processing queue">
                  <div className="section-heading">
                    <h3>
                      <LoaderCircle size={17} className="spin" />
                      Local processor
                    </h3>
                    <span>{active.length} jobs</span>
                  </div>
                  {active.map((j) => (
                    <div className="queue-row" key={j.id}>
                      <div>
                        <strong>
                          {j.label || (j.kind === "model"
                            ? "Installing speech model"
                            : j.kind === "download"
                              ? "Downloading from YouTube"
                              : j.kind === "suggest"
                                ? "Reviewing potential clips"
                              : j.kind === "autopost"
                                ? "Rendering and publishing stream clips"
                              : j.kind === "stream"
                                ? "Planning stream parts"
                            : j.kind === "import"
                              ? "Importing footage"
                              : j.kind === "transcribe"
                                ? "Transcribing speech"
                                : j.kind === "export"
                                  ? "Rendering video"
                                  : j.kind === "reframe"
                                    ? "Finding a face"
                                    : "Creating preview")}
                        </strong>
                        <span>{j.message}</span>
                      </div>
                      <progress max={100} value={j.progress} />
                      <span>{Math.round(j.progress)}%</span>
                      <Button
                        variant="ghost"
                        size="small"
                        onClick={() =>
                          void post(`/jobs/${j.id}/cancel`)
                            .then(() => refresh())
                            .catch((e) => notify(e.message, true))
                        }
                      >
                        Cancel
                      </Button>
                    </div>
                  ))}
                </section>
              )}
            </div>
          )}
        </main>
      </div>
      <UploadDialog
        open={upload}
        youtubeReady={health?.youtube ?? false}
        close={() => setUpload(false)}
        imported={(job, count = 1) => {
          openWhenReady.current = job.id;
          void refresh();
          notify(job.kind === "download" ? `${count > 1 ? `${count} YouTube parts` : "YouTube download"} queued. Follow progress in the local processor.` : "Upload complete. Preparing your video locally…");
        }}
      />
      <Dialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Find your next cut"
        description="Search project names and saved clips."
      >
        <div className="search-field command-search">
          <Search size={20} />
          <input
            autoFocus
            aria-label="Search everything"
            value={search}
            placeholder="Search projects and clips…"
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(event) => {
              const buttons =
                searchResults.current?.querySelectorAll<HTMLButtonElement>(
                  "button",
                );
              if (!buttons?.length) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                buttons[
                  event.key === "ArrowDown" ? 0 : buttons.length - 1
                ].focus();
              }
              if (event.key === "Enter") {
                event.preventDefault();
                buttons[0].click();
              }
            }}
          />
          <kbd>esc</kbd>
        </div>
        <div
          className="search-results"
          ref={searchResults}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
            );
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            if (index < 0 || !buttons.length) return;
            event.preventDefault();
            buttons[
              (index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) %
                buttons.length
            ].focus();
          }}
        >
          {searchProjects.slice(0, 6).map((p) => (
            <button key={p.id} onClick={() => openProject(p.id)}>
              <Film size={18} />
              <span>
                {p.name}
                <small>Source video · {time(p.duration)}</small>
              </span>
              <ArrowRight size={15} />
            </button>
          ))}
          {searchClips.slice(0, 6).map((c) => (
            <button key={c.id} onClick={() => openProject(c.project.id, c.id)}>
              <Scissors size={18} />
              <span>
                {c.title}
                <small>Clip · {c.project.name}</small>
              </span>
              <ArrowRight size={15} />
            </button>
          ))}
          {!searchProjects.length && !searchClips.length && (
            <p className="small-empty">
              {projects.length
                ? "No matches. Try a shorter search."
                : "Import your first video to start building your library."}
            </p>
          )}
        </div>
      </Dialog>
      <Dialog
        open={rename !== null}
        onOpenChange={(o) => {
          if (!o) setRename(null);
        }}
        title="Rename this project"
        description="The original file name on disk stays the same."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (rename)
              void api(`/projects/${rename.id}`, {
                method: "PATCH",
                body: JSON.stringify({ name }),
              })
                .then(() => {
                  setRename(null);
                  return refresh();
                })
                .catch((e) => notify(e.message, true));
          }}
        >
          <label className="field-label">
            Project name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              autoFocus
            />
          </label>
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setRename(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Save name
            </Button>
          </div>
        </form>
      </Dialog>
      <DeleteProjectDialog
        key={remove?.id ?? "closed"}
        project={remove}
        jobs={jobs}
        close={() => setRemove(null)}
        deleted={(message) => {
          setRemove(null);
          notify(message);
          void refresh();
        }}
      />
      <Dialog
        open={exportPreview !== null}
        onOpenChange={(o) => {
          if (!o) setExportPreview(null);
        }}
        title={exportPreview?.title || "Export preview"}
        description="This is the finished, rendered file."
        wide
      >
        {exportPreview && (
          <video
            className="export-preview-video"
            src={`/api/exports/${exportPreview.id}/mp4`}
            controls
            autoPlay
            playsInline
          />
        )}
      </Dialog>
      <Dialog
        open={help}
        onOpenChange={setHelp}
        title="A short path to a good cut."
        description="Everything happens on this computer."
      >
        <ol className="tour-list">
          {[
            [
              Film,
              "Bring a recording",
              "Import footage or open the original sample project to try the editor.",
            ],
            [
              Captions,
              "Find the useful passage",
              "Transcribe locally with Whisper. Select transcript passages or set your own in/out points.",
            ],
            [
              Scissors,
              "Make it fit",
              "Adjust captions, choose an aspect ratio, and place your subject in the frame.",
            ],
            [
              Download,
              "Take the finished file",
              "Export MP4 video and SRT captions. Preview the result in Exports before sharing.",
            ],
          ].map(([Icon, title, copy]) => {
            const I = Icon as typeof Film;
            return (
              <li key={title as string}>
                <I size={22} />
                <div>
                  <h3>{title as string}</h3>
                  <p>{copy as string}</p>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="keyboard-note">
          <span>
            <kbd>⌘ / Ctrl K</kbd> Search <kbd>Space</kbd> Play / pause{" "}
            <kbd>← →</kbd> Seek 5s
            <kbd>I / O</kbd> Set in / out <kbd>⌘ / Ctrl S</kbd> Save
          </span>
        </div>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setHelp(false)}>
            Close tour
          </Button>
          <Button
            onClick={() => {
              setHelp(false);
              void demo();
            }}
          >
            Open sample project
          </Button>
        </div>
      </Dialog>
      {toast && (
        <div
          className={`toast ${toast.error ? "toast-error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <AlertCircle size={19} /> : <Check size={19} />}
          <span>{toast.message}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}
export default App;
