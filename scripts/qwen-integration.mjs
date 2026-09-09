import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile, symlink, readdir } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";

const root = process.cwd();
const directory = path.resolve("output", `qwen-api-${Date.now()}`);
await mkdir(path.join(directory, "models"), { recursive: true });
await symlink(path.resolve(".cutroom/models/qwen3-8b"), path.join(directory, "models/qwen3-8b"));
const base = "http://127.0.0.1:4324/api";
let server, logs = "";
const checks = [];
const check = (message) => { checks.push(message); console.log("PASS " + message); };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function start() {
  server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], { cwd: root, env: { ...process.env, CUTROOM_PORT: "4324", CUTROOM_DATA_DIR: directory }, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (chunk) => { logs += chunk; });
  server.stderr.on("data", (chunk) => { logs += chunk; });
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(base + "/health")).ok) return; } catch {}
    if (server.exitCode !== null) throw new Error(logs);
    await delay(100);
  }
  throw new Error("Qwen test server did not start");
}
async function stop() { if (server?.exitCode === null) { server.kill("SIGTERM"); await once(server, "exit"); } }
async function request(route, method = "GET", body, status = 200) {
  const response = await fetch(base + route, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  assert.equal(response.status, status, JSON.stringify(data));
  return data;
}
async function wait(id) {
  for (let i = 0; i < 1200; i++) {
    const job = (await request("/jobs")).find((job) => job.id === id);
    if (["completed", "failed", "cancelled"].includes(job.status)) return job;
    await delay(250);
  }
  throw new Error("Qwen analysis timed out during test");
}
try {
  await start();
  assert.equal((await request("/health")).qwen.ready, true);
  const imported = await request("/demo", "POST", {}, 202);
  assert.equal((await wait(imported.job.id)).status, "completed");
  let project = (await request("/projects"))[0];
  const initialClips = project.clips.length;
  const job = await request(`/projects/${project.id}/suggestions/analyze`, "POST", { maxDuration: 100, interests: ["educational", "interesting"], strictness: "discovery" }, 202);
  const duplicate = await request(`/projects/${project.id}/suggestions/analyze`, "POST", { maxDuration: 100, interests: ["educational", "interesting"], strictness: "discovery" }, 202);
  assert.equal(duplicate.id, job.id);
  const done = await wait(job.id);
  assert.equal(done.status, "completed", done.message);
  project = await request(`/projects/${project.id}`);
  assert.equal(project.clips.length, initialClips);
  assert.equal(project.suggestions.requested, 25);
  assert.equal(project.suggestions.options.maxDuration, 100);
  assert.equal(project.suggestions.complete, true);
  assert.deepEqual(project.suggestions.options.interests, ["educational", "interesting"]);
  assert.ok(project.suggestions.candidates.every(c => c.end - c.start <= 100));
  assert.ok(project.suggestions.candidates.length <= 25);
  assert.ok(project.suggestions.candidates.length, "The reviewed sample should produce a useful candidate");
  assert.deepEqual(await readdir(path.join(directory, "temp")), []);
  check("Real Qwen analysis is queued, deduplicated, reviewed, and saved without auto-creating clips");
  const review = project.suggestions;
  await request(`/projects/${project.id}/suggestions/accept`, "POST", { reviewId: review.id, ids: ["00000000-0000-4000-8000-000000000000"] }, 400);
  const accepted = await request(`/projects/${project.id}/suggestions/accept`, "POST", { reviewId: review.id, ids: [review.candidates[0].id] });
  assert.equal(accepted.added, 1);
  const again = await request(`/projects/${project.id}/suggestions/accept`, "POST", { reviewId: review.id, ids: [review.candidates[0].id] });
  assert.equal(again.added, 0);
  check("Only reviewed candidate IDs can be accepted and repeated acceptance creates no duplicates");
  await stop(); await start();
  project = await request(`/projects/${project.id}`);
  assert.equal(project.suggestions.id, review.id);
  assert.equal(project.clips.length, initialClips + 1);
  const backup = await request("/backup");
  const preview = await request("/backup/restore", "POST", { backup, preview: true });
  assert.ok(preview.existing.length);
  check("Reviewed suggestions and accepted clips survive restart and metadata backup validation");
  const changed = structuredClone(project.transcript);
  changed[0].text += " Edited for the test.";
  await request(`/projects/${project.id}/transcript`, "PUT", { segments: changed });
  await request(`/projects/${project.id}/suggestions/accept`, "POST", { reviewId: review.id, ids: [review.candidates[0].id] }, 409);
  check("Transcript edits invalidate old candidates before acceptance");
  const stale = await request(`/projects/${project.id}/suggestions/analyze`, "POST", { maxDuration: 100, interests: ["educational", "interesting"], strictness: "discovery" }, 202);
  await delay(2500);
  await request(`/projects/${project.id}/transcript`, "PUT", { segments: project.transcript });
  const staleResult = await wait(stale.id);
  assert.equal(staleResult.status, "failed");
  assert.match(staleResult.message, /transcript changed/i);
  assert.equal((await request(`/projects/${project.id}`)).suggestions.id, review.id);
  check("Concurrent transcript edits prevent an in-flight analysis from replacing the saved review");
  const cancel = await request(`/projects/${project.id}/suggestions/analyze`, "POST", { maxDuration: 100, interests: ["educational", "interesting"], strictness: "discovery" }, 202);
  await delay(2000);
  await request(`/jobs/${cancel.id}/cancel`, "POST", {});
  assert.equal((await wait(cancel.id)).status, "cancelled");
  for (let i = 0; i < 100 && (await readdir(path.join(directory, "temp"))).length; i++) await delay(100);
  assert.deepEqual(await readdir(path.join(directory, "temp")), []);
  check("Cancelling Qwen cleans temporary transcript files and preserves existing work");
  await writeFile(path.join(directory, "report.json"), JSON.stringify({ checks, review, finishedAt: new Date().toISOString() }, null, 2));
  console.log(`Evidence: ${directory}`);
} catch (error) {
  await writeFile(path.join(directory, "failure.log"), `${error.stack}\n${logs}`);
  console.error(error); process.exitCode = 1;
} finally { await stop(); }
