import express from "express";
import { ZipArchive } from "archiver";
import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readFile, copyFile, unlink } from "node:fs/promises";
import { z } from "zod";
import { restoreBackup } from "./backup.js";
import { importYoutube } from "./youtube.js";
import { youtubeUrl } from "../shared/youtube.js";
import { youtubeParts, sourceTime } from "../shared/youtube-range.js";
import { deleteProject } from "./delete-project.js";
import { aiCredentials, cloudProviderSchema } from "./ai-credentials.js";
import { providerEndpoint } from "./ai-endpoints.js";
import { providerDetails } from "../shared/ai-providers.js";
import { suggestionOptionsSchema } from "../shared/suggestions.js";
import { analyzeSuggestions, acceptSuggestions, qwenReadiness } from "./suggestions.js";
import { latestExports } from "../shared/exports.js";
import { publishingRouter, recoverPublications } from "./publishing.js";
import {
  initialize,
  MEDIA,
  EXPORTS,
  ROOT,
  getProject,
  listProjects,
  removeProject,
  updateProject,
  deletingProjects,
} from "./store.js";
import {
  jobs,
  enqueue,
  cancelJob,
  execute,
  initializeJobs,
  stopJobs,
} from "./jobs.js";
import {
  exists,
  PYTHON,
  modelList,
  installModel,
  importVideo,
  transcribeProject,
  exportClip,
  reframeClip,
  createPreview,
} from "./media.js";
import {
  clipSchema,
  segmentSchema,
  validateBounds,
  suggestClips,
  parseSrt,
  toSrt,
  downloadName,
} from "./domain.js";

