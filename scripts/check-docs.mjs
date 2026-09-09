import { readdir, readFile, access } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const excluded = new Set(["node_modules", ".git", ".cutroom", "output", "dist", ".playwright-cli"]);
async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.name.startsWith(".venv")) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(file));
    else if (entry.name.endsWith(".md") || entry.name === "llms.txt") files.push(file);
  }
  return files;
}
const failures = [];
const files = await markdownFiles(root);
for (const file of files) {
  const content = (await readFile(file, "utf8")).replace(/```[\s\S]*?```/g, "");
  for (const match of content.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1].replace(/^<|>$/g, "");
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) continue;
    const pathname = decodeURIComponent(target.split("#")[0]);
    try { await access(path.resolve(path.dirname(file), pathname)); }
    catch { failures.push(`${path.relative(root, file)}: missing ${target}`); }
    if (/(?:^|\/)output\//.test(pathname)) failures.push(`${path.relative(root, file)}: links to excluded local output`);
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else console.log(`Checked local file links in ${files.length} documentation files. External URLs and heading anchors are not checked.`);
