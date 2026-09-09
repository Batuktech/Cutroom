import type { ExportFile } from "./types.js";

export function latestExports<T extends ExportFile>(files: T[]): T[] {
  const seen = new Set<string>();
  return files
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((file) => {
      if (seen.has(file.clipId)) return false;
      seen.add(file.clipId);
      return true;
    });
}
