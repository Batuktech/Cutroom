import { useState } from "react";
import { FileJson, LoaderCircle, Upload } from "lucide-react";
import type { RestoreSummary } from "../../shared/types";
import { post } from "../lib/api";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";

export function RestoreDialog({
  open,
  close,
  restored,
}: {
  open: boolean;
  close: () => void;
  restored: (count: number) => void;
}) {
  const [backup, setBackup] = useState<unknown>(null);
  const [summary, setSummary] = useState<RestoreSummary | null>(null);
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function inspect(file: File) {
    setSummary(null);
    setBackup(null);
    setError("");
    setFilename(file.name);
    setBusy(true);
    try {
      if (file.size > 19 * 1024 * 1024)
        throw new Error("Choose a metadata backup smaller than 19 MB.");
      let value: unknown;
      try {
        value = JSON.parse(await file.text());
      } catch {
        throw new Error(
          "This file is not valid JSON. Choose a Cutroom metadata backup.",
        );
      }
      const result = await post<RestoreSummary>("/backup/restore", {
        backup: value,
        preview: true,
      });
      setBackup(value);
      setSummary(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!backup || !summary?.ready.length) return;
    setBusy(true);
    setError("");
    try {
      const result = await post<RestoreSummary>("/backup/restore", {
        backup,
        preview: false,
      });
      restored(result.restored);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !busy) close();
      }}
      title="Bring back your edits"
      description="Restore projects that are missing from this library. Existing projects stay as they are."
    >
      <label className="restore-picker">
        <FileJson size={25} />
        <strong>{filename || "Choose a metadata backup"}</strong>
        <span>Cutroom JSON · up to 19 MB</span>
        <input
          type="file"
          accept=".json,application/json"
          aria-label="Choose metadata backup"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void inspect(file);
            event.target.value = "";
          }}
        />
      </label>
      <p className="restore-note">
        Source videos must already be in this studio’s data folder. Metadata
        contains your edits and captions, but does not contain video files.
      </p>
      {busy && (
        <p role="status" className="restore-status">
          <LoaderCircle size={17} className="spin" /> Checking local files…
        </p>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {summary && (
        <div className="restore-summary" aria-live="polite">
          <h3>
            {summary.ready.length
              ? `${summary.ready.length} project${summary.ready.length === 1 ? "" : "s"} ready to restore`
              : "No missing projects to restore"}
          </h3>
          {summary.ready.length > 0 && (
            <ul>
              {summary.ready.map((name, i) => (
                <li key={i}>{name}</li>
              ))}
            </ul>
          )}
          {summary.existing.length > 0 && (
            <p>{summary.existing.length} already in your library · skipped</p>
          )}
          {summary.missingMedia.length > 0 && (
            <p>
              {summary.missingMedia.length} missing source video
              {summary.missingMedia.length === 1 ? "" : "s"} · skipped:{" "}
              {summary.missingMedia.join(", ")}
            </p>
          )}
          {summary.missingExports > 0 && (
            <p>
              {summary.missingExports} unavailable render
              {summary.missingExports === 1 ? "" : "s"} will be left out. You
              can export these clips again.
            </p>
          )}
        </div>
      )}
      <div className="dialog-actions">
        <Button variant="secondary" onClick={close} disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={() => void restore()}
          disabled={busy || !summary?.ready.length}
        >
          <Upload size={16} /> Restore projects
        </Button>
      </div>
    </Dialog>
  );
}
