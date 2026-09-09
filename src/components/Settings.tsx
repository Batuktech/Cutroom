import { useState } from "react";
import {
  Cpu,
  HardDrive,
  Download,
  Check,
  LoaderCircle,
  Upload,
} from "lucide-react";
import type { Health, Job, Project } from "../../shared/types";
import { Button } from "./ui/button";
import { size } from "../lib/utils";
import { RestoreDialog } from "./RestoreDialog";
export function Settings({
  health,
  projects,
  jobs,
  install,
  restored,
}: {
  health: Health | null;
  projects: Project[];
  jobs: Job[];
  install: (model: string) => void;
  restored: (count: number) => void;
}) {
  const [restoreOpen, setRestoreOpen] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            Your machine.
            <br />
            <span>Your studio.</span>
          </h1>
          <p>A small, local toolkit. You decide what lives here.</p>
        </div>
      </div>
      <section className="settings-section">
        <div className="settings-heading">
          <Cpu size={22} />
          <div>
            <h2>Speech models</h2>
            <p>
              Download once. Transcribe offline afterward. All models support
              multiple languages.
            </p>
          </div>
        </div>
        <div className="model-list">
          {health?.models.map((m) => {
            const job = jobs.find(
              (j) =>
                j.kind === "model" &&
                j.projectId === m.id &&
                ["running", "queued"].includes(j.status),
            );
            return (
              <div className="model-row" key={m.id}>
                <div className="model-monogram">{m.id[0].toUpperCase()}</div>
                <div>
                  <h3>
                    {m.name}
                    {m.id === "large-v3" && (
                      <span className="recommended">Largest model</span>
                    )}
                  </h3>
                  <p>{m.description}</p>
                  <small>{m.size} download · CPU / int8</small>
                </div>
                {m.installed ? (
                  <span className="model-installed">
                    <Check size={15} />
                    Installed
                  </span>
                ) : (
                  <Button
                    variant="secondary"
                    size="small"
                    disabled={!!job}
                    onClick={() => install(m.id)}
                  >
                    {job ? (
                      <LoaderCircle size={15} className="spin" />
                    ) : (
                      <Download size={15} />
                    )}
                    {job ? "Installing…" : "Install model"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <p className="settings-footnote">
          Model installation downloads weights from Hugging Face. Your audio and
          video are never sent there. Accuracy varies by language, recording
          quality, and model size.
        </p>
      </section>
      <section className="settings-section">
        <div className="settings-heading">
          <Cpu size={22} />
          <div>
            <h2>Clip analysis</h2>
            <p>Qwen3-8B reads the transcript and reviews potential clips locally.</p>
          </div>
        </div>
        <dl className="system-details">
          <div><dt>Local model</dt><dd>{health?.qwen?.ready ? "Qwen3-8B ready" : "Unavailable"}</dd></div>
          <div><dt>Status</dt><dd>{health?.qwen?.message || "Checking local runtime…"}</dd></div>
        </dl>
        <p className="settings-footnote">
          Open a transcribed video and choose Suggest cuts. AI analysis uses GPU
          memory while running and unloads afterward. Fast transcript rules are
          also available. Neither method can guarantee views.
        </p>
      </section>
      <section className="settings-section">
        <div className="settings-heading">
          <HardDrive size={22} />
          <div>
            <h2>Storage & portability</h2>
            <p>
              Your source files, edits, and exports stay in the local project
              folder.
            </p>
          </div>
        </div>
        <dl className="system-details">
          <div>
            <dt>Data folder</dt>
            <dd>
              <code>{health?.dataDirectory}</code>
            </dd>
          </div>
          <div>
            <dt>Source footage</dt>
            <dd>
              {size(projects.reduce((n, p) => n + p.size, 0))} across{" "}
              {projects.length} files
            </dd>
          </div>
          <div>
            <dt>Render engine</dt>
            <dd>{health?.ffmpeg ? "FFmpeg available" : "FFmpeg missing"}</dd>
          </div>
          <div>
            <dt>Local AI</dt>
            <dd>
              {health?.ai
                ? "Whisper and face detection available"
                : "Run the local AI setup first"}
            </dd>
          </div>
        </dl>
        <div className="backup-row">
          <div>
            <h3>Keep a copy of your edit decisions</h3>
            <p>
              Download project metadata as JSON. For a complete backup, copy the
              entire data folder, including media and exports.
            </p>
          </div>
          <div className="backup-actions">
            <a
              href="/api/backup"
              className="button button-secondary button-small"
            >
              <Download size={15} />
              Export metadata
            </a>
            <Button
              variant="secondary"
              size="small"
              onClick={() => setRestoreOpen(true)}
            >
              <Upload size={15} /> Restore metadata
            </Button>
          </div>
        </div>
      </section>
      {restoreOpen && (
        <RestoreDialog
          open={restoreOpen}
          close={() => setRestoreOpen(false)}
          restored={(count) => {
            setRestoreOpen(false);
            restored(count);
          }}
        />
      )}
      <section className="settings-section limitations">
        <h2>What this version does</h2>
        <p>
          Whisper transcribes speech locally. Qwen reviews transcript passages
          for useful or entertaining moments; fast rules use openings and pauses.
          Face assistance samples frames and suggests a
          fixed crop. Cutroom does not upload, publish, or predict which clips
          will perform well.
        </p>
        <p>
          Review captions and the rendered file before delivery. Delete project
          and files permanently removes its stored video, exports, and edits.
        </p>
      </section>
    </>
  );
}
