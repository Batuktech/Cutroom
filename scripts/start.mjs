import "./environment.mjs";
import { access } from "node:fs/promises";

try {
  await access("dist/index.html");
} catch {
  console.error("Build the local interface first with: npm run build");
  process.exit(1);
}
await import("../server/index.ts");
