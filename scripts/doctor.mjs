import "./environment.mjs";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

let requiredFailures = 0;
function report(label, ready, optional = false, help = "") {
  console.log(
    `${ready ? "OK" : optional ? "OPTIONAL" : "MISSING"}  ${label}${!ready && help ? `: ${help}` : ""}`,
  );
  if (!ready && !optional) requiredFailures++;
}
const [major, minor] = process.versions.node.split(".").map(Number);
report(
  `Node ${process.versions.node}`,
  major > 22 || (major === 22 && minor >= 12),
  false,
  "Use Node 22.12 or newer.",
);
report(
  "Node dependencies",
  existsSync("node_modules/tsx/package.json"),
  false,
  "Run npm ci.",
);
const ffmpeg = spawnSync("ffmpeg", ["-hide_banner", "-filters"], {
  encoding: "utf8",
  timeout: 10000,
});
report(
  "FFmpeg with caption rendering",
  ffmpeg.status === 0 && /\bass\s/.test(ffmpeg.stdout),
  false,
  "Install FFmpeg with libass support.",
);
report(
  "FFprobe",
  spawnSync("ffprobe", ["-version"], { timeout: 10000 }).status === 0,
  false,
  "Install FFmpeg.",
);
report(
  "Bundled caption fonts",
  existsSync("public/fonts/Manrope-Bold.ttf") &&
    existsSync("public/fonts/NotoSans-Bold.ttf"),
);
const ai = spawnSync(".venv/bin/python", ["scripts/ai_worker.py", "check"], {
  encoding: "utf8",
  timeout: 30000,
});
report(
  "Local Whisper and face detector",
  ai.status === 0,
  true,
  "Run npm run setup:ai. Manual editing works without AI.",
);
const data = path.resolve(process.env.CUTROOM_DATA_DIR || ".cutroom");
report(
  "YouTube downloader",
  spawnSync(".venv/bin/python", ["scripts/youtube_worker.py", "--check"], { timeout: 10000 }).status === 0,
  true,
  "Run npm run setup:ai to enable YouTube URL import.",
);
const installed = ["tiny", "base", "small", "large-v3"].filter((model) =>
  [".ready", "model.bin", "config.json", "tokenizer.json"].every((file) =>
    existsSync(path.join(data, "models", model, file)),
  ),
);
report(
  `Speech model${installed.length ? ` (${installed.join(", ")})` : ""}`,
  installed.length > 0,
  true,
  "Install one in Studio settings; this downloads weights once.",
);
report(
  "Built interface",
  existsSync("dist/index.html"),
  true,
  "Run npm run build for npm start, or use npm run dev.",
);
const qwen = spawnSync(".venv-qwen/bin/python", ["scripts/suggest_worker.py", "--check"], {
  encoding: "utf8", timeout: 10000,
});
report(
  "Local Qwen clip analysis",
  qwen.status === 0 && existsSync(path.join(data, "models/qwen3-8b/Qwen3-8B-Q4_K_M.gguf")),
  true,
  "See docs/ai-suggestions.md. Fast transcript rules work without Qwen.",
);
console.log(`Data folder: ${data}`);
console.log(
  requiredFailures
    ? "Resolve the missing requirements before starting."
    : "Ready to open a local studio. No accounts or API keys needed.",
);
process.exitCode = requiredFailures ? 1 : 0;
