import { describe, expect, it } from "vitest";
import { AICredentials, cloudProviderSchema } from "./ai-credentials.js";

describe("server-only API keys", () => {
  it("keeps session keys out of status and forgets them on restart", () => {
    const store = new AICredentials({});
    store.set("openai", { apiKey: "sk-synthetic-session-key" });
    expect(store.get("openai")).toBe("sk-synthetic-session-key");
    expect(JSON.stringify(store.status())).not.toContain("sk-synthetic");
    expect(new AICredentials({}).status().every(s => !s.configured)).toBe(true);
    store.forget("openai");
    expect(() => store.get("openai")).toThrow("Add an API key");
  });
  it("lets a session key override an environment key without deleting the environment", () => {
    const environment = { ANTHROPIC_API_KEY: "sk-environment-key" };
    const store = new AICredentials(environment);
    store.set("anthropic", { apiKey: "sk-session-key" });
    expect(store.get("anthropic")).toBe("sk-session-key");
    store.forget("anthropic");
    expect(store.get("anthropic")).toBe(environment.ANTHROPIC_API_KEY);
    expect(store.status().find(s => s.provider === "anthropic")?.source).toBe("environment");
  });
  it("rejects control characters, unknown providers, and oversized keys", () => {
    const store = new AICredentials({ OPENAI_API_KEY: "invalid\nheader" });
    for (const apiKey of ["short", "sk-key\r\nInjected: header", "x".repeat(4097)]) {
      expect(() => store.set("openai", { apiKey })).toThrow();
    }
    expect(store.status()[0].configured).toBe(false);
    expect(cloudProviderSchema.safeParse("https://attacker.invalid").success).toBe(false);
  });
});
