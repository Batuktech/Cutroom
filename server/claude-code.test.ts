import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { claudeCodeEnvironment, probeClaudeCode, requestClaudeCode } from "./claude-code.js";
import type { AIRequest } from "./ai-providers.js";

// A synthetic stand-in for the CLI. It records what it receives and never contacts Anthropic.
const fakeCli = `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
const args = process.argv.slice(2);
if (args[0] === "--version") { console.log("9.9.9 (Claude Code)"); process.exit(0); }
if (args[0] === "auth") { console.log(JSON.stringify({ loggedIn: true, authMethod: "claude.ai", email: "person@example.com", orgId: "org-synthetic" })); process.exit(0); }
let input = "";
process.stdin.on("data", d => { input += d; });
process.stdin.on("end", () => {
  const model = (args.find(a => a.startsWith("--model=")) || "").slice(8);
  fs.appendFileSync(path.join(__dirname, "calls.jsonl"), JSON.stringify({ args, env: Object.keys(process.env), input, cwd: process.cwd() }) + "\\n");
  const reply = value => process.stdout.write(JSON.stringify(value));
  if (model === "test-delayed") { setTimeout(() => reply({}), 30000); return; }
  if (model === "test-429") return reply({ type: "result", subtype: "success", is_error: true, api_error_status: 429, result: "Synthetic transcript person@example.com" });
  if (model === "test-garbage") { process.stdout.write("Synthetic transcript"); process.exit(1); }
  if (model === "test-no-output") return reply({ type: "result", subtype: "success", is_error: false, result: "No structured answer." });
  reply({ type: "result", subtype: "success", is_error: false, structured_output: { candidates: [] },
    modelUsage: { "claude-opus-5-5": { inputTokens: 10, cacheReadInputTokens: 5, cacheCreationInputTokens: 1, outputTokens: 7 } } });
});
`;

let directory = "", environment: NodeJS.ProcessEnv = {};
const request: AIRequest = { provider: "claude-code", model: "opus", apiKey: "", instruction: "Select clips", input: "--model=evil Synthetic transcript", schema: { type: "object" } };
const calls = async () => (await readFile(path.join(directory, "calls.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));

beforeAll(async () => {
  await mkdir("output", { recursive: true });
  directory = await mkdtemp(path.resolve("output/claude-code-test-"));
  const binary = path.join(directory, "claude.cjs");
  await writeFile(binary, fakeCli); await chmod(binary, 0o755);
  environment = { PATH: process.env.PATH, HOME: directory, CUTROOM_CLAUDE_CODE_BIN: binary,
    OPENAI_API_KEY: "sk-synthetic-openai", ANTHROPIC_API_KEY: "sk-synthetic-anthropic", CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat01-synthetic", POSTIZ_API_KEY: "synthetic-postiz" };
});
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

describe.skipIf(process.platform === "win32")("Claude Code CLI transport", () => {
  it("sends the transcript on stdin with tools disabled and no API keys", async () => {
    expect(await requestClaudeCode(request, environment)).toEqual({ data: { candidates: [] }, inputTokens: 16, outputTokens: 7 });
    const [call] = await calls();
    expect(call.input).toBe(request.input);
    expect(call.args).toEqual(expect.arrayContaining(["-p", "--output-format", "json", "--model=opus", "--tools", "", "--strict-mcp-config", "--safe-mode", "--no-session-persistence"]));
    expect(call.args.join(" ")).not.toContain("Synthetic transcript");
    expect(call.args).toContain(`--json-schema=${JSON.stringify(request.schema)}`);
    // The setup-token reaches only the official CLI; an API key would switch the CLI to API billing.
    expect(call.env).toEqual(expect.arrayContaining(["PATH", "CLAUDE_CODE_OAUTH_TOKEN"]));
    for (const name of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "POSTIZ_API_KEY", "CUTROOM_CLAUDE_CODE_BIN"]) expect(call.env).not.toContain(name);
  });
  it.each([
    ["test-429", "usage or rate limit"],
    ["test-garbage", "without a readable result"],
    ["test-no-output", "without structured clip data"],
  ])("maps %s to a fixed message that never echoes CLI output", async (model, message) => {
    const error = await requestClaudeCode({ ...request, model }, environment).then(() => new Error("resolved"), (e: Error) => e);
    expect(error.message).toContain(message);
    expect(error.message).not.toMatch(/Synthetic transcript|person@example\.com/);
  });
  it("stops the CLI when the analysis is cancelled", async () => {
    const controller = new AbortController();
    const started = Date.now();
    setTimeout(() => controller.abort(), 300);
    await expect(requestClaudeCode({ ...request, model: "test-delayed", signal: controller.signal }, environment)).rejects.toThrow("cancelled");
    expect(Date.now() - started).toBeLessThan(5000);
  });
  it("explains a missing CLI", async () => {
    const missing = { ...environment, CUTROOM_CLAUDE_CODE_BIN: path.join(directory, "absent") };
    await expect(requestClaudeCode(request, missing)).rejects.toThrow("Claude Code was not found");
    expect(await probeClaudeCode(missing)).toEqual({ installed: false, loggedIn: false });
  });
  it("reports sign-in state and drops account details", async () => {
    const status = await probeClaudeCode(environment);
    expect(status).toEqual({ installed: true, loggedIn: true, authMethod: "claude.ai", version: "9.9.9" });
    expect(JSON.stringify(status)).not.toMatch(/person@example\.com|org-synthetic/);
  });
  it("forwards only allowlisted environment variables", () => {
    expect(claudeCodeEnvironment({ PATH: "/bin", LC_ALL: "C", CLAUDE_CONFIG_DIR: "/c", CLAUDE_CODE_OAUTH_TOKEN: "t", ANTHROPIC_API_KEY: "k", ANTHROPIC_AUTH_TOKEN: "a", GEMINI_API_KEY: "x", AWS_SECRET_ACCESS_KEY: "y", CUTROOM_DATA_DIR: "/d" }))
      .toEqual({ PATH: "/bin", LC_ALL: "C", CLAUDE_CONFIG_DIR: "/c", CLAUDE_CODE_OAUTH_TOKEN: "t" });
  });
});
