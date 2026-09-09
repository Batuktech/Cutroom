import { describe, expect, it } from "vitest";
import { youtubeParts, sourceTime } from "./youtube-range.js";

describe("long replay range planning", () => {
  it("splits a twelve-hour replay into contiguous independent half-hour projects", () => {
    const parts = youtubeParts({ start: 0, end: 43200 }, 30);
    expect(parts).toHaveLength(24);
    expect(parts[0]).toEqual({ start: 0, end: 1800 });
    expect(parts.at(-1)).toEqual({ start: 41400, end: 43200 });
    parts.slice(1).forEach((part, i) => expect(part!.start).toBe(parts[i]!.end));
  });
  it("preserves an offset start and shorter last part", () => {
    expect(youtubeParts({ start: 7200, end: 11200 }, 30)).toEqual([
      { start: 7200, end: 9000 }, { start: 9000, end: 10800 }, { start: 10800, end: 11200 },
    ]);
    expect(youtubeParts({ start: 0, end: 1800.5 }, 30)).toEqual([{ start: 0, end: 1800.5 }]);
    expect(sourceTime(43205)).toBe("12:00:05");
  });
  it("rejects reversed, oversized, nonfinite, and excessive batch ranges before queuing", () => {
    for (const range of [{ start: -1, end: 3 }, { start: 4, end: 2 }, { start: 0, end: 10801 }, { start: NaN, end: 5 }, { start: 1, end: Infinity }])
      expect(() => youtubeParts(range)).toThrow();
    expect(() => youtubeParts({ start: 0, end: 43200 }, 15)).toThrow(/24 parts/);
    expect(() => youtubeParts(undefined, 30)).toThrow();
    expect(() => youtubeParts({ start: 0, end: 300 }, 20)).toThrow();
    expect(youtubeParts()).toEqual([undefined]);
  });
});
