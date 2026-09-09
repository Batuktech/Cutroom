import "./environment.mjs";
import { spawn } from "node:child_process";

const processes = [
  spawn("node", ["--import", "tsx", "server/index.ts"], { stdio: "inherit" }),
  spawn("node", ["node_modules/vite/bin/vite.js"], { stdio: "inherit" }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  processes.forEach((p) => p.kill("SIGTERM"));
  setTimeout(() => process.exit(code), 500);
}
processes.forEach((p) => p.on("exit", (code) => stop(code || 0)));
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
