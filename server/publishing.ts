import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { copyOptionsSchema, publishRequestSchema, socialCopySchema, hashSchema, platformOf, postContent, type Publication, type PublishRequest } from "../shared/publishing.js";
import { getProject, listProjects, updateProject, EXPORTS } from "./store.js";
import { enqueue, type JobContext } from "./jobs.js";
import { exportClip } from "./media.js";
import { assertSource, clipSourceHash, fallbackCopy, generateCopy, publishClip, validateCopyProvider } from "./social-copy.js";
import { postizCredentials, type PostizClient } from "./postiz.js";

export function postSettings(request: PublishRequest, channel: PublishRequest["channels"][number]) {
  const copy = request.copy[platformOf(channel.settings.__type)];
  if (channel.settings.__type === "youtube") return { ...channel.settings, title: copy.title,
    tags: copy.hashtags.map(tag => ({ value: tag.slice(1), label: tag.slice(1) })) };
  if (channel.settings.__type === "tiktok") return { ...channel.settings, title: copy.title };
  return channel.settings;
}
export function checkSchedule(request: Pick<PublishRequest, "mode" | "date">) {
  if (request.mode === "schedule" && (!request.date || Date.parse(request.date) <= Date.now() + 60_000))
    throw new Error("Choose a time at least one minute in the future, allowing time to render and upload.");
}
export function checkSettings(settings: Record<string, unknown>, schema: Record<string, unknown>) {
  const properties = schema.properties as Record<string, { enum?: unknown[]; type?: string }> | undefined;
  if (!properties) return;
  for (const key of Array.isArray(schema.required) ? schema.required : []) {
    if (typeof key === "string" && settings[key] === undefined) throw new Error("This channel requires additional settings. Prepare a draft in Postiz using its composer or update the Cutroom adapter.");
  }
  for (const [key, value] of Object.entries(settings)) {
    const field = properties[key];
    if (Array.isArray(field?.enum) && !field.enum.includes(value)) throw new Error("A posting option is unsupported by this Postiz channel. Check its settings in Postiz.");
  }
}
export async function recoverPublications() {
  for (const p of listProjects()) {
    if (!p.publications?.some(r => r.channels.some(c => ["pending", "submitting"].includes(c.state)))) continue;
    await updateProject(p.id, current => {
      for (const r of current.publications ?? []) for (const c of r.channels) {
        if (c.state === "submitting") { c.state = "unknown"; c.message = "Interrupted during submission. Check the Postiz calendar before trying again."; }
        if (c.state === "pending") { c.state = "failed"; c.message = "Interrupted before submission. You can prepare this channel again."; }
      }
    });
  }
}
async function channelState(projectId: string, recordId: string, channelId: string, state: Publication["channels"][number]["state"], message?: string, postId?: string) {
  await updateProject(projectId, p => {
    const channel = p.publications?.find(r => r.id === recordId)?.channels.find(c => c.id === channelId);
    if (!channel) throw new Error("Publication record is missing.");
    Object.assign(channel, { state, message, ...(postId ? { postId } : {}) });
  });
}
export async function runPublication(projectId: string, clipId: string, request: PublishRequest, client: PostizClient, context: JobContext) {
  const id = request.requestId;
  try {
    const { clip } = assertSource(projectId, clipId, request.sourceHash);
    context.signal?.throwIfAborted(); checkSchedule(request);
    const connected = await client.channels(context.signal);
    await updateProject(projectId, p => {
      for (const c of p.publications!.find(r => r.id === id)!.channels) c.name = connected.find(ch => ch.id === c.id)?.name || c.id;
    });
    for (const channel of request.channels) {
      if (!connected.some(c => c.id === channel.id && c.identifier === channel.settings.__type && !c.disabled)) throw new Error("A selected Postiz channel is disconnected or changed. Reload channels and try again.");
      const rules = await client.settings(channel.id, context.signal);
      if (postContent(request.copy[platformOf(channel.settings.__type)]).length > rules.maxLength) throw new Error("Social copy exceeds this channel's current character limit. Shorten the description or hashtags.");
      checkSettings(postSettings(request, channel), rules.settings);
    }
    assertSource(projectId, clipId, request.sourceHash);
    const file = await exportClip(projectId, structuredClone(clip), request.quality, {
      ...context, progress: (n, message) => context.progress(n * .7, message),
    });
    await updateProject(projectId, p => { p.publications!.find(r => r.id === id)!.exportId = file.id; });
    context.signal?.throwIfAborted(); assertSource(projectId, clipId, request.sourceHash);
    context.progress(72, "Uploading the rendered video to Postiz");
    const media = await client.upload(path.join(EXPORTS, file.id + ".mp4"), context.signal);
    for (let i = 0; i < request.channels.length; i++) {
      const channel = request.channels[i];
      context.signal?.throwIfAborted(); assertSource(projectId, clipId, request.sourceHash); checkSchedule(request);
      context.progress(85 + i / request.channels.length * 14, `Submitting channel ${i + 1} of ${request.channels.length} to Postiz`);
      // Persist the intent before the external write. A lost receipt must never trigger an automatic duplicate.
      await channelState(projectId, id, channel.id, "submitting");
      try {
        context.signal?.throwIfAborted();
        assertSource(projectId, clipId, request.sourceHash);
        const postId = await client.create({ type: request.mode, date: request.date || new Date().toISOString(), shortLink: false, tags: [],
          posts: [{ integration: { id: channel.id }, value: [{ content: postContent(request.copy[platformOf(channel.settings.__type)]), image: [media] }], settings: postSettings(request, channel) }],
        }, channel.id, context.signal);
        await channelState(projectId, id, channel.id, "submitted", "Accepted by Postiz. Check its calendar for publishing status.", postId);
      } catch {
        await channelState(projectId, id, channel.id, "unknown", "Submission was not confirmed. Check the Postiz calendar; this channel will not be resubmitted automatically.");
      }
    }
    const record = getProject(projectId).publications!.find(r => r.id === id)!;
    if (record.channels.some(c => c.state !== "submitted")) throw new Error("Some channel submissions need checking in Postiz. Open Prepare posts for details.");
    return { publicationId: id, submitted: record.channels.length, mode: request.mode };
  } catch (error) {
    await updateProject(projectId, p => {
      for (const c of p.publications!.find(r => r.id === id)!.channels) {
        if (c.state === "pending") { c.state = context.signal?.aborted ? "cancelled" : "failed"; c.message = "Stopped before this channel was submitted. You can prepare it again."; }
      }
    });
    throw error;
  }
}

