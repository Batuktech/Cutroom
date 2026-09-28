import path from "node:path";
import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { enqueue, execute, cancelJob, jobs, type JobContext } from "./jobs.js";
import { EXPORTS, ROOT, getProject, updateProject } from "./store.js";
import { exportClip, reframeClip, transcribeProject, PYTHON } from "./media.js";
import { importYoutube } from "./youtube.js";
import { analyzeSuggestions } from "./suggestions.js";
import { clipSourceHash, generateCopy } from "./social-copy.js";
import { SocialError } from "./social-accounts.js";
import { uploadTiktok, uploadYoutube, type UploadMeta } from "./social-upload.js";
import { clipSchema } from "./domain.js";
import { youtubeUrl } from "../shared/youtube.js";
import { suggestionOptionsSchema } from "../shared/suggestions.js";
import { copyOptionsSchema } from "../shared/publishing.js";
import { rankCandidates, streamParts, type AutopostClip, type AutopostPlatform, type StreamPart, type StreamRecord, type StreamRequest } from "../shared/streams.js";

const FILE = path.join(ROOT, "streams.json");
let streams: StreamRecord[] = [];
let writes = Promise.resolve();

export async function initializeStreams() {
  try {
    const saved = JSON.parse(await readFile(FILE, "utf8"));
    if (!Array.isArray(saved)) throw new Error();
    streams = saved;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn("Stream history could not be read. The file has been preserved.");
    return;
  }
  // Nothing resumes by itself after a restart; Retry continues from the last finished stage.
  for (const stream of streams) {
    if (["planning", "processing", "publishing"].includes(stream.status)) {
      stream.status = "failed";
      stream.message = "Interrupted when the local server stopped. Use Retry to continue.";
    }
    for (const part of stream.parts) if (!["ready", "failed", "cancelled"].includes(part.stage)) {
      part.stage = "failed"; part.message = "Interrupted when the local server stopped.";
    }
    for (const clip of stream.clips) for (const target of clip.targets) {
      if (target.state === "submitting") { target.state = "unknown"; target.message = "Interrupted during upload. Check the platform before retrying; this post is never resent automatically."; }
      if (target.state === "pending") { target.state = "failed"; target.message = "Interrupted before upload."; }
    }
  }
  await persist();
}
function persist() {
  const data = JSON.stringify(streams, null, 2);
  writes = writes.catch(() => {}).then(async () => {
    await writeFile(FILE + ".tmp", data);
    await rename(FILE + ".tmp", FILE);
  });
  return writes;
}
export const listStreams = () => streams.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
export function getStream(id: string) {
  const stream = streams.find(s => s.id === id);
  if (!stream) throw Object.assign(new Error("Stream not found."), { status: 404 });
  return stream;
}
async function change(id: string, update: (stream: StreamRecord) => void) {
  const stream = getStream(id);
  update(stream);
  stream.updatedAt = new Date().toISOString();
  await persist();
  return stream;
}
const setPart = (id: string, index: number, patch: Partial<StreamPart>) =>
  change(id, s => { Object.assign(s.parts[index], patch); if (patch.stage !== "failed" && patch.stage !== "cancelled") delete s.parts[index].message; });

export async function createStream(request: StreamRequest) {
  const url = youtubeUrl(request.url);
  const active = streams.find(s => s.url === url && ["planning", "processing", "publishing"].includes(s.status));
  if (active) return active;
  const now = new Date().toISOString();
  const { url: _url, publishConsent: _consent, ...settings } = request;
  const stream: StreamRecord = { id: randomUUID(), url, title: "YouTube stream", createdAt: now, updatedAt: now,
    status: "planning", settings, parts: [], clips: [] };
  streams.unshift(stream);
  if (streams.length > 200) streams.splice(200);
  await persist();
  queuePlan(stream.id);
  return stream;
}
function queuePlan(id: string) {
  const job = enqueue("stream", undefined, context => planStream(id, context), `stream:${id}:plan`, "Stream · reading length");
  void change(id, s => { s.jobId = job.id; });
}
async function planStream(id: string, context: JobContext) {
  context.progress(10, "Reading stream length from YouTube");
  let info: { duration: number; title: string } | undefined;
  try {
    await execute(PYTHON, [path.resolve("scripts/youtube_worker.py"), "--info", "--url", getStream(id).url, "--node", process.execPath], {
      jobId: context.job.id, timeout: 120_000,
      onLine: line => { try { info = JSON.parse(line).info ?? info; } catch { /* Not an info event. */ } },
    });
    if (!info) throw new Error("The stream length could not be read.");
    const planned = streamParts(info.duration);
    const title = Array.from(String(info.title)).filter(c => c.charCodeAt(0) >= 32).join("").slice(0, 160);
    await change(id, s => {
      s.title = title; s.duration = info!.duration; s.status = "processing";
      s.message = `${planned.length} one-hour part${planned.length === 1 ? "" : "s"} queued`;
      s.parts = planned.map((part, index) => ({ index, ...part, stage: "queued" }));
    });
    for (const part of getStream(id).parts) queueStage(id, part.index, "download");
    return { streamId: id, parts: planned.length };
  } catch (error) {
    await change(id, s => { s.status = context.job.status === "cancelled" ? "cancelled" : "failed"; s.message = (error as Error).message.slice(-300); });
    throw error;
  }
}

