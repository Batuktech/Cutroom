import { describe, expect, it } from "vitest";
import { rankCandidates, streamParts, streamRequestSchema } from "./streams.js";

describe("stream planning", () => {
  it("splits into one-hour parts and folds a short remainder into the last part", () => {
    expect(streamParts(3 * 3600 + 1200)).toEqual([{ start: 0, end: 3600 }, { start: 3600, end: 7200 }, { start: 7200, end: 10800 }, { start: 10800, end: 12000 }]);
    expect(streamParts(2 * 3600 + 30)).toEqual([{ start: 0, end: 3600 }, { start: 3600, end: 7230 }]);
    expect(streamParts(1800)).toEqual([{ start: 0, end: 1800 }]);
    expect(() => streamParts(25 * 3600)).toThrow("24 hours");
    expect(() => streamParts(0)).toThrow();
  });
  it("prefers reviewed candidates and spreads picks across parts", () => {
    const c = (part: number, order: number, verdict?: "suggested" | "reviewed" | "needs-review") => ({ part, order, verdict, key: `${part}-${order}` });
    const picked = rankCandidates([c(0, 0), c(0, 1, "reviewed"), c(0, 2, "reviewed"), c(1, 0, "needs-review"), c(1, 1, "reviewed"), c(2, 0)], 4);
    expect(picked.map(p => p.key)).toEqual(["0-1", "1-1", "0-2", "0-0"]);
    expect(rankCandidates([c(0, 0)], 5)).toHaveLength(1);
  });
  it("requires explicit consent before posting to any platform", () => {
    const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    expect(streamRequestSchema.safeParse({ url }).success).toBe(true);
    expect(streamRequestSchema.safeParse({ url, platforms: ["youtube"] }).success).toBe(false);
    expect(streamRequestSchema.safeParse({ url, platforms: ["youtube"], publishConsent: true }).success).toBe(true);
    expect(streamRequestSchema.safeParse({ url, platforms: ["tiktok", "tiktok"], publishConsent: true }).success).toBe(false);
    expect(streamRequestSchema.safeParse({ url, topClips: 50 }).success).toBe(false);
  });
});
