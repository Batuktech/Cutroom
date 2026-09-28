import { afterEach, describe, expect, it, vi } from "vitest";
import { cloudProviders, providerDetails } from "../shared/ai-providers.js";
import { requestAI, type AIRequest } from "./ai-providers.js";
const request: AIRequest = { provider: "openai", model: "test-model", apiKey: "sk-synthetic-secret", instruction: "Select clips", input: "Synthetic transcript", schema: { type: "object" } };
const answer = { candidates: [] };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("cloud transports", () => {
  it.each(cloudProviders)("uses %s structured output and redacts credentials from URLs", async provider => {
    vi.stubEnv("CUTROOM_CUSTOM_AI_BASE_URL", "https://custom-provider.example/v1");
    const payload = provider === "openai" ? { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(answer) }] }], usage: { input_tokens: 12, output_tokens: 8 } }
      : provider === "anthropic" ? { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(answer) }], usage: { input_tokens: 12, output_tokens: 8 } }
      : { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(answer) } }], usage: { prompt_tokens: 12, completion_tokens: 8 } };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", fetcher);
    expect(await requestAI({ ...request, provider })).toEqual({ data: answer, inputTokens: 12, outputTokens: 8 });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(provider === "custom" ? "https://custom-provider.example/v1/chat/completions" : providerDetails[provider].endpoint);
    expect(url).not.toContain(request.apiKey);
    expect(init.redirect).toBe("error");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("test-model");
    expect(init.body).not.toContain(request.apiKey);
    if (provider === "openai") { expect(body.store).toBe(false); expect(body.text.format.strict).toBe(true); }
    if (provider === "anthropic") { expect(init.headers["x-api-key"]).toBe(request.apiKey); expect(body.output_config.format.type).toBe("json_schema"); }
    if (provider !== "openai" && provider !== "anthropic") {
      expect(body.response_format.type).toBe(providerDetails[provider].format);
      expect(body.messages[0].content).toContain("JSON schema");
      expect(body.messages[0].content).toContain(JSON.stringify(request.schema));
      expect(init.headers.Authorization).toBe(`Bearer ${request.apiKey}`);
      if (provider !== "openrouter") expect(body.provider).toBeUndefined();
    }
    if (provider === "dashscope") expect(body.enable_thinking).toBe(false);
    if (provider === "openrouter") { expect(body.provider.require_parameters).toBe(true); expect(body.response_format.json_schema.strict).toBe(true); }
  });
  it("uses a bounded reasoning preset for Kimi K3", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content: "{}" } }] }));
    vi.stubGlobal("fetch", fetcher);
    await requestAI({ ...request, provider: "moonshot", model: "kimi-k3" });
    expect(JSON.parse(fetcher.mock.calls[0][1].body).reasoning_effort).toBe("low");
  });
  it("allows an explicit compatibility format without retrying in another mode", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content: "{}" } }] }));
    vi.stubGlobal("fetch", fetcher);
    await requestAI({ ...request, provider: "groq", outputFormat: "json_object" });
    expect(JSON.parse(fetcher.mock.calls[0][1].body).response_format).toEqual({ type: "json_object" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 429, 500])("sanitizes HTTP %i errors and does not retry", async status => {
    const fetcher = vi.fn().mockResolvedValue(new Response(request.apiKey, { status }));
    vi.stubGlobal("fetch", fetcher);
    await expect(requestAI(request)).rejects.toThrow(`HTTP ${status}`);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not echo network exception details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(`Header ${request.apiKey}`)));
    await expect(requestAI(request)).rejects.toThrow("could not return a complete structured result");
  });
  it.each([
    { status: "incomplete", output: [] },
    { status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] },
    { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "invalid" }] }] },
  ])("rejects truncated, refused, or invalid JSON output", async payload => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))));
    await expect(requestAI(request)).rejects.toThrow("complete structured result");
  });
  it("bounds provider response size", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x".repeat(1_000_001))));
    await expect(requestAI(request)).rejects.toThrow("complete structured result");
  });
  it("passes cancellation through to fetch", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
    })));
    const pending = requestAI({ ...request, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow("cancelled");
  });
});
