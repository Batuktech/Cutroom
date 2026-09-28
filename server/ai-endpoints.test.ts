import { describe, expect, it } from "vitest";
import { providerEndpoint } from "./ai-endpoints.js";
import { cloudProviders, providerDetails } from "../shared/ai-providers.js";
import { AICredentials } from "./ai-credentials.js";

describe("provider destinations", () => {
  it.each([
    undefined, "", "http://provider.example/v1", "https://user:secret@provider.example/v1",
    "https://provider.example/v1?api_key=secret", "https://provider.example/v1#secret",
    "https://127.0.0.1/v1", "https://[::1]/v1", "https://10.0.0.1/v1",
    "https://localhost/v1", "https://metadata.internal/v1", "https://server/v1", "https://provider.example:8443/v1",
  ])("rejects unsuitable custom configuration without exposing it: %s", value => {
    expect(() => providerEndpoint("custom", { CUTROOM_CUSTOM_AI_BASE_URL: value })).toThrow("Set CUTROOM_CUSTOM_AI_BASE_URL");
    const status = new AICredentials({ CUTROOM_CUSTOM_AI_BASE_URL: value }).status().find(s => s.provider === "custom");
    expect(status?.endpointReady).toBe(false); expect(status?.endpoint).toBeUndefined();
  });
  it.each(["https://provider.example/v1", "https://provider.example/v1/", "https://provider.example/v1/chat/completions/"])("normalizes a trusted server-configured base: %s", base => {
    expect(providerEndpoint("custom", { CUTROOM_CUSTOM_AI_BASE_URL: base })).toBe("https://provider.example/v1/chat/completions");
  });
  it("never overrides a built-in provider with custom configuration", () => {
    expect(providerEndpoint("zai", { CUTROOM_CUSTOM_AI_BASE_URL: "https://other.example/v1" })).toBe("https://api.z.ai/api/paas/v4/chat/completions");
  });
  it("isolates keys for every provider, including custom", () => {
    const environment = Object.fromEntries(cloudProviders.map(p => [providerDetails[p].envKey, `synthetic-key-${p}`]));
    const credentials = new AICredentials(environment);
    for (const provider of cloudProviders) expect(credentials.get(provider)).toBe(`synthetic-key-${provider}`);
    credentials.set("moonshot", { apiKey: "kimi-session-key" });
    expect(credentials.get("zai")).toBe("synthetic-key-zai");
    expect(JSON.stringify(credentials.status())).not.toContain("synthetic-key");
  });
});