type Stage = "download" | "transcribe" | "analyze";
function queueStage(id: string, index: number, stage: Stage) {
  const stream = getStream(id), part = stream.parts[index];
  if (stream.status === "cancelled") return;
  const label = `Stream part ${index + 1}/${stream.parts.length} · ${stage === "download" ? "download" : stage === "transcribe" ? "Whisper large-v3" : "Qwen review"}`;
  const kind = stage === "download" ? "download" : stage === "transcribe" ? "transcribe" : "suggest";
  const job = enqueue(kind, stage === "download" ? undefined : part.projectId, context => runStage(id, index, stage, context),
    `stream:${id}:${index}:${stage}`, label);
  // "queued" keeps the part non-terminal, so publishing waits for retried parts.
  if (job.status === "queued") void setPart(id, index, { jobId: job.id, stage: "queued" });
}
async function runStage(id: string, index: number, stage: Stage, context: JobContext) {
  const stream = getStream(id), part = stream.parts[index];
  try {
    if (stage === "download") {
      await setPart(id, index, { stage: "downloading" });
      const project = await importYoutube(stream.url, context, { start: part.start, end: part.end }, 720);
      await updateProject(project.id, p => {
        p.name = `${stream.title.slice(0, 90)} · Part ${index + 1}/${stream.parts.length}`;
        p.stream = { id, part: index + 1, parts: stream.parts.length, title: stream.title };
      });
      await setPart(id, index, { projectId: project.id, stage: "transcribing" });
      queueStage(id, index, "transcribe");
      return project;
    }
    if (stage === "transcribe") {
      await setPart(id, index, { stage: "transcribing" });
      const result = await transcribeProject(part.projectId!, "large-v3", stream.settings.language, context, false);
      await setPart(id, index, { stage: "analyzing" });
      queueStage(id, index, "analyze");
      return result;
    }
    await setPart(id, index, { stage: "analyzing" });
    const options = suggestionOptionsSchema.parse({ provider: "local", interests: stream.settings.interests, strictness: "reviewed",
      count: 15, minDuration: 15, maxDuration: 60 });
    const result = await analyzeSuggestions(part.projectId!, options, context);
    await setPart(id, index, { stage: "ready", candidates: result.candidates });
    return result;
  } catch (error) {
    const cancelled = context.job.status === "cancelled";
    await setPart(id, index, { stage: cancelled ? "cancelled" : "failed", message: cancelled ? "Cancelled." : (error as Error).message.slice(-300) });
    throw error;
  } finally {
    queuePublishWhenReady(id);
  }
}
function queuePublishWhenReady(id: string) {
  const stream = getStream(id);
  if (stream.status !== "processing" || stream.parts.some(p => !["ready", "failed", "cancelled"].includes(p.stage))) return;
  if (!stream.parts.some(p => p.stage === "ready")) {
    void change(id, s => { s.status = "failed"; s.message = "No part finished processing. Use Retry after fixing the reported problem."; });
    return;
  }
  queuePublish(id);
}
function queuePublish(id: string) {
  const job = enqueue("autopost", undefined, context => publishStream(id, context), `stream:${id}:publish`, "Stream · render and publish top clips");
  void change(id, s => { s.status = "publishing"; s.jobId = job.id; });
}

const pickedClip = (start: number, end: number, title: string) => clipSchema.parse({ title, start, end, aspect: "9:16", fit: "cover", cropX: 50, cropY: 50,
  captionStyle: "highlight", captions: true, captionSize: 64, captionPosition: 24, accent: "#d6f58a" });

