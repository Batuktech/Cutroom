import { useState } from "react";
import { Download, Play, Check, Captions, ArrowDownToLine } from "lucide-react";
import type { Project } from "../../shared/types";
import { latestExports } from "../../shared/exports";
import { relativeDate, size, time } from "../lib/utils";
import { Empty } from "./Empty";

export function Exports({
  projects,
  preview,
  chooseClip,
}: {
  projects: Project[];
  preview: (file: { id: string; title: string }) => void;
  chooseClip: () => void;
}) {
  const [showAllExports, setShowAllExports] = useState(false);
  const exports = projects
    .flatMap((p) =>
      (showAllExports ? p.exports : latestExports(p.exports)).map((e) => ({
        ...e,
        project: p,
      })),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Out of the editing room.</h1>
          <p>Your finished videos, ready for wherever the story goes.</p>
        </div>
        <span className="export-count">{exports.length} exports</span>
      </div>
      {exports.length ? (
        <div className="export-list">
          <div className="export-view-control">
            <p>
              {showAllExports
                ? "Showing every render, including older revisions."
                : "The latest rendered version of each clip."}
            </p>
            <label>
              <input
                type="checkbox"
                checked={showAllExports}
                onChange={(event) => setShowAllExports(event.target.checked)}
              />{" "}
              Include older versions
            </label>
          </div>
          <div className="delivery-packs">
            {projects
              .filter((p) => p.exports.length > 0)
              .map((p) => (
                <a
                  key={p.id}
                  href={`/api/projects/${p.id}/package?versions=${showAllExports ? "all" : "latest"}`}
                  className="delivery-pack"
                >
                  <span>
                    <strong>{p.name}</strong>
                    <small>
                      {
                        (showAllExports ? p.exports : latestExports(p.exports))
                          .length
                      }{" "}
                      videos + subtitles ·{" "}
                      {showAllExports ? "all versions" : "latest renders"}
                    </small>
                  </span>
                  <span className="button button-secondary button-small">
                    <Download size={15} />
                    Delivery ZIP
                  </span>
                </a>
              ))}
          </div>
          {exports.map((e) => (
            <article className="export-row" key={e.id}>
              <button
                className="export-thumb"
                onClick={() => preview(e)}
                aria-label={`Preview ${e.title}`}
              >
                <img src={`/api/projects/${e.project.id}/thumbnail`} alt="" />
                <Play size={20} fill="currentColor" />
              </button>
              <div className="export-info">
                <h3>{e.title}</h3>
                <p>{e.project.name}</p>
                <span>
                  {e.aspect} · {time(e.duration)} · {size(e.size)} ·{" "}
                  {e.width && e.height ? `${e.width} × ${e.height} · ` : ""}
                  <time
                    dateTime={e.createdAt}
                    title={new Date(e.createdAt).toLocaleString()}
                  >
                    {relativeDate(e.createdAt)} at{" "}
                    {new Date(e.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                    })}
                  </time>
                </span>
              </div>
              <span className="export-ready">
                <Check size={13} />
                Ready
              </span>
              <div className="export-buttons">
                <a
                  className="button button-secondary button-small"
                  href={`/api/exports/${e.id}/srt`}
                >
                  <Captions size={15} />
                  SRT
                </a>
                <a
                  className="button button-primary button-small"
                  href={`/api/exports/${e.id}/mp4`}
                >
                  <Download size={15} />
                  MP4
                </a>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={ArrowDownToLine}
          title="Your next finished thing goes here."
          copy="Open a clip and choose Export. Cutroom renders the video locally, with your framing and captions."
          action="Choose a clip"
          onClick={() => chooseClip()}
        />
      )}
    </>
  );
}
