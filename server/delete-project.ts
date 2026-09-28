import path from "node:path";
import { lstat, readdir, unlink } from "node:fs/promises";
import type { Project } from "../shared/types.js";
import { MEDIA, EXPORTS, TRANSCRIPTS, TEMP, deleteProjectFiles } from "./store.js";
import { jobs, projectIsProcessing } from "./jobs.js";

function asset(directory: string, name: string) {
  if (!name || name !== path.basename(name) || name.includes('\\') || !/^[a-z0-9.-]+$/i.test(name))
    throw new Error("An invalid project filename prevented deletion.");
  return path.join(directory, name);
}

function registeredFiles(project: Project) {
  return [
    asset(MEDIA, project.filename),
    asset(MEDIA, project.id + '.jpg'),
    asset(MEDIA, project.id + '-preview.mp4'),
    ...(project.previewFile ? [asset(MEDIA, project.previewFile)] : []),
    ...project.exports.flatMap((file) => [
      asset(EXPORTS, file.filename), asset(EXPORTS, file.id + '.srt'),
    ]),
  ];
}

export async function deleteProject(id: string) {
  if (projectIsProcessing(id))
    throw Object.assign(new Error("Cancel this project’s jobs and wait for them to stop before deleting it."), { status: 409 });
  return deleteProjectFiles(id, async (project, others) => {
    const protectedFiles = new Set(others.flatMap(registeredFiles));
    const files = new Set(registeredFiles(project));
    for (const name of await readdir(TRANSCRIPTS))
      if (name.startsWith(id + '-') && /\.(json|srt)$/.test(name)) files.add(asset(TRANSCRIPTS, name));
    for (const job of jobs.filter((job) => job.projectId === id)) {
      for (const suffix of ['.json', '.ass', '-preview.mp4', '-suggest-input.json', '-suggest-output.json', '-social-input.json', '-social-output.json']) files.add(asset(TEMP, job.id + suffix));
    }
    let deletedFiles = 0, reclaimedBytes = 0, sharedFiles = 0;
    // Validate every path and file type before removing anything. Never follow a symlink.
    const pending = [];
    for (const filename of files) {
      if (protectedFiles.has(filename)) { sharedFiles++; continue; }
      try {
        const info = await lstat(filename);
        if (!info.isFile() && !info.isSymbolicLink()) throw new Error("A project asset is not a file.");
        pending.push({ filename, bytes: info.isSymbolicLink() ? 0 : info.size });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    try {
      for (const file of pending) {
        await unlink(file.filename);
        deletedFiles++;
        reclaimedBytes += file.bytes;
      }
    } catch {
      throw new Error("Some files could not be deleted. The project entry was kept; check file permissions and retry. Files already deleted cannot be recovered.");
    }
    return { deleted: true, deletedFiles, reclaimedBytes, sharedFiles };
  });
}
