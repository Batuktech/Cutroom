import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rename, rm, unlink } from "node:fs/promises";
import { TEMP, MEDIA } from "./store.js";
import { execute, type JobContext } from "./jobs.js";
import { importVideo, PYTHON } from "./media.js";
import { youtubeUrl } from "../shared/youtube.js";
import { sourceTime, type YoutubeRange, type YoutubeQuality } from "../shared/youtube-range.js";

export async function importYoutube(url: string, context: JobContext, range?: YoutubeRange, quality: YoutubeQuality = 720) {
  const canonical = youtubeUrl(url);
  const folder = await mkdtemp(path.join(TEMP, "youtube-"));
  let source: string | undefined;
  let saved = false;
  try {
    await execute(PYTHON, [
      path.resolve("scripts/youtube_worker.py"), "--url", canonical,
      "--folder", folder, "--node", process.execPath, "--quality", String(quality),
      ...(range ? ["--start", String(range.start), "--end", String(range.end)] : []),
    ], {
      jobId: context.job.id,
      onLine: (line) => {
        try {
          const data = JSON.parse(line);
          if (typeof data.progress === "number")
            context.progress(data.progress * .8, range ? `${sourceTime(range.start)}–${sourceTime(range.end)} · ${data.message}` : data.message);
        } catch { /* Dependency notices are not download progress. */ }
      },
    });
    if (context.job.status === "cancelled") throw new Error("Download cancelled.");
    const result = JSON.parse(await readFile(path.join(folder, "result.json"), "utf8"));
    if (!/^source\.(mp4|mkv|webm|mov)$/.test(result.filename))
      throw new Error("The downloader returned an unsupported file.");
    const extension = path.extname(result.filename);
    const filename = randomUUID() + extension;
    source = path.join(MEDIA, filename);
    await rename(path.join(folder, result.filename), source);
    const title = Array.from(String(result.title)).filter((char) => char.charCodeAt(0) >= 32).join('').slice(0, 120);
    const project = await importVideo(filename, (range ? `${title.slice(0, 90)} [${sourceTime(range.start)}–${sourceTime(range.end)}]` : title) + extension, {
      ...context,
      progress: (value, message) => context.progress(80 + value * .19, message),
    });
    saved = true;
    return project;
  } finally {
    if (source && !saved) await unlink(source).catch(() => {});
    await rm(folder, { recursive: true, force: true });
  }
}