export const publishingRouter = Router();
publishingRouter.get("/postiz", (_req, res) => res.json(postizCredentials.status()));
publishingRouter.put("/postiz", (req, res) => res.json(postizCredentials.set(req.body)));
publishingRouter.delete("/postiz", (_req, res) => res.json(postizCredentials.forget()));
publishingRouter.get("/postiz/channels", async (_req, res) => res.json(await postizCredentials.client().channels()));
publishingRouter.get("/projects/:id/clips/:clipId/publishing", (req, res) => {
  const { project, clip } = publishClip(req.params.id, req.params.clipId), sourceHash = clipSourceHash(project, clip);
  const generated = clip.socialCopy?.sourceHash === sourceHash;
  res.json({ sourceHash, generated, copy: generated ? clip.socialCopy!.copy : fallbackCopy(clip), publications: project.publications?.filter(r => r.clipId === clip.id) ?? [] });
});
publishingRouter.put("/projects/:id/clips/:clipId/social-copy", async (req, res) => {
  const { sourceHash, copy } = z.object({ sourceHash: hashSchema, copy: socialCopySchema }).parse(req.body);
  await updateProject(req.params.id, p => {
    const clip = p.clips.find(c => c.id === req.params.clipId);
    if (!clip || clipSourceHash(p, clip) !== sourceHash) throw new Error("The clip changed. Reopen Prepare posts.");
    clip.socialCopy = { sourceHash, copy, provider: "manual", createdAt: new Date().toISOString() };
  });
  res.json({ saved: true });
});
publishingRouter.post("/projects/:id/clips/:clipId/social-copy", async (req, res) => {
  const options = copyOptionsSchema.parse(req.body), { id, clipId } = req.params;
  assertSource(id, clipId, options.sourceHash); await validateCopyProvider(options);
  res.status(202).json(enqueue("social-copy", id, context => generateCopy(id, clipId, options, context), `social-copy:${id}:${clipId}`, "Writing social copy"));
});
publishingRouter.post("/projects/:id/clips/:clipId/publish", async (req, res) => {
  const request = publishRequestSchema.parse(req.body), { id, clipId } = req.params;
  const client = postizCredentials.client();
  if (client.destination !== request.destination) throw new Error("The Postiz destination changed. Reopen Prepare posts before uploading.");
  const { clip } = assertSource(id, clipId, request.sourceHash);
  if (clip.aspect !== "9:16" || clip.end - clip.start < 3 || clip.end - clip.start > 180) throw new Error("Use a saved 9:16 clip between 3 seconds and 3 minutes for this short-video workflow.");
  checkSchedule(request);
  let existing: Publication | undefined;
  await updateProject(id, p => {
    existing = p.publications?.find(r => r.id === request.requestId);
    if (existing) {
      if (existing.clipId !== clipId || existing.sourceHash !== request.sourceHash || existing.destination !== request.destination)
        throw Object.assign(new Error("This request ID belongs to a different clip submission. Reopen Prepare posts."), { status: 409 });
      return;
    }
    if ((p.publications?.length ?? 0) >= 500) throw new Error("This project has reached its 500 publication-record limit. Use a new project.");
    if (p.publications?.some(r => r.destination === client.destination && r.clipId === clipId && r.sourceHash === request.sourceHash && r.channels.some(c => request.channels.some(ch => ch.id === c.id) && ["pending", "submitting", "submitted", "unknown"].includes(c.state))))
      throw Object.assign(new Error("This clip version already has a pending, submitted or unconfirmed post on a selected channel. Check the Postiz calendar first."), { status: 409 });
    const current = p.clips.find(c => c.id === clipId);
    if (!current || clipSourceHash(p, current) !== request.sourceHash) throw new Error("The clip changed. Reopen Prepare posts.");
    current.socialCopy = { copy: request.copy, sourceHash: request.sourceHash, provider: "manual", createdAt: new Date().toISOString() };
    (p.publications ??= []).push({ id: request.requestId, clipId, sourceHash: request.sourceHash, destination: client.destination,
      createdAt: new Date().toISOString(), mode: request.mode, date: request.date,
      channels: request.channels.map(c => ({ id: c.id, name: c.id, platform: platformOf(c.settings.__type), state: "pending" })),
    });
  });
  if (existing) { res.json({ publicationId: existing.id, existing: true }); return; }
  const job = enqueue("publish", id, context => runPublication(id, clipId, request, client, context), `publish:${request.requestId}`, "Preparing social posts");
  job.result = { publicationId: request.requestId };
  res.status(202).json(job);
});

publishingRouter.post("/projects/:id/publications/:recordId/resolve", async (req, res) => {
  const input = z.object({ channelId: z.string().min(1).max(150), outcome: z.enum(["exists", "absent"]), confirm: z.literal(true) }).parse(req.body);
  await updateProject(req.params.id, p => {
    const c = p.publications?.find(r => r.id === req.params.recordId)?.channels.find(c => c.id === input.channelId);
    if (!c || c.state !== "unknown") throw new Error("Only an unconfirmed submission can be resolved.");
    c.state = input.outcome === "exists" ? "submitted" : "failed";
    c.message = input.outcome === "exists" ? "You confirmed this post exists in Postiz." : "You confirmed no post exists in Postiz. This channel may be submitted again.";
  });
  res.json({ resolved: true });
});
