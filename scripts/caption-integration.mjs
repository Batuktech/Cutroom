import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";

const directory = path.resolve("output", `caption-integration-${Date.now()}`);
await mkdir(directory, { recursive: true });
const base = "http://127.0.0.1:4326/api";
const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  env: { ...process.env, CUTROOM_PORT: "4326", CUTROOM_DATA_DIR: directory }, stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
server.stdout.on("data", (data) => { logs += data; });
server.stderr.on("data", (data) => { logs += data; });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(route, method = "GET", body, status = 200) {
  const response = await fetch(base + route, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data;
}
async function wait(job) {
  for (let i = 0; i < 1200; i++) {
    const current = (await request("/jobs")).find(j => j.id === job.id);
    if (["completed", "failed", "cancelled"].includes(current.status)) return current;
    await pause(100);
  }
  throw new Error("Caption render timeout");
}
try {
  for (let i = 0; i < 200; i++) {
    try { if ((await fetch(base + "/health")).ok) break; } catch {}
    if (server.exitCode !== null) throw new Error(logs);
    await pause(100);
  }
  assert.equal((await wait((await request("/demo", "POST", {}, 202)).job)).status, "completed");
  let project = (await request("/projects"))[0];
  const words = ["Make", "this", "moment", "count.", "Then", "tell", "the", "whole", "story."]
    .map((word, i) => ({ word, start: .5 + i*.4, end: .8 + i*.4 }));
  const segments = [{ id: "caption-timing-fixture", start: 0, end: 5, text: words.map(w => w.word).join(" "), words }];
  await request(`/projects/${project.id}/transcript`, "PUT", { segments });
  const exported = [];
  for (const style of ["pop", "punch", "reveal"]) {
    const clip = { ...project.clips[0], title: `${style} timing fixture`, start: .55, end: 4.5, aspect: "9:16", fit: "contain", captionStyle: style, captionMode: style === "pop" ? "word" : "short", captionDuration: 1, captionSize: 76, captions: true };
    const updated = await request(`/projects/${project.id}/clips`, "POST", clip, 201);
    const created = updated.clips.at(-1);
    assert.equal(created.captionDuration, 1); assert.equal(created.captionMode, clip.captionMode);
    const rendered = await wait(await request(`/projects/${project.id}/clips/${created.id}/export`, "POST", { quality: "720" }, 202));
    assert.equal(rendered.status, "completed", rendered.message);
    const file = path.join(directory, "exports", rendered.result.filename);
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8" }));
    assert.equal(probe.streams[0].width, 720); assert.equal(probe.streams[0].height, 1280);
    assert.ok(Math.abs(Number(probe.format.duration)-3.95) < .1);
    const srt = await readFile(file.replace(/\.mp4$/, ".srt"), "utf8");
    const cues = srt.trim().split(/\n\n/);
    assert.equal(cues.length, style === "pop" ? 9 : 5);
    assert.ok(srt.includes("00:00:00,000"));
    for (const at of [.033, .12, .55, .9]) {
      execFileSync("ffmpeg", ["-v", "error", "-ss", String(at), "-i", file, "-frames:v", "1", "-threads", "2", path.join(directory, `${style}-${at}.png`)]);
    }
    exported.push({ style, clip: created, file: rendered.result, srt });
    console.log(`PASS ${style}: saved pacing, real H.264/AAC render, rebased word/phrase SRT, and frame evidence`);
  }
  project = await request(`/projects/${project.id}`);
  const saved = project.clips.at(-1);
  const edited = await request(`/projects/${project.id}/clips/${saved.id}`, "PUT", { ...saved, captionDuration: 2 });
  assert.equal(edited.clips.at(-1).status, "draft");
  assert.equal(edited.clips.at(-1).captionDuration, 2);
  await request(`/projects/${project.id}/clips`, "POST", { ...saved, captionDuration: 3 }, 400);
  await request(`/projects/${project.id}/clips`, "POST", { ...saved, captionMode: "unsafe" }, 400);
  const backup = await request("/backup");
  assert.ok((await request("/backup/restore", "POST", { backup, preview: true })).existing.length);
  console.log("PASS pacing edits mark exports stale, invalid settings are rejected, and backup accepts new styles");
  await writeFile(path.join(directory, "report.json"), JSON.stringify({ project, exported, passed: true, note: "Artificial word times test rendering and do not measure recognition accuracy." }, null, 2));
  console.log(`Evidence: ${directory}`);
} catch (error) {
  await writeFile(path.join(directory, "failure.log"), `${error.stack}\n${logs}`); console.error(error); process.exitCode = 1;
} finally { if (server.exitCode === null) { server.kill("SIGTERM"); await once(server, "exit"); } }