async function publishStream(id: string, context: JobContext) {
  try { return await publishClips(id, context); }
  catch (error) {
    await change(id, s => {
      if (s.status !== "cancelled") { s.status = "failed"; s.message = (error as Error).message.slice(-300); }
      for (const clip of s.clips) for (const t of clip.targets) if (t.state === "pending") { t.state = "failed"; t.message = "Stopped before upload."; }
    });
    throw error;
  }
}
async function publishClips(id: string, context: JobContext) {
  const stream = getStream(id);
  const needed = stream.settings.topClips - stream.clips.length;
  if (needed > 0) {
    const pool = stream.parts.filter(p => p.stage === "ready" && p.projectId).flatMap(part => {
      const project = getProject(part.projectId!);
      return (project.suggestions?.candidates ?? []).map((candidate, order) => ({ ...candidate, part: part.index, order, projectId: project.id }));
    }).filter(c => !stream.clips.some(clip => clip.projectId === c.projectId && Math.abs(clip.start - c.start) < .1));
    for (const candidate of rankCandidates(pool, needed)) {
      const clip = pickedClip(candidate.start, candidate.end, candidate.title);
      const clipId = randomUUID();
      await updateProject(candidate.projectId, p => {
        p.clips.push({ ...clip, id: clipId, status: "draft", createdAt: new Date().toISOString(), reason: candidate.reason });
      });
      await change(id, s => s.clips.push({ id: randomUUID(), projectId: candidate.projectId, clipId, part: candidate.part,
        start: candidate.start, end: candidate.end, title: candidate.title,
        targets: s.settings.platforms.map(platform => ({ platform, state: "pending" })) }));
    }
  }
  const work = getStream(id).clips.filter(c => !c.exportId || c.targets.some(t => t.state === "pending"));
  const blocked = new Map<AutopostPlatform, string>();
  for (const [n, item] of work.entries()) {
    context.signal?.throwIfAborted();
    const share = (value: number) => (n + value) / work.length * 98;
    const label = `Clip ${n + 1} of ${work.length}`;
    let project = getProject(item.projectId), clip = project.clips.find(c => c.id === item.clipId);
    if (!clip) { await markTargets(id, item.id, "pending", "failed", "The clip was deleted from its project."); continue; }
    if (!item.exportId) try {
      context.progress(share(0), `${label} · framing faces for 9:16`);
      // Framing and AI copy are improvements; the fallback is a centred crop and the Qwen title.
      await reframeClip(project.id, structuredClone(clip), { ...context, progress: () => {} }).catch(() => {});
      project = getProject(item.projectId); clip = project.clips.find(c => c.id === item.clipId)!;
      context.progress(share(.15), `${label} · writing titles with local Qwen`);
      await generateCopy(project.id, clip.id, copyOptionsSchema.parse({ provider: "local", sourceHash: clipSourceHash(project, clip) }),
        { ...context, progress: () => {} }).catch(() => {});
      project = getProject(item.projectId); clip = project.clips.find(c => c.id === item.clipId)!;
      const file = await exportClip(project.id, structuredClone(clip), "1080",
        { ...context, progress: (value) => context.progress(share(.3 + value / 100 * .4), `${label} · rendering 1080×1920`) });
      await change(id, s => { s.clips.find(c => c.id === item.id)!.exportId = file.id; });
    } catch (error) {
      if (context.signal?.aborted) throw error;
      await markTargets(id, item.id, "pending", "failed", `Rendering failed: ${(error as Error).message.slice(-200)}`);
      continue;
    }
    const current = getStream(id).clips.find(c => c.id === item.id)!;
    for (const target of current.targets.filter(t => t.state === "pending")) {
      context.signal?.throwIfAborted();
      if (blocked.has(target.platform)) { await setTarget(id, item.id, target.platform, { state: "failed", message: blocked.get(target.platform) }); continue; }
      context.progress(share(.75), `${label} · uploading to ${target.platform === "youtube" ? "YouTube" : "TikTok"}`);
      const copy = clip.socialCopy?.copy[target.platform];
      const meta: UploadMeta = { title: copy?.title ?? clip.title, description: copy?.description ?? clip.reason ?? clip.title,
        tags: copy?.hashtags ?? [], visibility: getStream(id).settings.visibility, duration: clip.end - clip.start };
      // Record intent before the external write so a lost receipt is never resubmitted automatically.
      await setTarget(id, item.id, target.platform, { state: "submitting", message: undefined });
      try {
        const file = path.join(EXPORTS, current.exportId + ".mp4");
        const receipt = await (target.platform === "youtube" ? uploadYoutube : uploadTiktok)(file, meta, context.signal);
        await setTarget(id, item.id, target.platform, { state: "submitted", remoteId: receipt.remoteId, url: receipt.url, message: receipt.message });
      } catch (error) {
        const definite = error instanceof SocialError && error.definite, code = error instanceof SocialError ? error.code : undefined;
        const message = error instanceof SocialError ? error.message : "The upload stopped before the platform confirmed it. Check the platform before retrying.";
        await setTarget(id, item.id, target.platform, { state: definite ? "failed" : "unknown", message });
        // Account-wide refusals would repeat for every remaining clip; stop that platform for this run.
        if (definite && ["quotaExceeded", "uploadLimitExceeded", "auth", "spam_risk_too_many_posts", "reached_active_user_cap",
          "unaudited_client_can_only_post_to_private_accounts", "access_token_invalid", "scope_not_authorized"].includes(code ?? ""))
          blocked.set(target.platform, message);
        if (context.signal?.aborted) throw error;
      }
    }
  }
  const final = getStream(id);
  const targets = final.clips.flatMap(c => c.targets);
  const posted = targets.filter(t => t.state === "submitted").length, attention = targets.length - posted;
  await change(id, s => {
    s.status = "completed";
    s.message = !final.clips.length ? "Qwen found no clip candidates in this stream."
      : `${final.clips.length} clip${final.clips.length === 1 ? "" : "s"} ready` +
        (targets.length ? ` · ${posted} post${posted === 1 ? "" : "s"} published${attention ? ` · ${attention} need attention` : ""}` : "") +
        (s.parts.some(p => p.stage !== "ready") ? " · some parts failed" : "");
  });
  return { streamId: id, clips: final.clips.length, posted };
}
async function setTarget(id: string, clipId: string, platform: AutopostPlatform, patch: Partial<AutopostClip["targets"][number]>) {
  await change(id, s => { Object.assign(s.clips.find(c => c.id === clipId)!.targets.find(t => t.platform === platform)!, patch); });
}
async function markTargets(id: string, clipId: string, from: string, state: "failed", message: string) {
  await change(id, s => { for (const t of s.clips.find(c => c.id === clipId)!.targets) if (t.state === from) Object.assign(t, { state, message }); });
}

