import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Job, JobKind } from "../shared/types.js";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { ROOT, deletingProjects } from "./store.js";

export const jobs: Job[] = [];
const pending: { job: Job; run: (context: JobContext) => Promise<unknown> }[] =
  [];
let busy = false;
const processes = new Map<string, ChildProcess>();
const running = new Set<string>();

export function projectIsProcessing(id: string) {
  return jobs.some((job) => job.projectId === id &&
    (["queued", "running"].includes(job.status) || running.has(job.id)));
}

function terminate(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM") {
  try {
    if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch { /* The process may have already exited. */ }
}
const dedupeKeys = new Map<string, string>();
const historyFile = path.join(ROOT, "jobs.json");
function persistHistory() {
  try {
    writeFileSync(historyFile + ".tmp", JSON.stringify(jobs, null, 2));
    renameSync(historyFile + ".tmp", historyFile);
  } catch {
    console.warn(
      "Job history could not be saved. Project files are stored separately.",
    );
  }
}
export function initializeJobs() {
  try {
    const saved = JSON.parse(readFileSync(historyFile, "utf8"));
    if (!Array.isArray(saved)) throw new Error("Invalid job history.");
    for (const job of saved.slice(0, 100)) {
      if (["running", "queued"].includes(job.status)) {
        job.status = "failed";
        job.message =
          "Interrupted when the local server stopped. Your source is safe; run this action again.";
        job.finishedAt = new Date().toISOString();
      }
      jobs.push(job);
    }
    persistHistory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      console.warn(
        "Previous job history could not be read. The file has been preserved.",
      );
  }
}
export function stopJobs() {
  for (const job of jobs)
    if (["queued", "running"].includes(job.status)) {
      job.status = "cancelled";
      job.message =
        "Stopped with the local server. Run this action again to resume work.";
      job.finishedAt = new Date().toISOString();
    }
  for (const child of processes.values()) terminate(child);
  persistHistory();
}
export interface JobContext {
  job: Job;
  progress: (progress: number, message?: string) => void;
  exec: typeof execute;
}

export function execute(
  command: string,
  args: string[],
  options: {
    jobId?: string;
    cwd?: string;
    onLine?: (line: string) => void;
    timeout?: number;
    binary?: boolean;
  } = {},
): Promise<string | Buffer> {
  return new Promise((resolve, reject) => {
    if (
      options.jobId &&
      jobs.find((j) => j.id === options.jobId)?.status === "cancelled"
    ) {
      reject(new Error("Processing was stopped."));
      return;
    }
    const child = spawn(command, args, {
      detached: process.platform !== "win32",
      cwd: options.cwd,
      env: {
        ...process.env,
        OMP_NUM_THREADS: "2",
        OPENBLAS_NUM_THREADS: "2",
        HF_HUB_DISABLE_TELEMETRY: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (options.jobId) processes.set(options.jobId, child);
    const chunks: Buffer[] = [];
    let errorText = "";
    let lineBuffer = "";
    let bytes = 0;
    const timer = setTimeout(
      () => terminate(child),
      options.timeout || 60 * 60 * 1000,
    );
    child.stdout.on("data", (buffer: Buffer) => {
      bytes += buffer.length;
      if (bytes > 64 * 1024 * 1024) {
        terminate(child);
        return;
      }
      chunks.push(buffer);
      if (options.onLine) {
        lineBuffer += buffer.toString();
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() || "";
        lines.forEach(options.onLine);
      }
    });
    child.stderr.on("data", (b: Buffer) => {
      errorText = (errorText + b.toString()).slice(-5000);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      if (options.jobId) processes.delete(options.jobId);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (options.jobId) processes.delete(options.jobId);
      if (code !== 0)
        reject(
          new Error(
            signal
              ? "Processing was stopped."
              : errorText.trim() || `${command} failed.`,
          ),
        );
      else
        resolve(
          options.binary
            ? Buffer.concat(chunks)
            : Buffer.concat(chunks).toString(),
        );
    });
  });
}

export function enqueue(
  kind: JobKind,
  projectId: string | undefined,
  run: (context: JobContext) => Promise<unknown>,
  key = `${kind}:${projectId}`,
  label?: string,
) {
  if (projectId && deletingProjects.has(projectId))
    throw Object.assign(new Error("This project is being deleted."), { status: 409 });
  const existing = jobs.find(
    (j) =>
      dedupeKeys.get(j.id) === key && ["queued", "running"].includes(j.status),
  );
  if (existing) return existing;
  const job: Job = {
    id: randomUUID(),
    projectId,
    kind,
    ...(label ? { label } : {}),
    status: "queued",
    progress: 0,
    message: "Waiting for the local processor",
    createdAt: new Date().toISOString(),
  };
  jobs.unshift(job);
  dedupeKeys.set(job.id, key);
  if (jobs.length > 100) jobs.splice(100);
  pending.push({ job, run });
  persistHistory();
  void drain();
  return job;
}
async function drain() {
  if (busy) return;
  busy = true;
  while (pending.length) {
    const item = pending.shift()!;
    if (item.job.status === "cancelled") continue;
    item.job.status = "running";
    running.add(item.job.id);
    item.job.message = "Starting local processor";
    persistHistory();
    try {
      const result = await item.run({
        job: item.job,
        progress: (progress, message) => {
          if (item.job.status === "cancelled") return;
          item.job.progress = Math.min(99, Math.max(0, progress));
          if (message) item.job.message = message;
        },
        exec: execute,
      });
      if ((item.job.status as string) !== "cancelled") {
        item.job.status = "completed";
        item.job.progress = 100;
        item.job.message = "Completed";
        item.job.result =
          item.job.kind === "import" || item.job.kind === "download"
            ? { projectId: (result as { id?: string })?.id }
            : result;
      }
    } catch (error) {
      if ((item.job.status as string) !== "cancelled") {
        item.job.status = "failed";
        const detail =
          error instanceof Error ? error.message : "Processing failed.";
        item.job.message = detail.includes("No space left")
          ? "Not enough disk space. Free some space and try again."
          : /(?:unable|failed|cannot|could not) (?:to )?(?:open|load).*model|model.*(?:not found|incomplete)|huggingface/i.test(detail)
            ? "The local model could not load. Check its installation in Settings and retry."
            : detail.slice(-700);
      }
    }
    item.job.finishedAt = new Date().toISOString();
    running.delete(item.job.id);
    persistHistory();
  }
  busy = false;
}
export function cancelJob(id: string) {
  const job = jobs.find((j) => j.id === id);
  if (!job) throw Object.assign(new Error("Job not found."), { status: 404 });
  if (job.status === "queued" || job.status === "running") {
    job.status = "cancelled";
    job.message = "Cancelled";
    job.finishedAt = new Date().toISOString();
    const child = processes.get(id);
    if (child) terminate(child);
    persistHistory();
  }
  return job;
}
