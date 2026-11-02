import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error || result.status !== 0) {
    console.error(
      "Local AI setup could not finish. Check Python 3.10+ and python3-venv are installed.",
    );
    process.exit(result.status || 1);
  }
}

if (!existsSync(".venv/bin/python")) run("python3", ["-m", "venv", ".venv"]);
run(".venv/bin/python", [
  "-m",
  "pip",
  "install",
  "-r",
  "scripts/requirements.txt",
]);
run(".venv/bin/python", ["scripts/ai_worker.py", "check"]);
// NVIDIA libraries for GPU Whisper are about 2 GB, so they are opt-in. Without them Whisper uses the CPU.
const nvidia = process.platform === "linux" && spawnSync("nvidia-smi", ["-L"], { stdio: "ignore" }).status === 0;
if (process.argv.includes("--gpu")) {
  if (!nvidia) console.warn("No NVIDIA GPU was found; skipping the GPU libraries. Whisper will use the CPU.");
  else run(".venv/bin/python", ["-m", "pip", "install", "-r", "scripts/requirements-gpu.txt"]);
} else if (nvidia && !readdirSync(".venv/lib").some(v => existsSync(`.venv/lib/${v}/site-packages/nvidia/cudnn`))) {
  console.log("NVIDIA GPU found. For much faster transcription, run: npm run setup:ai -- --gpu (about 2 GB).");
}
console.log(
  "Local AI is ready. Start Cutroom and install a speech model in Studio settings.",
);
