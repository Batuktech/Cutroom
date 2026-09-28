import path from "node:path";
import {
  access,
  readFile,
  stat,
  writeFile,
  unlink,
  rename,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { execute as executeProcess, type JobContext } from "./jobs.js";
import {
  MEDIA,
  MODELS,
  TEMP,
  TRANSCRIPTS,
  EXPORTS,
  addProject,
  getProject,
  updateProject,
} from "./store.js";
import { buildAss, outputSize, suggestClips, toSrt } from "./domain.js";
import type { Clip, ModelInfo, Project, Segment } from "../shared/types.js";
import { captionSegments } from "../shared/captions.js";
import { sameClipEdits } from "../shared/clips.js";

export const PYTHON = path.resolve(".venv/bin/python");
const WORKER = path.resolve("scripts/ai_worker.py");
// Uploaded containers must not resolve embedded HTTP/RTSP inputs during probing or rendering.
const execute: typeof executeProcess = (command, args, options) =>
  executeProcess(
    command,
    command === "ffmpeg" || command === "ffprobe"
      ? ["-protocol_whitelist", "file,pipe", ...args]
      : args,
    options,
  );
export async function exists(file: string) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
export async function modelList(): Promise<ModelInfo[]> {
  return Promise.all(
    [
      {
        id: "tiny",
        name: "Whisper Tiny",
        size: "75 MB",
        description: "Fastest. For rough drafts of clear speech.",
      },
      {
        id: "base",
        name: "Whisper Base",
        size: "145 MB",
        description: "A little more accurate, with a modest memory cost.",
      },
      {
        id: "small",
        name: "Whisper Small",
        size: "465 MB",
        description:
          "Better speech recognition. Slower on CPU; needs more memory.",
      },
      {
        id: "large-v3",
        name: "Whisper Large v3",
        size: "3.1 GB",
        description:
          "Full-size Whisper for a more careful pass. Slowest on CPU; uses more memory.",
      },
    ].map(async (model) => ({
      ...model,
      installed: (
        await Promise.all(
          [".ready", "model.bin", "config.json", "tokenizer.json"].map((file) =>
            exists(path.join(MODELS, model.id, file)),
          ),
        )
      ).every(Boolean),
    })),
  );
}
function workerProgress(context: JobContext) {
  return (line: string) => {
    try {
      const data = JSON.parse(line);
      if (typeof data.progress === "number")
        context.progress(data.progress, data.message);
    } catch {
      /* Python dependency notices are not progress events. */
    }
  };
}
export async function installModel(model: string, context: JobContext) {
  await execute(
    PYTHON,
    [WORKER, "install", "--model", model, "--models", MODELS],
    { jobId: context.job.id, onLine: workerProgress(context) },
  );
  return { model };
}
export async function probe(file: string) {
  const raw = (await execute(
    "ffprobe",
    ["-v", "error", "-show_format", "-show_streams", "-of", "json", file],
    { timeout: 30000 },
  )) as string;
  const data = JSON.parse(raw);
  const video = data.streams?.find(
    (s: { codec_type: string }) => s.codec_type === "video",
  );
  if (!video) throw new Error("This file does not contain a video stream.");
  const duration = Number(data.format.duration || video.duration);
  if (!Number.isFinite(duration) || duration < 1 || duration > 10800)
    throw new Error("Import a video between 1 second and 3 hours long.");
  if (
    !video.width ||
    !video.height ||
    video.width > 8192 ||
    video.height > 8192
  )
    throw new Error("Video dimensions must be 8K or smaller.");
  const [num, den] = String(video.avg_frame_rate || "30/1")
    .split("/")
    .map(Number);
  const rotation = Number(
    video.side_data_list?.find(
      (data: { rotation?: number }) => typeof data.rotation === "number",
    )?.rotation ??
      video.tags?.rotate ??
      0,
  );
  const portraitRotation = Math.abs(rotation) % 180 === 90;
  return {
    duration,
    width: (portraitRotation ? video.height : video.width) as number,
    height: (portraitRotation ? video.width : video.height) as number,
    fps: den ? num / den : 30,
    hasAudio: data.streams.some(
      (s: { codec_type: string }) => s.codec_type === "audio",
    ),
    size: Number(data.format.size),
  };
}
export async function importVideo(
  filename: string,
  originalName: string,
  context: JobContext,
  demo = false,
): Promise<Project> {
  const full = path.join(MEDIA, filename);
  context.progress(5, "Reading video information");
  const info = await probe(full);
  const id = randomUUID();
  try {
  context.progress(20, "Creating preview and audio waveform");
  let thumbnail = false;
  try {
    await execute(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-threads",
        "2",
        "-ss",
        String(Math.min(info.duration * 0.25, 10)),
        "-i",
        full,
        "-frames:v",
        "1",
        "-vf",
        "scale=640:-2",
        "-q:v",
        "3",
        "-y",
        path.join(MEDIA, id + ".jpg"),
      ],
      { jobId: context.job.id, timeout: 60000 },
    );
    thumbnail = true;
  } catch {
    /* A decodable video may have no seekable thumbnail. */
  }
  context.progress(50, "Analyzing audio levels");
  let waveform: number[] = [];
  if (info.hasAudio) {
    const raw = (await execute(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-threads",
        "2",
        "-i",
        full,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "1000",
        "-f",
        "f32le",
        "-",
      ],
      { jobId: context.job.id, binary: true },
    )) as Buffer;
    const samples = Math.floor(raw.length / 4);
    const bins = 240;
    waveform = Array.from({ length: bins }, (_, i) => {
      const a = Math.floor((i * samples) / bins),
        b = Math.max(a + 1, Math.floor(((i + 1) * samples) / bins));
      let peak = 0;
      for (let j = a; j < b && j < samples; j++)
        peak = Math.max(peak, Math.abs(raw.readFloatLE(j * 4)));
      return peak;
    });
    const peak = Math.max(...waveform, 0.01);
    waveform = waveform.map((v) => Math.round((v / peak) * 1000) / 1000);
  }
  const now = new Date().toISOString();
  if (context.job.status === "cancelled") throw new Error("Import cancelled.");
  return await addProject({
    id,
    name: originalName.replace(/\.[^.]+$/, "").slice(0, 120),
    originalName,
    filename,
    ...info,
    thumbnail,
    waveform,
    transcript: [],
    language: null,
    clips: [],
    exports: [],
    createdAt: now,
    updatedAt: now,
    demo,
  });
  } catch (error) {
    await unlink(path.join(MEDIA, id + ".jpg")).catch(() => {});
    throw error;
  }
}
export async function transcribeProject(
  id: string,
  model: string,
  language: string,
  context: JobContext,
) {
  const project = getProject(id);
  if (!project.hasAudio)
    throw new Error(
      "This video has no audio. You can import captions instead.",
    );
  const output = path.join(TEMP, context.job.id + ".json");
  try {
    await writeFile(
      path.join(TRANSCRIPTS, `${id}-${context.job.id}-before.json`),
      JSON.stringify({ projectId: id, language: project.language, segments: project.transcript }),
      { flag: "wx" },
    );
    await writeFile(
      path.join(TRANSCRIPTS, `${id}-${context.job.id}-before.srt`),
      toSrt(project.transcript),
      { flag: "wx" },
    );
    await execute(
      PYTHON,
      [
        WORKER,
        "transcribe",
        "--model",
        model,
        "--models",
        MODELS,
        "--input",
        path.join(MEDIA, project.filename),
        "--output",
        output,
        "--language",
        language,
      ],
      {
        jobId: context.job.id,
        onLine: workerProgress(context),
        timeout: model === "large-v3" ? 6 * 60 * 60 * 1000 : 60 * 60 * 1000,
      },
    );
    const rawResult = await readFile(output, "utf8");
    await writeFile(
      path.join(TRANSCRIPTS, `${id}-${context.job.id}-result.json`),
      rawResult,
      { flag: "wx" },
    );
    const result = JSON.parse(rawResult) as {
      segments: Segment[];
      language: string;
    };
    if (!result.segments.some((segment) => segment.text.trim()))
      throw new Error(
        "No speech was recognized. Previous captions were kept. Try another model or import reviewed subtitles.",
      );
    await updateProject(id, (p) => {
      if (JSON.stringify(p.transcript) !== JSON.stringify(project.transcript))
        throw new Error(
          "Captions changed while transcription was running. Your edits were kept. Run transcription again when you are ready to replace them.",
        );
      p.transcript = result.segments
        .filter((s) => s.start < p.duration)
        .map((s) => ({ ...s, end: Math.min(s.end, p.duration) }));
      p.language = result.language;
      p.clips.forEach((clip) => {
        clip.status = "draft";
      });
      if (!p.clips.length)
        p.clips = suggestClips(p.transcript, p.duration).map((c) => ({
          ...c,
          id: randomUUID(),
          createdAt: new Date().toISOString(),
        }));
    });
    return { segments: result.segments.length, language: result.language, model };
  } finally {
    await unlink(output).catch(() => {});
  }
}
function videoFilter(clip: Clip, width: number, height: number) {
  if (clip.fit === "contain")
    return `scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x101210,setsar=1`;
  return `scale=${width}:${height}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${width}:${height}:(iw-ow)*${clip.cropX / 100}:(ih-oh)*${clip.cropY / 100},setsar=1`;
}
export async function exportClip(
  projectId: string,
  clip: Clip,
  quality: "720" | "1080",
  context: JobContext,
) {
  const project = getProject(projectId);
  const exportId = randomUUID();
  const filename = exportId + ".mp4";
  const output = path.join(EXPORTS, filename);
  const [width, height] = outputSize(clip.aspect, quality).map(
    (n) => Math.round(n / 2) * 2,
  );
  const duration = clip.end - clip.start;
  let filter = videoFilter(clip, width, height);
  let ass: string | null = null;
  if (clip.captions && project.transcript.length) {
    ass = path.join(TEMP, context.job.id + ".ass");
    await writeFile(ass, buildAss(project.transcript, clip, width, height));
    filter += `,ass=filename='${ass.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "'\\''")}':fontsdir='${path.resolve("public/fonts")}'`;
  }
  context.progress(2, "Rendering your clip locally");
  try {
    await execute(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-threads",
        "2",
        "-ss",
        String(clip.start),
        "-i",
        path.join(MEDIA, project.filename),
        "-t",
        String(duration),
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-vf",
        filter,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-threads",
        "2",
        "-filter_threads",
        "2",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        "-progress",
        "pipe:1",
        "-nostats",
        "-y",
        output,
      ],
      {
        jobId: context.job.id,
        onLine: (line) => {
          if (line.startsWith("out_time_us="))
            context.progress(
              (Number(line.split("=")[1]) / 1000000 / duration) * 98,
              "Rendering your clip locally",
            );
        },
      },
    );
    const info = await stat(output);
    const file = {
      id: exportId,
      clipId: clip.id,
      title: clip.title,
      filename,
      createdAt: new Date().toISOString(),
      duration,
      aspect: clip.aspect,
      size: info.size,
      width,
      height,
    };
    await writeFile(
      path.join(EXPORTS, exportId + ".srt"),
      toSrt(
        captionSegments(project.transcript, clip.captionStyle, clip),
        clip.start,
        clip.end,
      ),
    );
    await updateProject(projectId, (p) => {
      context.signal?.throwIfAborted();
      p.exports.unshift(file);
      const original = p.clips.find((c) => c.id === clip.id);
      if (
        original &&
        sameClipEdits(original, clip) &&
        JSON.stringify(p.transcript) === JSON.stringify(project.transcript)
      )
        original.status = "exported";
    });
    return file;
  } catch (error) {
    await unlink(output).catch(() => {});
    await unlink(path.join(EXPORTS, exportId + ".srt")).catch(() => {});
    throw error;
  } finally {
    if (ass) await unlink(ass).catch(() => {});
  }
}
export async function reframeClip(
  projectId: string,
  clip: Clip,
  context: JobContext,
) {
  const project = getProject(projectId);
  const output = path.join(TEMP, context.job.id + ".json");
  await execute(
    PYTHON,
    [
      WORKER,
      "reframe",
      "--input",
      path.join(MEDIA, project.filename),
      "--start",
      String(clip.start),
      "--end",
      String(clip.end),
      "--output",
      output,
    ],
    { jobId: context.job.id, onLine: workerProgress(context) },
  );
  const result = JSON.parse(await readFile(output, "utf8"));
  await unlink(output).catch(() => {});
  if (result.found) {
    const [w, h] = outputSize(clip.aspect);
    const scale = Math.max(w / project.width, h / project.height);
    const scaledWidth = project.width * scale;
    const cropX =
      scaledWidth <= w
        ? 50
        : Math.max(
            0,
            Math.min(
              100,
              (((scaledWidth * result.centerX) / 100 - w / 2) /
                (scaledWidth - w)) *
                100,
            ),
          );
    let applied = false;
    await updateProject(projectId, (p) => {
      const c = p.clips.find((c) => c.id === clip.id);
      if (
        c &&
        c.cropX === clip.cropX &&
        c.cropY === clip.cropY &&
        c.aspect === clip.aspect &&
        c.fit === clip.fit
      ) {
        c.cropX = cropX;
        c.status = "draft";
        applied = true;
      }
    });
    return { ...result, cropX, applied };
  }
  return result;
}
export async function createPreview(id: string, context: JobContext) {
  const p = getProject(id);
  const name = id + "-preview.mp4";
  const temporary = path.join(TEMP, context.job.id + "-preview.mp4");
  try {
    await execute(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        path.join(MEDIA, p.filename),
        "-vf",
        "scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "25",
        "-pix_fmt",
        "yuv420p",
        "-threads",
        "2",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        "-progress",
        "pipe:1",
        "-y",
        temporary,
      ],
      {
        jobId: context.job.id,
        onLine: (line) => {
          if (line.startsWith("out_time_us="))
            context.progress(
              (Number(line.split("=")[1]) / 1000000 / p.duration) * 98,
              "Creating a browser-compatible preview",
            );
        },
      },
    );
    if (context.job.status === "cancelled")
      throw new Error("Processing was stopped.");
    await rename(temporary, path.join(MEDIA, name));
    await updateProject(id, (p) => {
      p.previewFile = name;
    });
    return { ready: true };
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
