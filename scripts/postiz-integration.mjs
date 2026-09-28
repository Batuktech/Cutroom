import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { initialChannelSettings } from "../shared/publishing.ts";

await mkdir("output", { recursive: true });
const directory = await mkdtemp(path.resolve("output/postiz-api-"));
const port = 4334, base = `http://127.0.0.1:${port}/api`;
let server, logs = "";
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function start() {
  server = spawn(process.execPath, ["--import", "tsx", "--import", "./scripts/fixtures/postiz.mjs", "server/index.ts"], {
    env: { ...process.env, CUTROOM_DATA_DIR: directory, CUTROOM_PORT: String(port), CUTROOM_MOCK_POSTIZ_TEST: "1", POSTIZ_API_KEY: "", CUTROOM_POSTIZ_API_URL: "https://api.postiz.com/public/v1", OPENAI_API_KEY: "" }, stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", d => { logs += d; }); server.stderr.on("data", d => { logs += d; });
  for (let i = 0; i < 300; i++) { if (server.exitCode !== null) throw new Error("Test server failed to start: " + logs); try { if ((await fetch(base + "/health")).ok) return; } catch {} await pause(100); }
  throw new Error("Test server startup timed out.");
}
async function stop(signal = "SIGTERM") { if (server?.exitCode === null) { server.kill(signal); await once(server, "exit"); } }
async function request(route, method = "GET", body, expected = 200) {
  const r = await fetch(base + route, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await r.json(); assert.equal(r.status, expected, JSON.stringify(data)); return data;
}
async function wait(job) {
  for (let i = 0; i < 1000; i++) { const current = (await request("/jobs")).find(j => j.id === job.id); if (["completed", "failed", "cancelled"].includes(current?.status)) return current; await pause(50); }
  throw new Error("Job timed out.");
}
try {
  await start();
  assert.equal((await request("/postiz")).configured, false);
  await request("/postiz/channels", "GET", undefined, 409);
  await request("/postiz", "PUT", { apiKey: "synthetic-postiz-secret" });
  assert.equal((await request("/postiz/channels")).length, 8);
  const cross = await fetch(base + "/postiz", { method: "PUT", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: "synthetic-key" }) });
  assert.equal(cross.status, 403);
  const imported = await wait((await request("/demo", "POST", {}, 202)).job); assert.equal(imported.status, "completed");
  let project = (await request("/projects"))[0], clip = project.clips.find(c => c.aspect === "9:16");
  const route = `/projects/${project.id}/clips/${clip.id}`;
  await request("/ai/providers/openai", "PUT", { apiKey: "synthetic-ai-secret" });
  let preparation = await request(route + "/publishing");
  const options = { sourceHash: preparation.sourceHash, provider: "openai", model: "synthetic", cloudConsent: true };
  await request(route + "/social-copy", "POST", { ...options, cloudConsent: false }, 400);
  assert.equal((await wait(await request(route + "/social-copy", "POST", options, 202))).status, "completed");
  preparation = await request(route + "/publishing"); assert.equal(preparation.generated, true); assert.ok(preparation.copy.youtube.hashtags.length);
  const payload = (channels, extra = {}) => ({ requestId: randomUUID(), sourceHash: preparation.sourceHash, destination: "https://api.postiz.com/public/v1", mode: "draft", quality: "720", copy: preparation.copy, uploadConsent: true,
    channels: channels.map(id => ({ id, settings: initialChannelSettings(id === "uncertain" ? "tiktok" : ["delayed", "disabled", "interrupted"].includes(id) ? "youtube" : id) })), ...extra });
  await request(route + "/publish", "POST", payload(["youtube"], { uploadConsent: false }), 400);
  await request(route + "/publish", "POST", payload(["youtube"], { destination: "https://wrong.example" }), 400);
  const disabled = await wait(await request(route + "/publish", "POST", payload(["disabled"]), 202)); assert.equal(disabled.status, "failed");
  const p = payload(["youtube", "instagram", "instagram-standalone", "tiktok"]);
  const result = await wait(await request(route + "/publish", "POST", p, 202)); assert.equal(result.status, "completed", result.message);
  assert.equal((await request(route + "/publish", "POST", p)).existing, true);
  await request(route + "/publish", "POST", payload(["youtube"]), 409);
  project = await request(`/projects/${project.id}`);
  assert.equal(project.publications.at(-1).channels.filter(c => c.state === "submitted").length, 4);
  const file = project.exports.find(e => e.id === project.publications.at(-1).exportId); assert.equal(file.aspect, "9:16");
  const mp4 = await fetch(base + `/exports/${file.id}/mp4`); assert.equal(mp4.status, 200); assert.ok((await mp4.arrayBuffer()).byteLength > 1000);
  console.log("PASS: grounded cloud copy, four channel adapters, automatic MP4 rendering/upload, consent and duplicate protection");
  const uncertain = payload(["delayed", "uncertain"], { mode: "now" });
  assert.equal((await wait(await request(route + "/publish", "POST", uncertain, 202))).status, "failed");
  project = await request(`/projects/${project.id}`); assert.deepEqual(project.publications.at(-1).channels.map(c => c.state), ["submitted", "unknown"]);
  await request(route + "/publish", "POST", payload(["uncertain"]), 409);
  await request(`/projects/${project.id}/publications/${uncertain.requestId}/resolve`, "POST", { channelId: "uncertain", outcome: "absent", confirm: true });
  assert.equal((await request(`/projects/${project.id}`)).publications.at(-1).channels[1].state, "failed");
  await request(route, "PUT", { ...clip, cropX: 5 });
  preparation = await request(route + "/publishing");
  const delayed = await request(route + "/publish", "POST", payload(["delayed"], { mode: "schedule", date: new Date(Date.now() + 3600_000).toISOString() }), 202);
  const queued = await request(route + "/publish", "POST", payload(["interrupted"]), 202);
  assert.equal(queued.status, "queued");
  await request(`/jobs/${queued.id}/cancel`, "POST");
  assert.equal((await request(`/projects/${project.id}`)).publications.at(-1).channels[0].state, "cancelled");
  await pause(100); await request(`/jobs/${delayed.id}/cancel`, "POST"); await pause(200);
  assert.equal((await wait(delayed)).status, "cancelled");
  assert.equal((await request(`/projects/${project.id}`)).publications.at(-1).channels[0].state, "cancelled");
  const stale = await request(route + "/publish", "POST", payload(["delayed"]), 202);
  await request(route, "PUT", { ...clip, cropX: 25 });
  assert.equal((await wait(stale)).status, "failed");
  assert.equal((await request(`/projects/${project.id}`)).publications.at(-1).channels[0].state, "failed");
  console.log("PASS: partial success, uncertain receipts block duplicates, explicit reconciliation, running/queued cancellation and concurrent-edit protection");
  const backup = await request("/backup"); await request("/backup/restore", "POST", { backup, preview: true });
  for (const route of ["/postiz", "/jobs", "/backup"]) {
    const text = JSON.stringify(await request(route)); for (const secret of ["synthetic-postiz-secret", "synthetic-ai-secret"]) assert.ok(!text.includes(secret));
  }
  for (const file of ["projects.json", "jobs.json"]) assert.ok(!(await readFile(path.join(directory, file), "utf8")).includes("synthetic-postiz-secret"));
  assert.ok(!logs.includes("synthetic-postiz-secret"));
  preparation = await request(route + "/publishing");
  await request(route + "/publish", "POST", payload(["youtube"], { requestId: p.requestId }), 409);
  const interrupted = payload(["interrupted", "youtube"]);
  await request(route + "/publish", "POST", interrupted, 202);
  let submitting = false;
  for (let i = 0; i < 1000; i++) {
    const record = (await request(`/projects/${project.id}`)).publications.at(-1);
    if (record.channels[0].state === "submitting") { submitting = true; break; }
    await pause(50);
  }
  assert.equal(submitting, true);
  await stop("SIGKILL"); await start(); assert.equal((await request("/postiz")).configured, false);
  assert.deepEqual((await request(`/projects/${project.id}`)).publications.at(-1).channels.map(c => c.state), ["unknown", "failed"]);
  await request("/postiz", "PUT", { apiKey: "synthetic-postiz-secret" });
  await request(route + "/publish", "POST", payload(["interrupted"]), 409);
  console.log("PASS: backup validation, credential redaction, crash recovery and session key removal on restart");
  console.log("Postiz integration passed with synthetic media and blocked real network access.");
} finally { await stop(); }
