import { useState } from "react";
import {
  Plus,
  ArrowRight,
  ArrowUpRight,
  Search,
  LayoutGrid,
  List,
  Play,
  Check,
  FolderOpen,
  Scissors,
  MoreHorizontal,
  Pencil,
  Trash2,
  FileVideo,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { Project } from "../../shared/types";
import { Button } from "./ui/button";
import { relativeDate, time } from "../lib/utils";

export function Library({
  projects,
  openProject,
  upload,
  demo,
  rename,
  remove,
  showClips,
}: {
  projects: Project[];
  openProject: (id: string) => void;
  upload: () => void;
  demo: () => void;
  rename: (p: Project) => void;
  remove: (p: Project) => void;
  showClips: () => void;
}) {
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState("recent"),
    [filter, setFilter] = useState("all"),
    [view, setView] = useState("grid");
  const clips = projects.reduce((n, p) => n + p.clips.length, 0),
    exports = projects.reduce((n, p) => n + p.exports.length, 0);
  const visible = projects
    .filter(
      (p) =>
        p.name.toLowerCase().includes(query.toLowerCase()) &&
        (filter === "all" ||
          (filter === "captioned"
            ? p.transcript.length > 0
            : p.transcript.length === 0)),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "duration"
          ? b.duration - a.duration
          : sort === "oldest"
            ? a.createdAt.localeCompare(b.createdAt)
            : b.updatedAt.localeCompare(a.updatedAt),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            A little footage.
            <br />
            <span>A lot of possibility.</span>
          </h1>
          <p>Find the good parts. Give them a life of their own.</p>
        </div>
        <Button onClick={upload}>
          <Plus size={18} />
          Import video
        </Button>
      </div>
      {!projects.length ? (
        <section className="welcome-banner">
          <div className="welcome-copy">
            <span className="eyebrow">Your first cut starts here</span>
            <h2>
              Long story.
              <br />
              <em>Short version.</em>
            </h2>
            <p>
              Turn a recording into something worth sharing. Cut, caption, and
              reframe it right here.
            </p>
            <div className="row wrap">
              <Button className="button-ink" onClick={upload}>
                <Plus size={17} />
                Bring your video
              </Button>
              <button className="text-button" onClick={demo}>
                Open sample project <ArrowRight size={17} />
              </button>
            </div>
            <small>No account. No upload to the cloud.</small>
          </div>
          <div className="welcome-art" aria-hidden="true">
            <div className="film-frame frame-back">
              <span>THE ORIGINAL</span>
              <div className="art-bars">
                {Array.from({ length: 7 }, (_, i) => (
                  <i key={i} />
                ))}
              </div>
              <b>01:24:36</b>
            </div>
            <div className="film-frame frame-front">
              <div className="frame-corner">CUT / 01</div>
              <strong>
                GOOD
                <br />
                PARTS
                <br />
                <em>ONLY.</em>
              </strong>
              <span className="art-caption">One idea. Well told.</span>
              <div className="art-bottom">
                <Scissors size={17} />
                <span>00:00:30</span>
              </div>
            </div>
            <span className="art-label">
              From the whole story to your next clip.
            </span>
          </div>
        </section>
      ) : (
        <div className="workspace-summary">
          <div>
            <strong>{projects.length}</strong>
            <span>source {projects.length === 1 ? "video" : "videos"}</span>
          </div>
          <div>
            <strong>
              {Math.round(projects.reduce((n, p) => n + p.duration, 0) / 60)}
              <small>min</small>
            </strong>
            <span>of possibility</span>
          </div>
          <div>
            <strong>{clips}</strong>
            <span>cuts in progress</span>
          </div>
          <div>
            <strong>{exports}</strong>
            <span>finished exports</span>
          </div>
          <button className="summary-cta" onClick={showClips}>
            <span>Back to the good parts</span>
            <ArrowUpRight size={19} />
          </button>
        </div>
      )}
      <section className="library-section">
        <div className="section-heading">
          <h2>
            Source library{" "}
            <span>{projects.length.toString().padStart(2, "0")}</span>
          </h2>
          <div className="row">
            <select
              className="sort-select"
              value={sort}
              aria-label="Sort projects"
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="recent">Recently edited</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A–Z</option>
              <option value="duration">Longest first</option>
            </select>
            <div className="view-toggle">
              <button
                aria-label="Grid view"
                aria-pressed={view === "grid"}
                className={view === "grid" ? "active" : ""}
                onClick={() => setView("grid")}
              >
                <LayoutGrid size={15} />
              </button>
              <button
                aria-label="List view"
                aria-pressed={view === "list"}
                className={view === "list" ? "active" : ""}
                onClick={() => setView("list")}
              >
                <List size={17} />
              </button>
            </div>
          </div>
        </div>
        {projects.length > 0 && (
          <div className="library-filters">
            <div className="filter-tabs">
              {[
                ["all", "All videos"],
                ["captioned", "With transcript"],
                ["untranscribed", "To transcribe"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  aria-pressed={filter === id}
                  className={filter === id ? "active" : ""}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="search-field library-search">
              <Search size={15} />
              <input
                aria-label="Search source library"
                placeholder="Search videos…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
        )}
        {visible.length ? (
          <div
            className={`project-grid ${view === "list" ? "project-list" : ""}`}
          >
            {visible.map((p) => (
              <article className="project-card" key={p.id}>
                <button
                  className="project-thumbnail"
                  onClick={() => openProject(p.id)}
                  aria-label={`Edit ${p.name}`}
                >
                  {p.thumbnail ? (
                    <img
                      src={`/api/projects/${p.id}/thumbnail`}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <FileVideo size={42} />
                  )}
                  <span className="thumbnail-play">
                    <Play size={21} fill="currentColor" />
                  </span>
                  <span className="duration-badge">{time(p.duration)}</span>
                  {p.demo && <span className="sample-badge">Sample</span>}
                </button>
                <div className="project-card-body">
                  <div className="row-between">
                    <button
                      className="project-name"
                      onClick={() => openProject(p.id)}
                    >
                      {p.name}
                    </button>
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Options for ${p.name}`}
                        >
                          <MoreHorizontal size={18} />
                        </Button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content
                          className="dropdown-content"
                          sideOffset={5}
                          align="end"
                        >
                          <DropdownMenu.Item onSelect={() => rename(p)}>
                            <Pencil size={14} />
                            Rename project
                          </DropdownMenu.Item>
                          <DropdownMenu.Item onSelect={() => remove(p)}>
                            <Trash2 size={14} />
                            Delete project and files
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </div>
                  <div className="project-meta">
                    <span>{relativeDate(p.updatedAt)}</span>
                    <i />
                    {p.clips.length} {p.clips.length === 1 ? "clip" : "clips"}
                    <span
                      className={`transcript-status ${p.transcript.length ? "ready" : ""}`}
                    >
                      {p.transcript.length ? (
                        <>
                          <Check size={12} />
                          Transcribed
                        </>
                      ) : (
                        "Ready to transcribe"
                      )}
                    </span>
                  </div>
                </div>
              </article>
            ))}
            <button className="import-tile" onClick={upload}>
              <span>
                <Plus size={26} />
              </span>
              <strong>Add another story</strong>
              <small>Import a video from your computer</small>
            </button>
          </div>
        ) : projects.length ? (
          <div className="empty-section">
            <Search size={30} />
            <h3>No videos match this view.</h3>
            <Button
              variant="secondary"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="empty-library">
            <div>
              <FolderOpen size={23} />
              <p>Your library is ready for its first story.</p>
            </div>
            <button className="text-button" onClick={demo}>
              Try the sample <ArrowUpRight size={15} />
            </button>
          </div>
        )}
      </section>
      {!projects.length && (
        <div className="workflow-note">
          <span>Built for your workflow</span>
          <p>
            <b>01</b> Bring the footage
          </p>
          <p>
            <b>02</b> Find the story
          </p>
          <p>
            <b>03</b> Make the cut
          </p>
          <p>
            <b>04</b> Take it with you
          </p>
        </div>
      )}
    </>
  );
}
