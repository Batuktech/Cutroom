import { describe, expect, it, vi } from "vitest";
import { analyzeCloud, cloudSections } from "./cloud-suggestions.js";
import { defaultSuggestionOptions } from "../shared/suggestion-options.js";
import { recognitionResultSchema } from "./suggestion-domain.js";
const segments = Array.from({ length: 240 }, (_, i) => ({ id: `segment-${i}`, start: i * 5, end: i * 5 + 4, text: `This is a complete synthetic passage number ${i} about an unexpected conversation.` }));
const proposal = { first: 0, last: 2, title: "An unexpected conversation", reason: "A self-contained moment", weakness: "", strength: 3 };
const verdict = { context: true, ending: true, appeal: true, clarity: true, weakness: "" };
const options = { ...defaultSuggestionOptions, provider: "openai" as const, model: "test-model", maxRequests: 20 };
const response = (data: unknown) => ({ data, inputTokens: 100, outputTokens: 20 });

describe("cloud clip analysis", () => {
  it("covers every segment with bounded, overlapping sections", () => {
    const sections = cloudSections(segments, 100);
    expect(sections[0].first).toBe(0);
    expect(sections.at(-1)?.last).toBe(segments.length - 1);
    sections.forEach((s, i) => { expect(s.last - s.first).toBeLessThan(120); if (i) expect(s.first).toBeLessThanOrEqual(sections[i - 1].last); });
    for (let i = 0; i < segments.length; i++) expect(sections.some(s => s.first <= i && s.last >= i)).toBe(true);
  });
  it("enforces the request cap and saves grounded partial candidates", async () => {
    const checkpoint = vi.fn(), ask = vi.fn().mockResolvedValue(response({ candidates: [proposal] }));
    const result = await analyzeCloud({ segments, duration: 1200, options: { ...options, maxRequests: 1 }, apiKey: "synthetic", progress: vi.fn(), checkpoint, ask });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(result.partial).toBe(true); expect(result.usage.limitReached).toBe(true);
    const saved = recognitionResultSchema.parse(checkpoint.mock.calls.at(-1)![0]);
    expect(saved.candidates[0].quote).toContain(segments[0].text);
    expect(saved.complete).toBe(false); expect(saved.usage?.inputTokens).toBe(100);
    expect(checkpoint.mock.calls.at(-1)![1]).toBe(true);
  });
  it("rejects hallucinated indexes, overlong clips, invalid shapes and duplicate passages", async () => {
    const checkpoint = vi.fn();
    const ask = vi.fn().mockResolvedValue(response({ candidates: [proposal, proposal, { ...proposal, first: 1000, last: 1001 }, { ...proposal, last: 20 }, { invalid: true }] }));
    await analyzeCloud({ segments: segments.slice(0, 30), duration: 150, options, apiKey: "synthetic", progress: vi.fn(), checkpoint, ask });
    const saved = recognitionResultSchema.parse(checkpoint.mock.calls.at(-1)![0]);
    expect(saved.candidates).toHaveLength(1);
    expect(saved.diagnostics?.invalid).toBe(3); expect(saved.diagnostics?.duplicates).toBe(1);
    expect(saved.complete).toBe(true);
  });
  it.each(["reviewed", "strict"] as const)("applies %s second-pass behavior", async strictness => {
    const checkpoint = vi.fn();
    const ask = vi.fn().mockResolvedValueOnce(response({ candidates: [proposal] })).mockResolvedValueOnce(response({ ...verdict, ending: false, weakness: "Missing ending" }));
    await analyzeCloud({ segments: segments.slice(0, 30), duration: 150, options: { ...options, strictness }, apiKey: "synthetic", progress: vi.fn(), checkpoint, ask });
    const saved = recognitionResultSchema.parse(checkpoint.mock.calls.at(-1)![0]);
    expect(saved.candidates).toHaveLength(strictness === "strict" ? 0 : 1);
    expect(saved.reviewed).toBe(1); expect(saved.complete).toBe(true);
    if (strictness === "reviewed") expect(saved.candidates[0].verdict).toBe("needs-review");
  });
  it("never passes unchecked candidates as strict when the budget runs out", async () => {
    const checkpoint = vi.fn();
    await analyzeCloud({ segments: segments.slice(0, 30), duration: 150, options: { ...options, strictness: "strict", maxRequests: 1 }, apiKey: "synthetic", progress: vi.fn(), checkpoint,
      ask: vi.fn().mockResolvedValue(response({ candidates: [proposal] })) });
    const saved = recognitionResultSchema.parse(checkpoint.mock.calls.at(-1)![0]);
    expect(saved.candidates).toHaveLength(0); expect(saved.usage?.limitReached).toBe(true); expect(saved.complete).toBe(false);
  });
  it("saves partial findings when a later request fails", async () => {
    const checkpoint = vi.fn();
    const ask = vi.fn().mockResolvedValueOnce(response({ candidates: [proposal] })).mockRejectedValue(new Error("Provider unavailable"));
    await expect(analyzeCloud({ segments, duration: 1200, options, apiKey: "synthetic", progress: vi.fn(), checkpoint, ask })).rejects.toThrow("Provider unavailable");
    expect(checkpoint.mock.calls.at(-1)![0].candidates).toHaveLength(1);
    expect(checkpoint.mock.calls.at(-1)![0].usage.requests).toBe(2);
  });
  it("does not issue requests or save after cancellation", async () => {
    const controller = new AbortController(); controller.abort();
    const ask = vi.fn(), checkpoint = vi.fn();
    await expect(analyzeCloud({ segments, duration: 1200, options, apiKey: "synthetic", signal: controller.signal, progress: vi.fn(), checkpoint, ask })).rejects.toThrow();
    expect(ask).not.toHaveBeenCalled(); expect(checkpoint).not.toHaveBeenCalled();
  });
});
