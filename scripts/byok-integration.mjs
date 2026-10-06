import { cloudProviders, providerDetails } from "../shared/ai-providers.ts";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";

await mkdir("output", { recursive: true });
const directory = await mkdtemp(path.resolve("output/byok-api-"));
const port = 4331, base = `http://127.0.0.1:${port}/api`;
let server, logs = "", checks = 0;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function check(name) { checks++; console.log(`PASS ${name}`); }
async function start() {
  server = spawn(process.execPath, ["--import", "tsx", "--import", "./scripts/fixtures/cloud-provider.mjs", "server/index.ts"], {
    env: { ...process.env, CUTROOM_DATA_DIR: directory, CUTROOM_PORT: String(port), CUTROOM_MOCK_AI_TEST: "1", ...Object.fromEntries(cloudProviders.map(p => [providerDetails[p].envKey, ""])), CUTROOM_CUSTOM_AI_BASE_URL: "https://custom-provider.example/v1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", data => { logs += data; }); server.stderr.on("data", data => { logs += data; });
  for (let i = 0; i < 200; i++) {
    if (server.exitCode !== null) throw new Error("Isolated server stopped unexpectedly.");
    try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
    await pause(100);
  }
  throw new Error("Isolated server did not start.");
}
async function stop() { if (server?.exitCode === null) { server.kill("SIGTERM"); await once(server, "exit"); } }
async function request(route, method = "GET", body, expected = 200) {
  const response = await fetch(base + route, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json(); assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(data)}`); return data;
}
async function wait(job) {
  for (let i = 0; i < 300; i++) {
    const current = (await request("/jobs")).find(j => j.id === job.id);
    if (["completed", "failed", "cancelled"].includes(current?.status)) return current;
    await pause(50);
  }
  throw new Error("Test job did not finish.");
}
try {
  await start();
  const imported = await wait((await request("/demo", "POST", {}, 202)).job);
  assert.equal(imported.status, "completed");
  const project = (await request("/projects"))[0];
  const route = `/projects/${project.id}/suggestions/analyze`;
  const options = { provider: "openai", model: "test-model", maxDuration: 100, maxRequests: 5, cloudConsent: true };
  await request(route, "POST", options, 409);
  const secret = "sk-synthetic-secret";
  for (const provider of cloudProviders) {
    await request(`/ai/providers/${provider}`, "PUT", { apiKey: secret });
    const result = await wait(await request(route, "POST", { ...options, provider, ...(provider === "custom" ? { cloudDestination: "https://custom-provider.example/v1/chat/completions" } : {}) }, 202));
    assert.equal(result.status, "completed");
    const review = (await request(`/projects/${project.id}`)).suggestions;
    assert.equal(review.usage.provider, provider); assert.ok(review.candidates.length); assert.equal(review.complete, true);
  }
  check("All 17 provider options complete the real API → queue → persisted review flow without Qwen or cloud traffic");
  const scored = await wait(await request(route, "POST", { ...options, strictness: "reviewed" }, 202));
  assert.equal(scored.status, "completed");
  const cloudReview = (await request(`/projects/${project.id}`)).suggestions;
  assert.equal(cloudReview.candidates[0].assessment.source, "transcript");
  assert.equal(cloudReview.candidates[0].assessment.version, 1);
  assert.ok(cloudReview.candidates[0].assessment.evidence.some(e => e.role === "peak"));
  assert.ok(cloudReview.candidates[0].assessment.total >= 60);
  check("Reviewed copy preserves scored source evidence through the API and project store");
  const selected = { reviewId: cloudReview.id, ids: [cloudReview.candidates[0].id] };
  const accepted = await request(`/projects/${project.id}/suggestions/accept`, "POST", selected);
  assert.equal(accepted.added, 1);
  assert.equal(accepted.project.clips.at(-1).captionStyle, "highlight");
  assert.equal(accepted.project.clips.at(-1).aspect, "16:9");
  assert.equal((await request(`/projects/${project.id}/suggestions/accept`, "POST", selected)).added, 0);
  const backup = await request("/backup");
  assert.ok(JSON.stringify(backup).includes('"assessment"'));
  await request("/backup/restore", "POST", { backup, preview: true });
  check("Cloud candidates accept idempotently with existing defaults and backup validation");
  await request(route, "POST", { ...options, cloudConsent: false }, 400);
  await request(route, "POST", { ...options, provider: "unknown" }, 400);
  await request(route, "POST", { ...options, maxRequests: 101 }, 400);
  await request(route, "POST", { ...options, model: "https://invalid?key=secret" }, 400);
  await request(route, "POST", { ...options, provider: "custom" }, 400);
  await request(route, "POST", { ...options, provider: "custom", cloudDestination: "https://wrong.example/v1/chat/completions" }, 400);
  await request(route, "POST", { ...options, outputFormat: "invalid" }, 400);
  const crossOrigin = await fetch(base + "/ai/providers/openai", { method: "PUT", headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: secret }) });
  assert.equal(crossOrigin.status, 403);
  check("Consent, provider, budget, model and Origin validation");
  const malformed = await fetch(base + "/ai/providers/openai", { method: "PUT", headers: { "Content-Type": "application/json" }, body: `{"apiKey":"${secret}` });
  assert.equal(malformed.status, 400); assert.ok(!(await malformed.text()).includes(secret));
  const failure = await wait(await request(route, "POST", { ...options, model: "test-failure" }, 202));
  assert.equal(failure.status, "failed"); assert.ok(!failure.message.includes(secret));
  const originalReview = (await request(`/projects/${project.id}`)).suggestions;
  const cancelled = await request(route, "POST", { ...options, model: "test-delayed" }, 202);
  await pause(100); await request(`/jobs/${cancelled.id}/cancel`, "POST"); await pause(950);
  assert.equal((await wait(cancelled)).status, "cancelled");
  assert.equal((await request(`/projects/${project.id}`)).suggestions.id, originalReview.id);
  check("Provider errors redact keys; cancelled cloud requests cannot replace a saved review");
  const changed = await request(route, "POST", { ...options, model: "test-delayed" }, 202);
  const segments = structuredClone(project.transcript); segments[0].text += " Edited during review.";
  await request(`/projects/${project.id}/transcript`, "PUT", { segments });
  assert.equal((await wait(changed)).status, "failed");
  assert.equal((await request(`/projects/${project.id}`)).transcript[0].text, segments[0].text);
  check("Cloud completion preserves transcript edits made during analysis");
  for (const route of ["/ai/providers", "/backup", "/jobs"]) assert.ok(!JSON.stringify(await request(route)).includes(secret));
  for (const file of ["jobs.json", "projects.json"]) assert.ok(!(await readFile(path.join(directory, file), "utf8")).includes(secret));
  assert.ok(!logs.includes(secret));
  check("Credentials absent from status responses, metadata backup, disk metadata, job history, and logs");
  await request("/ai/providers/openai", "DELETE");
  await request(route, "POST", options, 409);
  await stop(); await start();
  assert.ok((await request("/ai/providers")).every(s => !s.configured));
  check("Forget and restart clear session keys");
  console.log(`${checks} BYOK integration checks passed. Synthetic fixtures only; no billed requests.`);
} finally { await stop(); }
