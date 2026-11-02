import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { AIRequest, AIResponse } from "./ai-providers.js";

// Cutroom runs the user's own, unmodified Claude Code. It never reads, stores, or forwards the CLI's
// sign-in: the CLI finds it in its own config directory or keychain.
export interface ClaudeCodeStatus { installed: boolean; loggedIn: boolean; authMethod?: string; version?: string }

const timeout = 5 * 60_000;
const workDirectory = path.join(os.tmpdir(), "cutroom-claude-code");
// Only what the CLI needs to locate its install, sign-in, and network. CLAUDE_CODE_OAUTH_TOKEN (from
// `claude setup-token`) passes through untouched for the CLI's own use; Cutroom never reads it.
// API keys and Cutroom's other secrets are left behind so they cannot change how the CLI bills.
const forwardedVariable = /^(PATH|HOME|USER|LOGNAME|SHELL|LANG|LANGUAGE|LC_[A-Z_]+|TZ|TMPDIR|TEMP|TMP|XDG_[A-Z_]+|APPDATA|LOCALAPPDATA|USERPROFILE|HOMEDRIVE|HOMEPATH|SYSTEMROOT|SystemRoot|COMSPEC|ComSpec|PATHEXT|WINDIR|windir|CLAUDE_CONFIG_DIR|CLAUDE_CODE_OAUTH_TOKEN|HTTPS?_PROXY|https?_proxy|NO_PROXY|no_proxy|NODE_EXTRA_CA_CERTS)$/;

export function claudeCodeEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  return Object.fromEntries(Object.entries(environment).filter(([name, value]) => value !== undefined && forwardedVariable.test(name)));
}
export function claudeCodeBinary(environment: NodeJS.ProcessEnv = process.env) {
  const value = environment.CUTROOM_CLAUDE_CODE_BIN?.trim();
  return value && !/[\0\r\n]/.test(value) ? value : "claude";
}

interface Run { code: number | null; stdout: string; missing: boolean; failed: boolean; timedOut: boolean; overflow: boolean }
function run(args: string[], environment: NodeJS.ProcessEnv, options: { input?: string; timeout: number; signal?: AbortSignal }) {
  return new Promise<Run>(resolve => {
    const result: Run = { code: null, stdout: "", missing: false, failed: false, timedOut: false, overflow: false };
    const chunks: Buffer[] = [];
    let bytes = 0, settled = false;
    const child = spawn(claudeCodeBinary(environment), args, {
      cwd: workDirectory, env: claudeCodeEnvironment(environment), stdio: ["pipe", "pipe", "ignore"], windowsHide: true,
    });
    const stop = () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    };
    const timer = setTimeout(() => { result.timedOut = true; stop(); }, options.timeout);
    const finish = () => {
      if (settled) return;
      settled = true; clearTimeout(timer); options.signal?.removeEventListener("abort", stop);
      result.stdout = Buffer.concat(chunks).toString("utf8");
      resolve(result);
    };
    options.signal?.addEventListener("abort", stop, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 2_000_000) { result.overflow = true; stop(); } else chunks.push(chunk);
    });
    child.stdin.on("error", () => { /* The CLI may exit before reading all input. */ });
    child.stdin.end(options.input ?? "");
    child.on("error", (error: NodeJS.ErrnoException) => { result.failed = true; result.missing = error.code === "ENOENT"; finish(); });
    child.on("close", code => { result.code = code; finish(); });
    if (options.signal?.aborted) stop();
  });
}

const authSchema = z.object({ loggedIn: z.boolean(), authMethod: z.string().regex(/^[\w.-]{1,40}$/).optional().catch(undefined) });
export async function probeClaudeCode(environment: NodeJS.ProcessEnv = process.env): Promise<ClaudeCodeStatus> {
  await mkdir(workDirectory, { recursive: true });
  const version = await run(["--version"], environment, { timeout: 15_000 });
  if (version.failed || version.code !== 0) return { installed: false, loggedIn: false };
  const status: ClaudeCodeStatus = { installed: true, loggedIn: false, version: version.stdout.match(/\d+\.\d+\.\d+/)?.[0] };
  const auth = await run(["auth", "status", "--json"], environment, { timeout: 15_000 });
  try {
    // Account email and organization are deliberately dropped here.
    const parsed = authSchema.parse(JSON.parse(auth.stdout));
    return { ...status, loggedIn: parsed.loggedIn, authMethod: parsed.authMethod };
  } catch { return status; }
}

const tokens = z.number().int().nonnegative().optional().catch(undefined);
const resultSchema = z.object({
  type: z.literal("result"), subtype: z.string().max(80), is_error: z.boolean(),
  api_error_status: z.number().int().nullable().optional().catch(null),
  structured_output: z.unknown().optional(),
  modelUsage: z.record(z.string(), z.object({ inputTokens: tokens, outputTokens: tokens, cacheReadInputTokens: tokens, cacheCreationInputTokens: tokens })).optional().catch(undefined),
});

export async function requestClaudeCode(request: AIRequest, environment: NodeJS.ProcessEnv = process.env): Promise<AIResponse> {
  await mkdir(workDirectory, { recursive: true });
  // No tools, MCP servers, hooks, plugins, skills, or CLAUDE.md: the transcript is data for one structured answer.
  // The transcript goes through stdin, never the argument list.
  const args = ["-p", "--output-format", "json", `--model=${request.model}`, `--system-prompt=${request.instruction}`,
    `--json-schema=${JSON.stringify(request.schema)}`, "--tools", "", "--strict-mcp-config", "--safe-mode",
    "--disable-slash-commands", "--no-session-persistence"];
  const result = await run(args, environment, { input: request.input, timeout, signal: request.signal });
  if (request.signal?.aborted) throw new Error("Analysis cancelled. Claude Code may have already sent the request.");
  if (result.missing) throw new Error("Claude Code was not found. Install it, run `claude` once to sign in, then recheck in Studio settings.");
  if (result.timedOut) throw new Error("Claude Code did not finish within 5 minutes. Saved findings remain available; no automatic retry was sent.");
  let parsed: z.infer<typeof resultSchema>;
  try {
    if (result.overflow) throw new Error();
    parsed = resultSchema.parse(JSON.parse(result.stdout));
  } catch {
    throw new Error("Claude Code exited without a readable result. Run `claude auth status` and `claude update` in a terminal, then try again. Saved findings remain available.");
  }
  // Never echo the CLI's own text: it can quote the transcript or account details.
  if (parsed.is_error || parsed.subtype !== "success") {
    const status = parsed.api_error_status;
    throw new Error(status === 401 || status === 403 ? "Claude Code is not signed in or cannot use this model. Run `claude` in a terminal to sign in, or choose another model."
      : status === 429 ? "Claude Code reached a usage or rate limit. Check your Claude plan's usage, then try again later."
      : status === 400 || status === 404 ? "Claude Code rejected the request. Check the model name (for example opus or sonnet)."
      : "Claude Code could not complete the request. Check `claude auth status` and your plan's usage. Saved findings remain available; no automatic retry was sent.");
  }
  if (parsed.structured_output === undefined) throw new Error("Claude Code finished without structured clip data. Try again or choose another model.");
  const usage = Object.values(parsed.modelUsage ?? {});
  return {
    data: parsed.structured_output,
    inputTokens: usage.reduce((sum, m) => sum + (m.inputTokens ?? 0) + (m.cacheReadInputTokens ?? 0) + (m.cacheCreationInputTokens ?? 0), 0),
    outputTokens: usage.reduce((sum, m) => sum + (m.outputTokens ?? 0), 0),
  };
}