function streamJobs(stream: StreamRecord) {
  const ids = new Set([stream.jobId, ...stream.parts.map(p => p.jobId)].filter(Boolean));
  return jobs.filter(j => ids.has(j.id) && ["queued", "running"].includes(j.status));
}
export async function cancelStream(id: string) {
  await change(id, s => { s.status = "cancelled"; s.message = "Cancelled. Posts already published stay on the platforms."; });
  for (const job of streamJobs(getStream(id))) cancelJob(job.id);
  await change(id, s => {
    for (const part of s.parts) if (!["ready", "failed"].includes(part.stage)) { part.stage = "cancelled"; part.message = "Cancelled."; }
    for (const clip of s.clips) for (const t of clip.targets) if (t.state === "pending") { t.state = "failed"; t.message = "Cancelled before upload."; }
  });
  return getStream(id);
}
/** Continues failed or cancelled work. Unconfirmed ("unknown") uploads are never retried here. */
export async function retryStream(id: string) {
  const stream = getStream(id);
  if (streamJobs(stream).length || ["planning", "processing", "publishing"].includes(stream.status))
    throw Object.assign(new Error("This stream is still running."), { status: 409 });
  if (!stream.parts.length) {
    await change(id, s => { s.status = "planning"; s.message = undefined; });
    queuePlan(id);
    return getStream(id);
  }
  await change(id, s => {
    s.status = "processing"; s.message = undefined;
    for (const clip of s.clips) for (const t of clip.targets) if (t.state === "failed") { t.state = "pending"; t.message = undefined; }
  });
  const redo = stream.parts.filter(p => p.stage === "failed" || p.stage === "cancelled");
  for (const part of redo) {
    let project;
    try { project = part.projectId ? getProject(part.projectId) : undefined; } catch { project = undefined; }
    queueStage(id, part.index, !project ? "download" : project.transcript.length ? "analyze" : "transcribe");
  }
  if (!redo.length) queuePublish(id);
  return getStream(id);
}
