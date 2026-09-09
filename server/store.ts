import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import type { Project } from "../shared/types.js";

export const ROOT = path.resolve(process.env.CUTROOM_DATA_DIR || ".cutroom");
export const MEDIA = path.join(ROOT, "media");
export const MODELS = path.join(ROOT, "models");
export const EXPORTS = path.join(ROOT, "exports");
export const TEMP = path.join(ROOT, "temp");
export const TRANSCRIPTS = path.join(ROOT, "transcript-history");
const FILE = path.join(ROOT, "projects.json");
let projects: Project[] = [];
let writes = Promise.resolve();
export const deletingProjects = new Set<string>();

export async function initialize() {
  await Promise.all(
    [ROOT, MEDIA, MODELS, EXPORTS, TEMP, TRANSCRIPTS].map((p) =>
      mkdir(p, { recursive: true }),
    ),
  );
  try {
    projects = JSON.parse(await readFile(FILE, "utf8"));
    if (!Array.isArray(projects))
      throw new Error("Project database is invalid.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new Error(
        "Could not read the project database. The original file has been preserved.",
        { cause: error },
      );
  }
}
export function listProjects() {
  return projects.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function getProject(id: string) {
  const project = projects.find((p) => p.id === id);
  if (!project)
    throw Object.assign(new Error("Project not found."), { status: 404 });
  return project;
}
function transaction(change: (draft: Project[]) => Project[] | Promise<Project[]>) {
  writes = writes
    .catch(() => {})
    .then(async () => {
      const draft = await change(structuredClone(projects));
      await writeFile(FILE + ".tmp", JSON.stringify(draft, null, 2));
      await rename(FILE + ".tmp", FILE);
      projects = draft;
    });
  return writes;
}
export async function addProject(project: Project) {
  await transaction((draft) => [...draft, project]);
  return getProject(project.id);
}
export async function updateProject(id: string, updater: (p: Project) => void) {
  getProject(id);
  await transaction((draft) => {
    const project = draft.find((p) => p.id === id);
    if (!project)
      throw Object.assign(new Error("Project not found."), { status: 404 });
    updater(project);
    project.updatedAt = new Date().toISOString();
    return draft;
  });
  return getProject(id);
}
export async function removeProject(id: string) {
  getProject(id);
  await transaction((draft) => draft.filter((p) => p.id !== id));
}

export async function deleteProjectFiles<T>(
  id: string,
  clean: (project: Project, others: Project[]) => Promise<T>,
): Promise<T> {
  getProject(id);
  if (deletingProjects.has(id))
    throw Object.assign(new Error("This project is already being deleted."), { status: 409 });
  deletingProjects.add(id);
  let result: T;
  try {
    await transaction(async (draft) => {
      const project = draft.find((p) => p.id === id);
      if (!project) throw Object.assign(new Error("Project not found."), { status: 404 });
      const others = draft.filter((p) => p.id !== id);
      result = await clean(project, others);
      return others;
    });
    return result!;
  } finally {
    deletingProjects.delete(id);
  }
}

export async function restoreProjects(incoming: Project[]) {
  let restored = 0;
  await transaction((draft) => {
    const ids = new Set(draft.map((p) => p.id));
    const missing = incoming.filter((p) => !ids.has(p.id));
    restored = missing.length;
    return [...draft, ...missing];
  });
  return restored;
}
