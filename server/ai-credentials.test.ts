import { describe, expect, it, vi } from "vitest";
import { AICredentials, apiKeyProviderSchema, cloudProviderSchema } from "./ai-credentials.js";
import type { ClaudeCodeStatus } from "./claude-code.js";
const noCli = async (): Promise<ClaudeCodeStatus> => ({ installed: false, loggedIn: false });

describe("server-only API keys", () => {
  it("keeps session keys out of status and forgets them on restart", async () => {
    const store = new AICredentials({}, noCli);
    store.set("openai", { apiKey: "sk-synthetic-session-key" });
    expect(store.get("openai")).toBe("sk-synthetic-session-key");
    expect(JSON.stringify(await store.status())).not.toContain("sk-synthetic");
    expect((await new AICredentials({}, noCli).status()).every(s => !s.configured)).toBe(true);
    store.forget("openai");
    expect(() => store.get("openai")).toThrow("Add an API key");
  });
  it("lets a session key override an environment key without deleting the environment", async () => {
    const environment = { ANTHROPIC_API_KEY: "sk-environment-key" };
    const store = new AICredentials(environment, noCli);
    store.set("anthropic", { apiKey: "sk-session-key" });
    expect(store.get("anthropic")).toBe("sk-session-key");
    store.forget("anthropic");
    expect(store.get("anthropic")).toBe(environment.ANTHROPIC_API_KEY);
    expect((await store.status()).find(s => s.provider === "anthropic")?.source).toBe("environment");
  });
  it("rejects control characters, unknown providers, and oversized keys", async () => {
    const store = new AICredentials({ OPENAI_API_KEY: "invalid\nheader" }, noCli);
    for (const apiKey of ["short", "sk-key\r\nInjected: header", "x".repeat(4097)]) {
      expect(() => store.set("openai", { apiKey })).toThrow();
    }
    expect((await store.status())[0].configured).toBe(false);
    expect(cloudProviderSchema.safeParse("https://attacker.invalid").success).toBe(false);
  });
});

describe("Claude Code sign-in", () => {
  it("never accepts a key or token for Claude Code", () => {
    expect(apiKeyProviderSchema.safeParse("claude-code").success).toBe(false);
    const store = new AICredentials({ CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat01-synthetic" }, noCli);
    expect(store.get("claude-code")).toBe("");
  });
  it("reports CLI readiness without account details and caches the probe", async () => {
    const probe = vi.fn(async (): Promise<ClaudeCodeStatus> => ({ installed: true, loggedIn: true, authMethod: "claude.ai", version: "2.1.0" }));
    const store = new AICredentials({}, probe);
    const status = (await store.status()).find(s => s.provider === "claude-code");
    expect(status).toMatchObject({ configured: true, source: "login", endpointReady: true, cli: { loggedIn: true, authMethod: "claude.ai" } });
    await store.status();
    expect(probe).toHaveBeenCalledTimes(1);
    await store.status(true);
    expect(probe).toHaveBeenCalledTimes(2);
    await expect(store.ready("claude-code")).resolves.toBeUndefined();
  });
  it.each([
    [{ installed: false, loggedIn: false }, "not found"],
    [{ installed: true, loggedIn: false }, "not signed in"],
  ])("blocks analysis until Claude Code is installed and signed in: %o", async (cli, message) => {
    const store = new AICredentials({}, async () => cli);
    await expect(store.ready("claude-code")).rejects.toMatchObject({ status: 409, message: expect.stringContaining(message) });
    expect((await store.status()).find(s => s.provider === "claude-code")?.configured).toBe(false);
  });
  it("treats a failing probe as unavailable", async () => {
    const store = new AICredentials({}, () => Promise.reject(new Error("spawn failed")));
    expect((await store.status()).find(s => s.provider === "claude-code")).toMatchObject({ configured: false, endpointReady: false });
  });
});
