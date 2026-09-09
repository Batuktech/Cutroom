import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

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
console.log(
  "Local AI is ready. Start Cutroom and install a speech model in Studio settings.",
);
