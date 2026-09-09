import { afterEach, describe, expect, it, vi } from "vitest";
import { requestAI, type AIRequest } from "./ai-providers.js";
const request: AIRequest = { provider: "openai", model: "test-model", apiKey: "sk-synthetic-secret", instruction: "Select clips", input: "Synthetic transcript", schema: { type: "object" } };
const answer = { candidates: [] };
afterEach(() => vi.unstubAllGlobals());

describe("cloud transports", () => {
  it.each(["openai", "anthropic", "openrouter"] as const)("uses %s structured output and redacts credentials from URLs", async provider => {
    const payload = provider === "openai" ? { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(answer) }] }], usage: { input_tokens: 12, output_tokens: 8 } }
      : provider === "anthropic" ? { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(answer) }], usage: { input_tokens: 12, output_tokens: 8 } }
      : { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(answer) } }], usage: { prompt_tokens: 12, completion_tokens: 8 } };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", fetcher);
    expect(await requestAI({ ...request, provider })).toEqual({ data: answer, inputTokens: 12, outputTokens: 8 });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).not.toContain(request.apiKey);
    expect(init.redirect).toBe("error");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("test-model");
    expect(init.body).not.toContain(request.apiKey);
    if (provider === "openai") { expect(body.store).toBe(false); expect(body.text.format.strict).toBe(true); }
    if (provider === "anthropic") { expect(init.headers["x-api-key"]).toBe(request.apiKey); expect(body.output_config.format.type).toBe("json_schema"); }
    if (provider === "openrouter") { expect(body.provider.require_parameters).toBe(true); expect(body.response_format.json_schema.strict).toBe(true); }
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
