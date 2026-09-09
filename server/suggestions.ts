import path from "node:path";
import { readFile, writeFile, unlink, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { execute, type JobContext } from "./jobs.js";
import { exists } from "./media.js";
import { MODELS, TEMP, getProject, updateProject } from "./store.js";
import { transcriptHash, recognitionResultSchema, validateSuggestions } from "./suggestion-domain.js";
import type { SuggestionOptions } from "../shared/suggestion-options.js";
import { clipSchema } from "./domain.js";

const PYTHON = path.resolve(".venv-qwen/bin/python");
const WORKER = path.resolve("scripts/suggest_worker.py");
const MODEL = path.join(MODELS, "qwen3-8b/Qwen3-8B-Q4_K_M.gguf");

export async function qwenReadiness() {
  if (!(await exists(PYTHON))) return { ready: false, message: "The local Qwen runtime is not installed." };
  try {
    if ((await stat(MODEL)).size < 4_000_000_000) throw new Error();
  } catch { return { ready: false, message: "The Qwen3-8B model is not installed in this studio’s data folder." }; }
  try {
    await execute(PYTHON, [WORKER, "--check"], { timeout: 10000 });
    return { ready: true, message: "Qwen3-8B · conservative GPU preset · local analysis" };
  } catch { return { ready: false, message: "The Qwen GPU runtime is unavailable. See the local setup guide." }; }
}

export async function analyzeSuggestions(id: string, options: SuggestionOptions, context: JobContext) {
  const project = structuredClone(getProject(id));
  if (!project.transcript.length) throw new Error("Transcribe the video or import subtitles first.");
  const sourceHash = transcriptHash(project);
  const reviewId = randomUUID();
  const candidateIds = new Map<string, string>();
  const input = path.join(TEMP, context.job.id + "-suggest-input.json");
  const output = path.join(TEMP, context.job.id + "-suggest-output.json");
  let writes: Promise<void> = Promise.resolve();
  let writeError: Error | undefined;
  async function saveResult(raw: unknown, final: boolean) {
    if (context.job.status === "cancelled") return;
    const result = recognitionResultSchema.parse(raw);
    const candidates = validateSuggestions(result.candidates, project.transcript, project.duration, options.maxDuration, options.count, options.minDuration, options.maxPause).map(c => {
      const key = `${c.start}:${c.end}`;
      if (!candidateIds.has(key)) candidateIds.set(key, c.id);
      return { ...c, id: candidateIds.get(key)! };
    });
    // An empty early section must not replace a useful review from an earlier run.
    if (!final && !candidates.length) return;
    await updateProject(id, current => {
      if (context.job.status === "cancelled") return;
      if (transcriptHash(current) !== sourceHash)
        throw new Error("The transcript changed during analysis. Your edits were kept; analyze it again.");
      current.suggestions = {
        id: reviewId, sourceHash, createdAt: new Date().toISOString(),
        target: options.maxDuration, focus: "interesting", options, requested: options.count,
        complete: final, candidates, sections: result.sections, scanned: result.scanned,
        reviewed: result.reviewed, diagnostics: result.diagnostics,
      };
    });
    if ((context.job.status as string) !== "cancelled") context.job.result = { reviewId, scanned: result.scanned, candidates: candidates.length, partial: !final };
  }
  try {
    await writeFile(input, JSON.stringify({ segments: project.transcript, ...options }));
    await execute(PYTHON, [WORKER, "--model", MODEL, "--input", input, "--output", output], {
      jobId: context.job.id, timeout: 2 * 60 * 60 * 1000,
      onLine: line => {
        let event;
        try { event = JSON.parse(line); } catch { return; }
        if (typeof event.progress === "number") context.progress(event.progress, event.message);
        if (event.checkpoint) {
          writes = writes.then(() => saveResult(event.checkpoint, false)).catch(error => { writeError ??= error; });
        }
      },
    });
    await writes;
    if (writeError) throw writeError;
    if (context.job.status === "cancelled") throw new Error("Analysis cancelled.");
    await saveResult(JSON.parse(await readFile(output, "utf8")), true);
    return { candidates: getProject(id).suggestions?.candidates.length ?? 0 };
  } finally {
    await writes;
    await Promise.all([input, output].map(file => unlink(file).catch(() => {})));
  }
}

export async function acceptSuggestions(id: string, reviewId: string, ids: string[]) {
  let added = 0;
  const project = await updateProject(id, (p) => {
    const review = p.suggestions;
    if (!review || review.id !== reviewId || review.sourceHash !== transcriptHash(p))
      throw Object.assign(new Error("These suggestions are out of date. Analyze the current transcript again."), { status: 409 });
    if (ids.some((id) => !review.candidates.some((c) => c.id === id)))
      throw Object.assign(new Error("Choose candidates from this analysis."), { status: 400 });
    for (const candidate of review.candidates.filter((c) => ids.includes(c.id))) {
      if (p.clips.some((c) => Math.abs(c.start-candidate.start) < .1 && Math.abs(c.end-candidate.end) < .1)) continue;
      const clip = clipSchema.parse({ ...candidate, aspect: "16:9", fit: "cover", cropX: 50, cropY: 50, captionStyle: "highlight", captions: true, captionSize: 52, captionPosition: 20, accent: "#d6f58a" });
      if (clip.end > p.duration) throw new Error("The suggested clip exceeds the source duration.");
      p.clips.push({ ...clip, id: randomUUID(), createdAt: new Date().toISOString(), status: "draft", reason: candidate.reason });
      added++;
    }
  });
  return { project, added };
}
