import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile, symlink, readdir } from "node:fs/promises";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import path from "node:path";

// An opt-in real-transcript check; all writes go to isolated data, never the source project.
const sourceId = process.argv[2];
if (!sourceId) throw new Error("Pass an existing local project ID to test a four-minute transcript excerpt.");
const source = await fetch(`http://127.0.0.1:4318/api/projects/${encodeURIComponent(sourceId)}`).then(r => { if (!r.ok) throw new Error("Source project unavailable"); return r.json(); });
const directory = path.resolve("output", `qwen-partial-${Date.now()}`);
await mkdir(path.join(directory, "models"), { recursive: true });
await symlink(path.resolve(".cutroom/models/qwen3-8b"), path.join(directory, "models/qwen3-8b"));
const project = { ...source, id: randomUUID(), name: "Four-minute transcript excerpt", transcript: source.transcript.filter(s => s.end <= 240), suggestions: undefined, clips: [], exports: [], thumbnail: false };
assert.ok(project.transcript.length);
await writeFile(path.join(directory, "projects.json"), JSON.stringify([project]));
const base = "http://127.0.0.1:4328/api";
let server, logs = "";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function start() {
  server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], { env: { ...process.env, CUTROOM_PORT: "4328", CUTROOM_DATA_DIR: directory }, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", c => { logs += c; }); server.stderr.on("data", c => { logs += c; });
  for (let i=0; i<150; i++) { try { if ((await fetch(base+"/health")).ok) return; } catch {} await delay(100); }
  throw new Error("Test server startup timed out");
}
async function stop() { if (server?.exitCode === null) { server.kill("SIGTERM"); await once(server, "exit"); } }
async function request(route, method="GET", body, status=200) {
  const response = await fetch(base+route, { method, headers:{"Content-Type":"application/json"}, body:body===undefined?undefined:JSON.stringify(body) });
  const data = await response.json(); assert.equal(response.status,status,JSON.stringify(data)); return data;
}
try {
  await start();
  const begin = Date.now();
  const job = await request(`/projects/${project.id}/suggestions/analyze`, "POST", { maxDuration:100, interests:["funny","reactions","story","debate"], strictness:"discovery", count:20 }, 202);
  let first, second;
  for(let i=0;i<1800;i++) {
    const current = await request(`/projects/${project.id}`);
    const progress = (await request("/jobs")).find(j=>j.id===job.id);
    if(current.suggestions?.candidates.length) {
      if(!first) {
        first={ elapsed:(Date.now()-begin)/1000, review:current.suggestions };
        console.log(`PASS live findings available after ${first.elapsed.toFixed(1)}s: ${first.review.candidates.length} candidates`);
      }
      if(current.suggestions.scanned >= 2 && !current.suggestions.complete && progress.result?.scanned >= 2) { second=current.suggestions; break; }
    }
    if(["failed","cancelled","completed"].includes(progress.status)) throw new Error(`Expected partial findings before completion: ${JSON.stringify(progress)}`);
    await delay(250);
  }
  assert.ok(first && second, "No partial findings were saved in time");
  assert.ok(second.scanned < second.sections);
  for(const a of first.review.candidates) {
    const b=second.candidates.find(b=>b.start===a.start&&b.end===a.end);
    if(b) assert.equal(b.id,a.id);
  }
  assert.ok(second.candidates.every(c=>c.end-c.start<=100&&c.end-c.start>=5));
  await request(`/jobs/${job.id}/cancel`,"POST",{});
  for(let i=0;i<100&&(await readdir(path.join(directory,"temp"))).length;i++) await delay(100);
  assert.deepEqual(await readdir(path.join(directory,"temp")),[]);
  let saved=(await request(`/projects/${project.id}`)).suggestions;
  assert.equal(saved.complete,false); assert.equal(saved.id,second.id);
  assert.equal((await request("/jobs")).find(j=>j.id===job.id).status,"cancelled");
  const accepted=await request(`/projects/${project.id}/suggestions/accept`,"POST",{reviewId:saved.id,ids:[saved.candidates[0].id]});
  assert.equal(accepted.added,1);
  await stop(); await start();
  saved=(await request(`/projects/${project.id}`)).suggestions;
  assert.equal(saved.id,second.id); assert.equal(saved.complete,false);
  assert.equal((await request(`/projects/${project.id}`)).clips.length,1);
  console.log("PASS cancellation retains partial findings, stable candidate IDs, valid durations, accepted clip, restart persistence, and clean temp files");
  await writeFile(path.join(directory,"report.json"),JSON.stringify({passed:true,sourceId,excerptSegments:project.transcript.length,first,review:saved,elapsed:(Date.now()-begin)/1000},null,2));
  console.log(`Evidence: ${directory}`);
} catch(error) { console.error(error); await writeFile(path.join(directory,"failure.log"),`${error.stack}\n${logs}`); process.exitCode=1; }
finally { await stop(); }
