import path from "node:path";
import { access } from "node:fs/promises";
import { z } from "zod";
import { clipSchema, segmentSchema } from "./domain.js";
import { suggestionReviewSchema } from "../shared/suggestions.js";
import { publicationSchema, savedSocialCopySchema } from "../shared/publishing.js";
import { EXPORTS, MEDIA, listProjects, restoreProjects } from "./store.js";
import type { Project, RestoreSummary } from "../shared/types.js";

const assetName = z
  .string()
  .regex(
    /^[0-9a-f-]{36}(?:-preview)?\.(?:mp4|mov|mkv|webm|m4v|avi|mts|m2ts)$/i,
    "The backup contains an invalid media filename.",
  );
const date = z.string().datetime();
const projectSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    originalName: z.string().max(500),
    filename: assetName,
    createdAt: date,
    updatedAt: date,
    duration: z.number().min(1).max(10800),
    width: z.number().int().positive().max(8192),
    height: z.number().int().positive().max(8192),
    fps: z.number().nonnegative().max(1000),
    hasAudio: z.boolean(),
    size: z.number().nonnegative(),
    thumbnail: z.boolean(),
    waveform: z.array(z.number().min(0).max(1)).max(2000),
    transcript: z.array(segmentSchema).max(50000),
    language: z.string().max(30).nullable(),
    clips: z
      .array(
        clipSchema.safeExtend({
          id: z.string().uuid(),
          status: z.enum(["draft", "exported"]),
          createdAt: date,
          reason: z.string().max(500).optional(),
          socialCopy: savedSocialCopySchema.optional(),
        }),
      )
      .max(1000),
    exports: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            clipId: z.string().uuid(),
            title: z.string().min(1).max(120),
            filename: assetName,
            createdAt: date,
            duration: z.number().positive().max(1800),
            aspect: z.enum(["9:16", "1:1", "16:9", "4:5"]),
            size: z.number().nonnegative(),
            width: z.number().int().positive().max(8192).optional(),
            height: z.number().int().positive().max(8192).optional(),
          })
          .refine(
            (e) => e.filename === `${e.id}.mp4`,
            "Invalid export filename.",
          ),
      )
      .max(5000),
    demo: z.boolean(),
    suggestions: suggestionReviewSchema.optional(),
    publications: z.array(publicationSchema).max(500).optional(),
    previewFile: assetName.optional(),
  })
  .refine(
    (p) =>
      [...p.clips, ...p.transcript].every((s) => s.end <= p.duration + 0.05),
    "The backup contains edits outside the source video.",
  );

export const backupSchema = z
  .object({
    version: z.literal(1),
    exportedAt: date,
    projects: z.array(projectSchema).max(1000),
  })
  .refine(
    (backup) =>
      new Set(backup.projects.map((p) => p.id)).size === backup.projects.length,
    "The backup contains duplicate project IDs.",
  );

async function present(file: string) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function restoreBackup(
  input: unknown,
  preview: boolean,
): Promise<RestoreSummary> {
  const backup = backupSchema.parse(input);
  const existing = new Set(listProjects().map((p) => p.id));
  const projects: Project[] = [];
  const summary: RestoreSummary = {
    restored: 0,
    ready: [],
    existing: [],
    missingMedia: [],
    missingExports: 0,
  };
  for (const project of backup.projects) {
    // Restoring metadata never resumes uploads or external submissions.
    for (const record of project.publications ?? []) for (const channel of record.channels) {
      if (channel.state === "pending") channel.state = "failed";
      if (channel.state === "submitting") channel.state = "unknown";
    }
    if (existing.has(project.id)) {
      summary.existing.push(project.name);
      continue;
    }
    if (!(await present(path.join(MEDIA, project.filename)))) {
      summary.missingMedia.push(project.name);
      continue;
    }
    const exports = [];
    for (const file of project.exports) {
      if (
        (await present(path.join(EXPORTS, file.filename))) &&
        (await present(path.join(EXPORTS, `${file.id}.srt`)))
      )
        exports.push(file);
      else summary.missingExports++;
    }
    project.exports = exports;
    project.thumbnail = await present(path.join(MEDIA, `${project.id}.jpg`));
    if (
      project.previewFile &&
      !(await present(path.join(MEDIA, project.previewFile)))
    )
      delete project.previewFile;
    for (const clip of project.clips)
      if (!exports.some((file) => file.clipId === clip.id))
        clip.status = "draft";
    projects.push(project);
    summary.ready.push(project.name);
  }
  if (!preview) summary.restored = await restoreProjects(projects);
  return summary;
}