await initialize();
initializeJobs();
await recoverPublications();
const app = express();
app.disable("x-powered-by");
const port = Number(process.env.CUTROOM_PORT || 4318);
const allowedHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
app.use((req, res, next) => {
  const host = req.hostname;
  if (!allowedHosts.has(host)) {
    res.status(403).json({ error: "Cutroom only accepts local connections." });
    return;
  }
  const origin = req.get("origin");
  if (origin) {
    try {
      const url = new URL(origin);
      if (
        !allowedHosts.has(url.hostname) ||
        !["5173", String(port)].includes(url.port) ||
        url.protocol !== "http:"
      )
        throw new Error();
    } catch {
      res.status(403).json({ error: "This origin is not allowed." });
      return;
    }
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "20mb" }));
app.get("/api/ai/providers", (_req, res) => res.json(aiCredentials.status()));
app.put("/api/ai/providers/:provider", (req, res) => {
  res.json(aiCredentials.set(cloudProviderSchema.parse(req.params.provider), req.body));
});
app.delete("/api/ai/providers/:provider", (req, res) => {
  res.json(aiCredentials.forget(cloudProviderSchema.parse(req.params.provider)));
});
const upload = multer({
  storage: multer.diskStorage({
    destination: MEDIA,
    filename: (_req, file, cb) =>
      cb(
        null,
        randomUUID() +
          path
            .extname(file.originalname)
            .toLowerCase()
            .replace(/[^.a-z0-9]/g, "")
            .slice(0, 12),
      ),
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!/\.(mp4|mov|mkv|webm|m4v|avi|mts|m2ts)$/i.test(file.originalname)) {
      cb(new Error("Choose an MP4, MOV, MKV, WebM, AVI, or MTS video."));
      return;
    }
    cb(null, true);
  },
});
let ready = { ffmpeg: false, python: await exists(PYTHON), ai: false, youtube: false, qwen: await qwenReadiness() };
try {
  await execute("ffmpeg", ["-version"], { timeout: 5000 });
  ready.ffmpeg = true;
} catch {
  /* Settings reports the missing system dependency. */
}
try {
  await execute(PYTHON, ["scripts/ai_worker.py", "check"], { timeout: 15000 });
  ready.ai = true;
} catch {
  /* Manual editing is available without the optional AI environment. */
}
app.get("/api/health", async (_req, res) => {
  res.json({
    status: "ok",
    ...ready,
    models: await modelList(),
    dataDirectory: ROOT,
    version: "0.1.0",
  });
});
try {
  await execute(PYTHON, ["scripts/youtube_worker.py", "--check"], { timeout: 10000 });
  ready.youtube = true;
} catch { /* File import remains available without the downloader. */ }
app.use("/api/projects/:id", (req, res, next) => {
  if (deletingProjects.has(req.params.id)) {
    res.status(409).json({ error: "This project is being deleted. Wait for deletion to finish." });
    return;
  }
  next();
});
app.use("/api", publishingRouter);
app.post("/api/import/youtube", (req, res) => {
  const { url, range, partMinutes, quality } = z.object({
    url: z.string().trim().min(1).max(2048),
    range: z.object({ start: z.number().finite(), end: z.number().finite() }).optional(),
    partMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]).optional(),
    quality: z.union([z.literal(720), z.literal(1080)]).default(720),
  }).parse(req.body);
  let canonical: string;
  try { canonical = youtubeUrl(url); }
  catch (error) { throw Object.assign(error as Error, { status: 400 }); }
  if (!ready.youtube || !ready.ffmpeg) {
    res.status(409).json({ error: "YouTube import needs the local downloader and FFmpeg. Run npm run setup:ai, then restart Cutroom." });
    return;
  }
  let parts;
  try { parts = youtubeParts(range, partMinutes); }
  catch (error) { throw Object.assign(error as Error, { status: 400 }); }
  const queued = parts.map((part) => enqueue("download", undefined,
    (context) => importYoutube(canonical, context, part, quality),
    `youtube:${canonical}:${part ? `${part.start}-${part.end}` : "full"}:${quality}`,
    part ? `YouTube ${sourceTime(part.start)}–${sourceTime(part.end)}` : undefined));
  res.status(202).json({ ...queued[0], queuedCount: queued.length });
});
app.delete("/api/projects/:id/files", async (req, res) => {
  z.object({ confirm: z.literal(true) }).parse(req.body);
  res.json(await deleteProject(req.params.id));
});
app.get("/api/projects", (_req, res) => res.json(listProjects()));
app.get("/api/projects/:id", (req, res) => res.json(getProject(req.params.id)));
app.post("/api/projects", upload.single("video"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Choose a video to import." });
    return;
  }
  const file = req.file;
  const job = enqueue("import", file.filename, async (context) => {
    try {
      return await importVideo(file.filename, file.originalname, context);
    } catch (error) {
      await unlink(file.path).catch(() => {});
      throw error;
    }
  });
  res.status(202).json(job);
});
app.post("/api/demo", async (_req, res) => {
  const existing = listProjects().find((p) => p.demo);
  if (existing) {
    res.json({ project: existing });
    return;
  }
  const demoPath = path.resolve("public/demo/studio-session.mp4");
  if (!(await exists(demoPath))) {
    res.status(409).json({
      error:
        "The sample video is not ready. Run npm run demo, or import your own video.",
    });
    return;
  }
  const job = enqueue("import", "demo", async (context) => {
    const filename = randomUUID() + ".mp4";
    await copyFile(demoPath, path.join(MEDIA, filename));
    const project = await importVideo(
      filename,
      "A small idea, well told.mp4",
      context,
      true,
    );
    const reviewed = path.resolve("public/demo/studio-session.transcript.json");
    const segments = await exists(reviewed)
      ? z.array(segmentSchema).parse(JSON.parse(await readFile(reviewed, "utf8")))
      : parseSrt(await readFile(path.resolve("public/demo/studio-session.srt"), "utf8"));
    return updateProject(project.id, (p) => {
      p.transcript = segments;
      p.language = "en";
      p.clips = [
        { title: "Start with one useful idea", start: 0, end: 7.85, aspect: "16:9", fit: "cover", captionStyle: "studio" },
        { title: "Watch it once on a small screen", start: 24.35, end: 32.55, aspect: "9:16", fit: "contain", captionStyle: "highlight" },
      ].map((clip) => ({
        ...clipSchema.parse({ ...clip, cropX: 50, cropY: 50, captionSize: 64, captionPosition: 20, captions: true, accent: "#d6f58a" }),
        id: randomUUID(), status: "draft", createdAt: new Date().toISOString(),
        reason: "A complete passage from the original sample narration.",
      }));
    });
  });
  res.status(202).json({ job });
});
app.patch("/api/projects/:id", async (req, res) => {
  const { name } = z
    .object({ name: z.string().trim().min(1).max(120) })
    .parse(req.body);
  res.json(
    await updateProject(req.params.id, (p) => {
      p.name = name;
    }),
  );
});
app.delete("/api/projects/:id", async (req, res) => {
  if (
    jobs.some(
      (j) =>
        j.projectId === req.params.id &&
        ["queued", "running"].includes(j.status),
    )
  ) {
    res.status(409).json({
      error: "Cancel this project’s processing job before removing it.",
    });
    return;
  }
  await removeProject(req.params.id);
  res.json({
    removed: true,
    message:
      "Removed from the library. Original media and exports remain in the local data folder.",
  });
});
app.get("/api/projects/:id/media", (req, res) => {
  const p = getProject(req.params.id);
  res.sendFile(path.join(MEDIA, p.previewFile || p.filename), {
    dotfiles: "allow",
  });
});
app.get("/api/projects/:id/thumbnail", (req, res) => {
  const p = getProject(req.params.id);
  res.sendFile(path.join(MEDIA, p.id + ".jpg"), { dotfiles: "allow" });
});
app.post("/api/projects/:id/transcribe", async (req, res) => {
  const { model, language } = z
    .object({
      model: z.enum(["tiny", "base", "small", "large-v3"]),
      language: z.enum([
        "auto",
        "en",
        "mn",
        "es",
        "fr",
        "de",
        "ja",
        "ko",
        "zh",
        "ru",
        "pt",
        "it",
        "ar",
        "hi",
        "tr",
      ]),
    })
    .parse(req.body);
  const project = getProject(req.params.id);
  if (!project.hasAudio) {
    res.status(400).json({
      error: "This video has no audio. Import an SRT file to add captions.",
    });
    return;
  }
  if (!(await modelList()).find((m) => m.id === model)?.installed) {
    res
      .status(409)
      .json({ error: "Install the selected model in Settings first." });
    return;
  }
  res
    .status(202)
    .json(
      enqueue("transcribe", project.id, (context) =>
        transcribeProject(project.id, model, language, context),
      ),
    );
});
app.put("/api/projects/:id/transcript", async (req, res) => {
  const { segments } = z
    .object({ segments: z.array(segmentSchema).max(20000) })
    .parse(req.body);
  const p = getProject(req.params.id);
  segments.forEach((s) => validateBounds(s.start, s.end, p.duration));
  res.json(
    await updateProject(p.id, (p) => {
      p.transcript = segments.toSorted((a, b) => a.start - b.start);
      p.clips.forEach((clip) => {
        clip.status = "draft";
      });
    }),
  );
});
app.post("/api/projects/:id/subtitles", async (req, res) => {
  const { text } = z.object({ text: z.string().max(4000000) }).parse(req.body);
  const p = getProject(req.params.id);
  const segments = parseSrt(text);
  segments.forEach((s) => validateBounds(s.start, s.end, p.duration));
  res.json(
    await updateProject(p.id, (p) => {
      p.transcript = segments;
      p.clips.forEach((clip) => {
        clip.status = "draft";
      });
    }),
  );
});
app.get("/api/projects/:id/subtitles", (req, res) => {
  const p = getProject(req.params.id);
  res.setHeader("Content-Disposition", 'attachment; filename="captions.srt"');
  res.type("text/plain").send(toSrt(p.transcript));
});
app.post("/api/projects/:id/suggestions/analyze", (req, res) => {
  const options = suggestionOptionsSchema.parse(req.body);
  const p = getProject(req.params.id);
  if (!p.transcript.length) { res.status(400).json({ error: "Transcribe the video or import subtitles first." }); return; }
  if (options.provider === "local") {
    if (!ready.qwen.ready) { res.status(409).json({ error: ready.qwen.message }); return; }
  } else {
    if (req.body.cloudConsent !== true) {
      res.status(400).json({ error: "Confirm sharing transcript text, timestamps, and editorial guidance with the selected provider for this analysis." }); return;
    }
    options.model ||= providerDetails[options.provider].model;
    if (!options.model) { res.status(400).json({ error: "Enter a structured-output model ID for this provider." }); return; }
    const endpoint = providerEndpoint(options.provider);
    if (options.provider === "custom" && req.body.cloudDestination !== endpoint) {
      res.status(400).json({ error: "Confirm the configured custom destination shown in the review dialog." }); return;
    }
    aiCredentials.get(options.provider);
  }
  res.status(202).json(enqueue("suggest", p.id, (context) => analyzeSuggestions(p.id, options, context)));
});
app.post("/api/projects/:id/suggestions/accept", async (req, res) => {
  const { reviewId, ids } = z.object({ reviewId: z.string().uuid(), ids: z.array(z.string().uuid()).min(1).max(30) }).parse(req.body);
  res.json(await acceptSuggestions(req.params.id, reviewId, ids));
});
app.post("/api/projects/:id/suggestions", async (req, res) => {
  const { target } = z
    .object({ target: z.number().min(10).max(180).default(35) })
    .parse(req.body);
  const p = getProject(req.params.id);
  if (!p.transcript.length) {
    res
      .status(400)
      .json({ error: "Transcribe the video or import subtitles first." });
    return;
  }
  const suggestions = suggestClips(p.transcript, p.duration, target).filter(
    (c) =>
      !p.clips.some(
        (existing) =>
          Math.abs(existing.start - c.start) < 1 &&
          Math.abs(existing.end - c.end) < 1,
      ),
  );
  res.json(
    await updateProject(p.id, (p) => {
      p.clips.push(
        ...suggestions.map((c) => ({
          ...c,
          id: randomUUID(),
          createdAt: new Date().toISOString(),
        })),
      );
    }),
  );
});
app.post("/api/projects/:id/clips", async (req, res) => {
  const clip = clipSchema.parse(req.body),
    p = getProject(req.params.id);
  validateBounds(clip.start, clip.end, p.duration);
  res.status(201).json(
    await updateProject(p.id, (p) => {
      p.clips.push({
        ...clip,
        id: randomUUID(),
        status: "draft",
        createdAt: new Date().toISOString(),
      });
    }),
  );
});
app.put("/api/projects/:id/clips/:clipId", async (req, res) => {
  const clip = clipSchema.parse(req.body),
    p = getProject(req.params.id);
  validateBounds(clip.start, clip.end, p.duration);
  if (!p.clips.some((c) => c.id === req.params.clipId)) {
    res.status(404).json({ error: "Clip not found." });
    return;
  }
  res.json(
    await updateProject(p.id, (p) => {
      p.clips = p.clips.map((c) =>
        c.id === req.params.clipId
          ? {
              ...c,
              ...clip,
              status: "draft",
              reason:
                c.start === clip.start && c.end === clip.end
                  ? c.reason
                  : undefined,
            }
          : c,
      );
    }),
  );
});
app.delete("/api/projects/:id/clips/:clipId", async (req, res) => {
  res.json(
    await updateProject(req.params.id, (p) => {
      p.clips = p.clips.filter((c) => c.id !== req.params.clipId);
    }),
  );
});
app.post("/api/projects/:id/clips/:clipId/export", (req, res) => {
  const { quality } = z
    .object({ quality: z.enum(["720", "1080"]).default("1080") })
    .parse(req.body);
  const p = getProject(req.params.id),
    clip = p.clips.find((c) => c.id === req.params.clipId);
  if (!clip) {
    res.status(404).json({ error: "Clip not found." });
    return;
  }
  res
    .status(202)
    .json(
      enqueue(
        "export",
        p.id,
        (context) => exportClip(p.id, structuredClone(clip), quality, context),
        `export:${p.id}:${clip.id}:${quality}`,
      ),
    );
});
app.post("/api/exports/batch", (req, res) => {
  const { clips, quality } = z
    .object({
      clips: z
        .array(
          z.object({ projectId: z.string().uuid(), clipId: z.string().uuid() }),
        )
        .min(1)
        .max(50),
      quality: z.enum(["720", "1080"]).default("1080"),
    })
    .parse(req.body);
  const unique = new Map(
    clips.map((item) => [`${item.projectId}:${item.clipId}`, item]),
  );
  const snapshots = [...unique.values()].map(({ projectId, clipId }) => {
    const project = getProject(projectId);
    const clip = project.clips.find((clip) => clip.id === clipId);
    if (!clip)
      throw new Error(
        "A selected clip is no longer available. Refresh the clip list and try again.",
      );
    return { projectId, clip: structuredClone(clip) };
  });
  res
    .status(202)
    .json(
      snapshots.map(({ projectId, clip }) =>
        enqueue(
          "export",
          projectId,
          (context) => exportClip(projectId, clip, quality, context),
          `export:${projectId}:${clip.id}:${quality}`,
        ),
      ),
    );
});
app.post("/api/projects/:id/clips/:clipId/reframe", (req, res) => {
  const p = getProject(req.params.id),
    clip = p.clips.find((c) => c.id === req.params.clipId);
  if (!clip) {
    res.status(404).json({ error: "Clip not found." });
    return;
  }
  res
    .status(202)
    .json(
      enqueue("reframe", p.id, (context) =>
        reframeClip(p.id, structuredClone(clip), context),
      ),
    );
});
app.post("/api/projects/:id/preview", (req, res) => {
  const p = getProject(req.params.id);
  res
    .status(202)
    .json(enqueue("preview", p.id, (context) => createPreview(p.id, context)));
});
app.get("/api/exports/:id/:format", (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const format = z.enum(["mp4", "srt"]).parse(req.params.format);
  const file = listProjects()
    .flatMap((p) => p.exports)
    .find((e) => e.id === id);
  if (!file) {
    res.status(404).json({ error: "Export not found." });
    return;
  }
  res.download(
    path.join(EXPORTS, `${id}.${format}`),
    `${downloadName(file.title)}.${format}`,
    { dotfiles: "allow" },
  );
});
app.get("/api/jobs", (_req, res) => res.json(jobs));
app.get("/api/projects/:id/package", async (req, res, next) => {
  const project = getProject(req.params.id);
  const versions = z
    .enum(["latest", "all"])
    .default("latest")
    .parse(req.query.versions);
  const files =
    versions === "all" ? project.exports : latestExports(project.exports);
  if (!files.length) {
    res.status(400).json({
      error: "Render at least one clip before downloading a delivery pack.",
    });
    return;
  }
  const available = await Promise.all(
    files.map(async (file) => ({
      file,
      ready:
        (await exists(path.join(EXPORTS, file.filename))) &&
        (await exists(path.join(EXPORTS, file.id + ".srt"))),
    })),
  );
  if (available.some((entry) => !entry.ready)) {
    res.status(409).json({
      error:
        "An exported file is missing from disk. Render the missing clip again before packaging.",
    });
    return;
  }
  const zip = new ZipArchive({ store: true });
  zip.on("error", (error) => {
    if (!res.headersSent) next(error);
    else res.destroy();
  });
  res.attachment(
    `${downloadName(project.name, "cutroom")}-${versions === "all" ? "all-versions" : "delivery"}.zip`,
  );
  zip.pipe(res);
  files.forEach((file, index) => {
    const title = `${String(index + 1).padStart(2, "0")}-${downloadName(file.title, "clip")}`;
    zip.file(path.join(EXPORTS, file.filename), {
      name: `videos/${title}.mp4`,
    });
    zip.file(path.join(EXPORTS, file.id + ".srt"), {
      name: `captions/${title}.srt`,
    });
  });
  zip.append(
    JSON.stringify(
      {
        project: project.name,
        preparedAt: new Date().toISOString(),
        versions,
        exports: files.map(({ title, duration, aspect, createdAt }) => ({
          title,
          duration,
          aspect,
          createdAt,
        })),
      },
      null,
      2,
    ),
    { name: "delivery-notes.json" },
  );
  zip.append(
    `CUTROOM DELIVERY\n\nProject: ${project.name}\n${files.length} finished video(s)\n\n/videos contains H.264 MP4 clips.\n/captions contains editable SRT subtitles, timed from the start of each clip.\n\nCaptions may also be burned into the video, depending on export settings. Review every file before publishing.\n\nCreated locally with Cutroom.\n`,
    { name: "README.txt" },
  );
  res.on("close", () => {
    if (!res.writableFinished) zip.abort();
  });
  await zip.finalize();
});
app.post("/api/jobs/:id/cancel", async (req, res) => {
  const job = cancelJob(req.params.id);
  const publicationId = (job.result as { publicationId?: string })?.publicationId;
  if (job.kind === "publish" && job.projectId && publicationId) await updateProject(job.projectId, p => {
    for (const c of p.publications?.find(r => r.id === publicationId)?.channels ?? [])
      if (c.state === "pending") { c.state = "cancelled"; c.message = "Cancelled before submission."; }
  });
  res.json(job);
});
app.post("/api/models/:model/install", (req, res) => {
  const model = z.enum(["tiny", "base", "small", "large-v3"]).parse(req.params.model);
  res
    .status(202)
    .json(enqueue("model", model, (context) => installModel(model, context)));
});
app.get("/api/backup", (_req, res) => {
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="cutroom-projects.json"',
  );
  res.json({
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: listProjects(),
  });
});
app.post("/api/backup/restore", async (req, res) => {
  const { backup, preview } = z
    .object({
      backup: z.unknown(),
      preview: z.boolean().default(true),
    })
    .parse(req.body);
  res.json(await restoreBackup(backup, preview));
});
app.use("/opendesign", express.static(path.resolve("opendesign")));
app.use(express.static(path.resolve("dist")));
app.get("/{*path}", (req, res) => {
  if (req.path.startsWith("/api"))
    res.status(404).json({ error: "Endpoint not found." });
  else res.sendFile(path.resolve("dist/index.html"));
});
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (res.headersSent) return;
    if ((error as { type?: string })?.type === "entity.parse.failed") {
      res.status(400).json({ error: "The request body must be valid JSON." }); return;
    }
    if (error instanceof z.ZodError) {
      res
        .status(400)
        .json({ error: error.issues[0]?.message || "Check the form values." });
      return;
    }
    if (error instanceof multer.MulterError) {
      res.status(400).json({
        error:
          error.code === "LIMIT_FILE_SIZE"
            ? "The video is too large. Import a file under 2 GB."
            : "The upload could not be read.",
      });
      return;
    }
    const e = error as Error & { status?: number };
    res
      .status(e.status || 400)
      .json({ error: e.message || "The request could not be completed." });
  },
);
const server = app.listen(port, "127.0.0.1", () =>
  console.log(`Cutroom local API: http://127.0.0.1:${port}`),
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    stopJobs();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
