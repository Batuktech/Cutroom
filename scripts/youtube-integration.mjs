import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";

// This opt-in check contacts YouTube and keeps all test media outside the main library.
const directory = path.resolve("output", `youtube-integration-${Date.now()}`);
await mkdir(directory, { recursive: true });
const base = "http://127.0.0.1:4323/api";
const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  env: { ...process.env, CUTROOM_PORT: "4323", CUTROOM_DATA_DIR: directory },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
server.stdout.on("data", (data) => { logs += data; });
server.stderr.on("data", (data) => { logs += data; });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(route, method = "GET", body, status = 200) {
  const response = await fetch(base + route, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  assert.equal(response.status, status, JSON.stringify(data));
  return data;
}
async function finished(id) {
  for (let i = 0; i < 480; i++) {
    const job = (await request("/jobs")).find((job) => job.id === id);
    if (["completed", "failed", "cancelled"].includes(job.status)) return job;
    await sleep(250);
  }
  throw new Error("Download timed out during verification.");
}
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + "/health")).ok) break; } catch {}
    if (server.exitCode !== null) throw new Error(logs);
    await sleep(100);
  }
  const url = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
  const job = await request("/import/youtube", "POST", { url }, 202);
  const duplicate = await request("/import/youtube", "POST", { url: "https://youtu.be/jNQXAC9IVRw?t=3" }, 202);
  assert.equal(duplicate.id, job.id);
  const done = await finished(job.id);
  assert.equal(done.status, "completed", done.message);
  assert.ok(done.result.projectId);
  const project = await request(`/projects/${done.result.projectId}`);
  assert.equal(project.name, "Me at the zoo");
  assert.equal(project.hasAudio, true);
  assert.ok(project.duration > 18 && project.duration < 21);
  assert.ok(project.waveform.length && project.thumbnail);
  await access(path.join(directory, "media", project.filename));
  const preview = await fetch(base + `/projects/${project.id}/media`, { headers: { Range: "bytes=0-1023" } });
  assert.equal(preview.status, 206);
  await preview.arrayBuffer();
  assert.deepEqual(await readdir(path.join(directory, "temp")), []);
  console.log("PASS real YouTube download, deduplication, import, waveform, thumbnail, and range playback");

  const sectionJob = await request("/import/youtube", "POST", { url, range: { start: 3, end: 8 }, quality: 720 }, 202);
  assert.equal(sectionJob.queuedCount, 1);
  const sectionDone = await finished(sectionJob.id);
  assert.equal(sectionDone.status, "completed", sectionDone.message);
  const section = await request(`/projects/${sectionDone.result.projectId}`);
  assert.ok(Math.abs(section.duration - 5) < .15, `section duration ${section.duration}`);
  assert.match(section.name, /00:00:03–00:00:08/);
  assert.equal(section.hasAudio, true);
  assert.deepEqual(await readdir(path.join(directory, "temp")), []);
  await request(`/projects/${section.id}/files`, "DELETE", { confirm: true });
  console.log("PASS real time-range download imports a five-second project with audio and original range title");
  const outside = await request("/import/youtube", "POST", { url, range: { start: 100, end: 110 } }, 202);
  assert.equal((await finished(outside.id)).status, "failed");
  assert.deepEqual(await readdir(path.join(directory, "temp")), []);
  console.log("PASS range beyond source duration fails without creating a project");

  const batch = await request("/import/youtube", "POST", { url, range: { start: 0, end: 1800 }, partMinutes: 15 }, 202);
  const repeated = await request("/import/youtube", "POST", { url, range: { start: 0, end: 1800 }, partMinutes: 15 }, 202);
  assert.equal(batch.queuedCount, 2);
  assert.equal(repeated.id, batch.id);
  const parts = (await request("/jobs")).filter(j => ["queued", "running"].includes(j.status));
  assert.equal(parts.length, 2);
  for (const part of parts) await request(`/jobs/${part.id}/cancel`, "POST", {});
  for (let i = 0; i < 100 && (await readdir(path.join(directory, "temp"))).length; i++) await sleep(100);
  assert.deepEqual(await readdir(path.join(directory, "temp")), []);
  assert.equal((await request("/projects")).length, 1);
  console.log("PASS batch parts have independent jobs, duplicate batches reuse them, and cancelling parts preserves completed projects");

  const cancelled = await request("/import/youtube", "POST", { url, range: { start: 2, end: 10 } }, 202);
  await sleep(300);
  await request(`/jobs/${cancelled.id}/cancel`, "POST", {});
  assert.equal((await finished(cancelled.id)).status, "cancelled");
  for (let i = 0; i < 100 && (await readdir(path.join(directory, "temp"))).length; i++) await sleep(100);
  assert.deepEqual(await readdir(path.join(directory, "temp")), []);
  assert.equal((await request("/projects")).length, 1);
  console.log("PASS download cancellation removes partial files without creating a project");

  const invalid = await request("/import/youtube", "POST", { url: "https://www.youtube.com/watch?v=BaW_jenozKc" }, 202);
  const failed = await finished(invalid.id);
  assert.equal(failed.status, "failed");
  assert.ok(failed.message);
  assert.deepEqual(await readdir(path.join(directory, "temp")), []);
  assert.equal((await request("/projects")).length, 1);
  console.log("PASS unavailable video fails visibly and leaves no partial project/files");

  const result = await request(`/projects/${project.id}/files`, "DELETE", { confirm: true });
  assert.ok(result.reclaimedBytes >= project.size);
  assert.deepEqual(await readdir(path.join(directory, "media")), []);
  assert.equal((await request("/projects")).length, 0);
  console.log("PASS downloaded project deletion removes its complete source and thumbnail");
  await writeFile(path.join(directory, "report.json"), JSON.stringify({ passed: true, project, download: done, section: sectionDone, outside: outside.id, cancellation: cancelled.id, unavailable: failed.message, deletion: result }, null, 2));
  console.log(`Evidence: ${directory}`);
} catch (error) {
  console.error(error);
  await writeFile(path.join(directory, "failure.log"), `${error.stack}\n${logs}`);
  process.exitCode = 1;
} finally {
  if (server.exitCode === null) { server.kill("SIGTERM"); await once(server, "exit"); }
  await readFile(path.join(directory, "jobs.json"));
}
