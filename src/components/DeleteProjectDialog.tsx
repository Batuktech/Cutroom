import { useState } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import type { Job, Project } from "../../shared/types";
import { api } from "../lib/api";
import { size } from "../lib/utils";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";

export function DeleteProjectDialog({ project, jobs, close, deleted }: {
  project: Project | null;
  jobs: Job[];
  close: () => void;
  deleted: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = jobs.some((job) => job.projectId === project?.id && ['running', 'queued'].includes(job.status));
  async function remove() {
    if (!project || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ reclaimedBytes: number; sharedFiles: number }>(`/projects/${project.id}/files`, {
        method: "DELETE", body: JSON.stringify({ confirm: true }),
      });
      deleted(`Project deleted. ${size(result.reclaimedBytes)} removed from disk.${result.sharedFiles ? " Files used by another project were kept." : ""}`);
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <Dialog open={!!project} onOpenChange={(open) => { if (!open && !busy) close(); }}
    title="Delete project and files?"
    description="This permanently deletes Cutroom’s copy of the full video, its edits, previews, exported clips, and caption history. This cannot be undone.">
    <div className="delete-project-summary">
      <strong>{project?.name}</strong>
      <span>Source video · {size(project?.size ?? 0)}</span>
      <span>{project?.clips.length ?? 0} saved clips · {project?.exports.length ?? 0} exported files</span>
    </div>
    <p className="muted">Files shared with another project are kept. The original file you selected outside Cutroom is untouched.</p>
    {active && <p role="status" className="error-message">Cancel this project’s processing jobs before deleting it.</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
    <div className="dialog-actions">
      <Button variant="secondary" disabled={busy} onClick={close}>Keep project</Button>
      <Button variant="danger" disabled={busy || active} onClick={remove}>
        {busy ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}
        {busy ? "Deleting files…" : "Delete project and files"}
      </Button>
    </div>
  </Dialog>;
}
