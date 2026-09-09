import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, symlink, access, readdir, copyFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { once } from "node:events";
import { createServer, get } from "node:http";

const root = process.cwd();
const directory = path.join(root, "output", `integration-${Date.now()}`);
const port = 4320;
const base = `http://127.0.0.1:${port}/api`;
await mkdir(path.join(directory, "models"), { recursive: true });
await symlink(
  path.join(root, ".cutroom/models/tiny"),
  path.join(directory, "models/tiny"),
);
let server,
  logs = "";
const checks = [];
const check = (name) => {
  checks.push(name);
  console.log(`PASS ${name}`);
};
async function start() {
  server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: root,
    env: {
      ...process.env,
      CUTROOM_PORT: String(port),
      CUTROOM_DATA_DIR: directory,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (data) => {
    logs += data;
  });
  server.stderr.on("data", (data) => {
    logs += data;
  });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(logs);
    try {
      if ((await fetch(base + "/health")).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Integration server did not start.");
}
async function stop() {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await once(server, "exit");
  }
}
async function request(route, method = "GET", body, expected = 200) {
  const response = await fetch(base + route, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  assert.equal(
    response.status,
    expected,
    `${method} ${route}: ${JSON.stringify(data)}`,
  );
  return data;
}
async function wait(job) {
  for (let i = 0; i < 600; i++) {
    const current = (await request("/jobs")).find((j) => j.id === job.id);
    if (
      current &&
      ["completed", "failed", "cancelled"].includes(current.status)
    )
      return current;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Timed out waiting for " + job.kind);
}
try {
  await start();
  const health = await request("/health");
  assert.equal(health.ffmpeg, true);
  assert.equal(health.ai, true);
  check("FFmpeg and local AI readiness");
  assert.equal(health.youtube, true);
  for (const url of ["http://127.0.0.1:4318/api/backup", "https://youtube.com.evil.example/watch?v=jNQXAC9IVRw", "https://youtube.com/playlist?list=123"])
    await request("/import/youtube", "POST", { url }, 400);
  check("YouTube downloader readiness and rejection of unsafe/non-video URLs");
  const forbiddenOrigin = await fetch(base + "/projects", {
    headers: { Origin: "https://untrusted.example" },
  });
  assert.equal(forbiddenOrigin.status, 403);
  const forbiddenHost = await new Promise((resolve, reject) => {
    const req = get(
      base + "/projects",
      { headers: { Host: "untrusted.example" } },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    req.on("error", reject);
  });
  assert.equal(forbiddenHost, 403);
  check("Cross-origin and DNS-rebinding host rejection");
  let form = new FormData();
  form.append("video", new Blob(["not a video"]), "notes.txt");
  assert.equal(
    (await fetch(base + "/projects", { method: "POST", body: form })).status,
    400,
  );
  check("Unsupported upload rejected");
  form = new FormData();
  form.append("video", new Blob(["not a video"]), "broken.mp4");
  const broken = await fetch(base + "/projects", {
    method: "POST",
    body: form,
  }).then((r) => r.json());
  assert.equal((await wait(broken)).status, "failed");
  check("Corrupt video fails visibly without creating a project");
  let networkReads = 0;
  const networkTrap = createServer((_req, res) => {
    networkReads++;
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) =>
    networkTrap.listen(4321, "127.0.0.1", resolve),
  );
  try {
    const playlist = new FormData();
    playlist.append(
      "video",
      new Blob([
        "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:4,\nhttp://127.0.0.1:4321/private.ts\n#EXT-X-ENDLIST\n",
      ]),
      "disguised-playlist.mp4",
    );
    const playlistJob = await fetch(base + "/projects", {
      method: "POST",
      body: playlist,
    }).then((response) => response.json());
    assert.equal((await wait(playlistJob)).status, "failed");
    assert.equal(networkReads, 0);
  } finally {
    await new Promise((resolve) => networkTrap.close(resolve));
  }
  check(
    "Disguised network playlists cannot make media tools request remote inputs",
  );
  const demo = await request("/demo", "POST", {}, 202);
  const imported = await wait(demo.job);
  assert.equal(imported.status, "completed", imported.message);
  let p = (await request("/projects"))[0];
  assert.ok(p.transcript.length);
  assert.equal(p.demo, true);
  check("Sample video imports with editable captions");
  const modelHealth = await request("/health");
  assert.equal(modelHealth.models.find((model) => model.id === "large-v3")?.installed, false);
  await request(`/projects/${p.id}/transcribe`, "POST", {model: "large-v3", language: "en"}, 409);
  check("Large v3 is available as a model choice and requires installed local weights");
  assert.equal(health.qwen.ready, false);
  await request(`/projects/${p.id}/suggestions/analyze`, "POST", { target: 35, focus: "interesting" }, 409);
  check("AI suggestions explain missing local Qwen weights without affecting fast rules");
  const media = await fetch(base + `/projects/${p.id}/media`, {
    headers: { Range: "bytes=0-99" },
  });
  assert.equal(media.status, 206);
  assert.equal((await media.arrayBuffer()).byteLength, 100);
  assert.equal((await fetch(base + `/projects/${p.id}/thumbnail`)).status, 200);
  check("Media range seeking and hidden-folder thumbnail serving");
  const clip = {
    ...p.clips[0],
    title: "Integration portrait",
    start: 0,
    end: 2,
    aspect: "9:16",
    captionStyle: "highlight",
  };
  await request(
    `/projects/${p.id}/clips`,
    "POST",
    { ...clip, end: p.duration + 1 },
    400,
  );
  await request(
    `/projects/${p.id}/clips`,
    "POST",
    { ...clip, accent: "red';movie=/etc/passwd" },
    400,
  );
  await request(
    `/projects/${p.id}/transcript`,
    "PUT",
    { segments: [{ id: "bad", start: 0, end: 1000, text: "outside source" }] },
    400,
  );
  check("Timing, subtitle bounds, and filter inputs validated");
  const suggested = p.clips[0];
  assert.ok(suggested.reason);
  const renamed = await request(`/projects/${p.id}/clips/${suggested.id}`, "PUT", {
    ...suggested,
    title: "A clearer title",
  });
  assert.equal(renamed.clips.find((c) => c.id === suggested.id).reason, suggested.reason);
  const retrimmed = await request(`/projects/${p.id}/clips/${suggested.id}`, "PUT", {
    ...suggested,
    end: suggested.end - 0.1,
  });
  assert.equal(retrimmed.clips.find((c) => c.id === suggested.id).reason, undefined);
  check("Suggested-cut explanations survive renaming and clear after timing changes");
  const initialCount = p.clips.length;
  await Promise.all(
    Array.from({ length: 3 }, (_, i) =>
      request(
        `/projects/${p.id}/clips`,
        "POST",
        { ...clip, title: `Concurrent ${i}` },
        201,
      ),
    ),
  );
  p = await request(`/projects/${p.id}`);
  assert.equal(p.clips.length, initialCount + 3);
  check("Concurrent project edits persist without lost updates");
  const a = p.clips.at(-1),
    b = p.clips.at(-2);
  const first = await request(
    `/projects/${p.id}/clips/${a.id}/export`,
    "POST",
    { quality: "720" },
    202,
  );
  const duplicate = await request(
    `/projects/${p.id}/clips/${a.id}/export`,
    "POST",
    { quality: "720" },
    202,
  );
  assert.equal(first.id, duplicate.id);
  const second = await request(
    `/projects/${p.id}/clips/${b.id}/export`,
    "POST",
    { quality: "720" },
    202,
  );
  assert.notEqual(second.id, first.id);
  await request(`/jobs/${second.id}/cancel`, "POST", {});
  assert.equal((await wait(second)).status, "cancelled");
  check("Per-clip render deduplication and queued-job cancellation");
  await request(`/projects/${p.id}/clips/${a.id}`, "PUT", {
    ...a,
    title: "A newer edit while rendering",
  });
  const rendered = await wait(first);
  assert.equal(rendered.status, "completed", rendered.message);
  const file = rendered.result;
  assert.equal(file.title, a.title);
  assert.equal(
    (await request(`/projects/${p.id}`)).clips.find((clip) => clip.id === a.id)
      .status,
    "draft",
  );
  check(
    "Rendering preserves its queued edit and does not mark newer edits exported",
  );
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        path.join(directory, "exports", file.filename),
      ],
      { encoding: "utf8" },
    ),
  );
  assert.equal(probe.streams[0].width, 720);
  assert.equal(probe.streams[0].height, 1280);
  assert.equal(probe.streams[0].codec_name, "h264");
  assert.ok(probe.streams.some((s) => s.codec_name === "aac"));
  assert.ok(Math.abs(Number(probe.format.duration) - 2) < 0.1);
  const subtitles = await fetch(base + `/exports/${file.id}/srt`).then((r) =>
    r.text(),
  );
  assert.ok(subtitles.includes("00:00:00,000"));
  assert.ok(!subtitles.includes("00:00:03,"));
  check("Actual 720×1280 H.264/AAC export and rebased SRT");
  const zip = await fetch(base + `/projects/${p.id}/package`);
  assert.equal(zip.status, 200);
  const zipData = Buffer.from(await zip.arrayBuffer());
  assert.equal(zipData.subarray(0, 2).toString(), "PK");
  assert.ok(zipData.includes(Buffer.from("delivery-notes.json")));
  await writeFile(path.join(directory, "delivery.zip"), zipData);
  check("Client delivery ZIP streams videos, subtitles, and notes");
  const jobCount = (await request("/jobs")).length;
  await request(
    "/exports/batch",
    "POST",
    {
      clips: [
        { projectId: p.id, clipId: a.id },
        { projectId: p.id, clipId: "00000000-0000-4000-8000-000000000000" },
      ],
      quality: "720",
    },
    400,
  );
  assert.equal((await request("/jobs")).length, jobCount);
  check("Batch export validates every selection before starting any render");
  const batch = await request(
    "/exports/batch",
    "POST",
    {
      clips: [
        { projectId: p.id, clipId: a.id },
        { projectId: p.id, clipId: b.id },
        { projectId: p.id, clipId: a.id },
      ],
      quality: "720",
    },
    202,
  );
  assert.equal(batch.length, 2);
  for (const job of batch) assert.equal((await wait(job)).status, "completed");
  check(
    "Batch export deduplicates selected clips and renders each saved version",
  );
  for (const [versions, expected] of [
    ["latest", 2],
    ["all", 3],
  ]) {
    const packageFile = path.join(directory, `delivery-${versions}.zip`);
    await writeFile(
      packageFile,
      Buffer.from(
        await fetch(
          base + `/projects/${p.id}/package?versions=${versions}`,
        ).then((response) => response.arrayBuffer()),
      ),
    );
    const contents = JSON.parse(
      execFileSync(
        "python3",
        [
          "-c",
          "import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({'files':z.namelist(),'notes':json.loads(z.read('delivery-notes.json'))}))",
          packageFile,
        ],
        { encoding: "utf8" },
      ),
    );
    assert.equal(
      contents.files.filter((name) => name.endsWith(".mp4")).length,
      expected,
    );
    assert.equal(
      contents.files.filter((name) => name.endsWith(".srt")).length,
      expected,
    );
    assert.equal(contents.notes.exports.length, expected);
  }
  check(
    "Delivery ZIP defaults to latest per clip and supports complete version history",
  );
  const frame = await request(
    `/projects/${p.id}/clips/${a.id}/reframe`,
    "POST",
    {},
    202,
  );
  const framed = await wait(frame);
  assert.equal(framed.status, "completed", framed.message);
  assert.equal(framed.result.found, false);
  check("No-face footage returns a usable manual-framing fallback");
  const speech = await request(
    `/projects/${p.id}/transcribe`,
    "POST",
    { model: "tiny", language: "en" },
    202,
  );
  const transcribed = await wait(speech);
  assert.equal(transcribed.status, "completed", transcribed.message);
  assert.ok(transcribed.result.segments > 0);
  p = await request(`/projects/${p.id}`);
  assert.ok(p.transcript.some((s) => s.words?.length > 0));
  const beforeSpeech = JSON.parse(await readFile(
    path.join(directory, "transcript-history", `${p.id}-${speech.id}-before.json`), "utf8",
  ));
  const completedSpeech = JSON.parse(await readFile(
    path.join(directory, "transcript-history", `${p.id}-${speech.id}-result.json`), "utf8",
  ));
  assert.ok(beforeSpeech.segments.length > 0);
  assert.ok((await readFile(
    path.join(directory, "transcript-history", `${p.id}-${speech.id}-before.srt`), "utf8",
  )).includes("-->"));
  assert.deepEqual(completedSpeech.segments, p.transcript);
  check("Whisper produces measured word timestamps locally");
  check("Transcription keeps previous captions and the completed model result on disk");
  const speechWithEdit = await request(
    `/projects/${p.id}/transcribe`,
    "POST",
    { model: "tiny", language: "en" },
    202,
  );
  const reviewed = structuredClone(p.transcript);
  reviewed[0].text = "A caption reviewed while transcription runs.";
  await request(`/projects/${p.id}/transcript`, "PUT", { segments: reviewed });
  const conflict = await wait(speechWithEdit);
  assert.equal(conflict.status, "failed");
  assert.ok(conflict.message.includes("Your edits were kept"));
  const preservedResult = JSON.parse(await readFile(
    path.join(directory, "transcript-history", `${p.id}-${speechWithEdit.id}-result.json`), "utf8",
  ));
  assert.ok(preservedResult.segments.length > 0);
  assert.equal(
    (await request(`/projects/${p.id}`)).transcript[0].text,
    reviewed[0].text,
  );
  await request(`/projects/${p.id}/transcript`, "PUT", {
    segments: p.transcript,
  });
  check("New caption edits survive a transcription that started earlier");
  await stop();
  await start();
  const restored = await request(`/projects/${p.id}`);
  assert.equal(restored.clips.length, initialCount + 3);
  assert.ok(
    (await request("/jobs")).some(
      (j) => j.id === speech.id && j.status === "completed",
    ),
  );
  check("Projects and completed processing history survive server restart");
  const backup = await request("/backup");
  const unsafeBackup = structuredClone(backup);
  unsafeBackup.projects[0].filename = "../../private.mp4";
  await request(
    "/backup/restore",
    "POST",
    { backup: unsafeBackup, preview: false },
    400,
  );
  check("Metadata recovery rejects paths outside local media storage");
  await request(`/projects/${p.id}`, "DELETE");
  assert.equal((await request("/projects")).length, 0);
  await access(path.join(directory, "media", p.filename));
  check("Library removal preserves source media on disk");
  const recoveryPreview = await request("/backup/restore", "POST", {
    backup,
    preview: true,
  });
  assert.equal(recoveryPreview.ready.length, 1);
  assert.equal((await request("/projects")).length, 0);
  const missingBackup = structuredClone(backup);
  missingBackup.projects[0].filename =
    "00000000-0000-4000-8000-000000000000.mp4";
  const missing = await request("/backup/restore", "POST", {
    backup: missingBackup,
    preview: true,
  });
  assert.equal(missing.ready.length, 0);
  assert.equal(missing.missingMedia.length, 1);
  check(
    "Recovery preview detects missing footage without changing the library",
  );
  const recovery = await request("/backup/restore", "POST", {
    backup,
    preview: false,
  });
  assert.equal(recovery.restored, 1);
  const recovered = await request(`/projects/${p.id}`);
  assert.deepEqual(recovered.clips, p.clips);
  assert.deepEqual(recovered.transcript, p.transcript);
  backup.projects[0].name = "Should never overwrite existing work";
  const repeated = await request("/backup/restore", "POST", {
    backup,
    preview: false,
  });
  assert.equal(repeated.restored, 0);
  assert.equal((await request(`/projects/${p.id}`)).name, p.name);
  check("Metadata restore recovers edits and skips existing projects safely");
  const silentFile = path.join(directory, "silent.mp4");
  const rotatedFile = path.join(directory, "rotated.mp4");
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=320x180:rate=24:duration=4",
    "-c:v",
    "libx264",
    "-threads",
    "2",
    "-pix_fmt",
    "yuv420p",
    "-y",
    silentFile,
  ]);
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-display_rotation",
    "90",
    "-i",
    silentFile,
    "-c",
    "copy",
    "-y",
    rotatedFile,
  ]);
  const silentForm = new FormData();
  silentForm.append(
    "video",
    new Blob([await readFile(rotatedFile)]),
    "phone-rotation.mp4",
  );
  const silentJob = await fetch(base + "/projects", {
    method: "POST",
    body: silentForm,
  }).then((response) => response.json());
  const silentImport = await wait(silentJob);
  assert.equal(silentImport.status, "completed", silentImport.message);
  const silent = await request(`/projects/${silentImport.result.projectId}`);
  assert.equal(silent.width, 180);
  assert.equal(silent.height, 320);
  assert.equal(silent.hasAudio, false);
  assert.deepEqual(silent.waveform, []);
  await request(
    `/projects/${silent.id}/transcribe`,
    "POST",
    { model: "tiny", language: "en" },
    400,
  );
  check(
    "Rotated phone footage imports with correct dimensions and honest no-audio state",
  );
  const silentEdited = await request(
    `/projects/${silent.id}/clips`,
    "POST",
    { ...clip, title: "Silent portrait", captions: false, fit: "contain" },
    201,
  );
  const silentExport = await wait(
    await request(
      `/projects/${silent.id}/clips/${silentEdited.clips[0].id}/export`,
      "POST",
      { quality: "720" },
      202,
    ),
  );
  assert.equal(silentExport.status, "completed", silentExport.message);
  const silentProbe = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_streams",
        "-of",
        "json",
        path.join(directory, "exports", silentExport.result.filename),
      ],
      { encoding: "utf8" },
    ),
  );
  assert.equal(silentProbe.streams[0].width, 720);
  assert.equal(silentProbe.streams[0].height, 1280);
  assert.equal(silentProbe.streams.length, 1);
  assert.ok(
    !silentProbe.streams[0].side_data_list?.some((data) => data.rotation),
  );
  check(
    "Silent rotated source renders an upright portrait MP4 without requiring audio",
  );
  const previewJob = await wait(
    await request(`/projects/${silent.id}/preview`, "POST", {}, 202),
  );
  assert.equal(previewJob.status, "completed", previewJob.message);
  const previewProject = await request(`/projects/${silent.id}`);
  assert.ok(previewProject.previewFile);
  const previewResponse = await fetch(
    base + `/projects/${silent.id}/media?preview=1`,
    { headers: { Range: "bytes=0-99" } },
  );
  assert.equal(previewResponse.status, 206);
  check(
    "Compatible local preview preserves original footage and supports range playback",
  );
  const quietFile = path.join(directory, "quiet-audio.mp4");
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", silentFile,
    "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono",
    "-t", "2", "-c:v", "copy", "-c:a", "aac", "-y", quietFile,
  ]);
  const quietForm = new FormData();
  quietForm.append("video", new Blob([await readFile(quietFile)]), "quiet-audio.mp4");
  const quietUpload = await fetch(base + "/projects", {method: "POST", body: quietForm});
  assert.equal(quietUpload.status, 202);
  const quietImported = await wait(await quietUpload.json());
  assert.equal(quietImported.status, "completed");
  const quiet = (await request("/projects")).find((project) => project.originalName === "quiet-audio.mp4");
  assert.ok(quiet);
  const keptCaption = [{id: "reviewed", start: 0.1, end: 1.5, text: "Previously reviewed captions"}];
  await request(`/projects/${quiet.id}/transcript`, "PUT", {segments: keptCaption});
  const emptySpeech = await wait(await request(`/projects/${quiet.id}/transcribe`, "POST", {model: "tiny", language: "en"}, 202));
  assert.equal(emptySpeech.status, "failed");
  assert.ok(emptySpeech.message.includes("No speech was recognized"));
  assert.deepEqual((await request(`/projects/${quiet.id}`)).transcript, keptCaption);
  check("Empty recognition on silent audio preserves the previous transcript");
  const deleteTarget = await request(`/projects/${p.id}`);
  await request(`/projects/${p.id}/files`, "DELETE", {}, 400);
  await access(path.join(directory, "media", deleteTarget.filename));
  const deleteBusyJob = await request(`/projects/${p.id}/transcribe`, "POST", {model: "tiny", language: "en"}, 202);
  await request(`/projects/${p.id}/files`, "DELETE", {confirm: true}, 409);
  await wait(deleteBusyJob);
  check("Disk deletion requires explicit confirmation and refuses active processing");
  const latest = await request(`/projects/${p.id}`);
  const sharedOwner = structuredClone(latest);
  sharedOwner.id = randomUUID();
  sharedOwner.name = "Shared file deletion fixture";
  const sharedBackup = {version: 1, exportedAt: new Date().toISOString(), projects: [sharedOwner]};
  await request("/backup/restore", "POST", {backup: sharedBackup, preview: false});
  const preview = `${latest.id}-preview.mp4`;
  await copyFile(path.join(directory, "media", latest.filename), path.join(directory, "media", preview));
  const unrelated = path.join(directory, "transcript-history", `${quiet.id}-keep.json`);
  await writeFile(unrelated, '{}');
  const history = (await readdir(path.join(directory, "transcript-history"))).filter((name) => name.startsWith(latest.id + '-'));
  assert.ok(history.length);
  const deletedShared = await request(`/projects/${latest.id}/files`, "DELETE", {confirm: true});
  assert.ok(deletedShared.sharedFiles > 0);
  await access(path.join(directory, "media", latest.filename));
  await assert.rejects(access(path.join(directory, "media", latest.id + '.jpg')));
  await assert.rejects(access(path.join(directory, "media", preview)));
  for (const name of history) await assert.rejects(access(path.join(directory, "transcript-history", name)));
  await access(unrelated);
  await request(`/projects/${latest.id}`, "GET", undefined, 404);
  check("Deletion removes project preview and caption history while preserving shared source/exports");
  const deleted = await request(`/projects/${sharedOwner.id}/files`, "DELETE", {confirm: true});
  assert.ok(deleted.reclaimedBytes >= latest.size);
  await assert.rejects(access(path.join(directory, "media", latest.filename)));
  for (const file of latest.exports) {
    await assert.rejects(access(path.join(directory, "exports", file.filename)));
    await assert.rejects(access(path.join(directory, "exports", file.id + '.srt')));
  }
  await access(path.join(directory, "media", quiet.filename));
  await access(path.join(directory, "models/tiny/model.bin"));
  await stop();
  await start();
  await request(`/projects/${sharedOwner.id}`, "GET", undefined, 404);
  check("Deleting the final owner removes source and exports from disk and persists across restart");
  await writeFile(
    path.join(directory, "report.json"),
    JSON.stringify(
      { passed: checks, finishedAt: new Date().toISOString(), directory },
      null,
      2,
    ),
  );
  console.log(
    `\n${checks.length} integration checks passed. Evidence: ${directory}`,
  );
} catch (error) {
  await writeFile(
    path.join(directory, "failure.log"),
    `${error.stack}\n\n${logs}`,
  );
  console.error(error);
  process.exitCode = 1;
} finally {
  await stop();
}
