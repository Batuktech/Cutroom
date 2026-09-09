import { describe, expect, it } from "vitest";
import {
  buildAss,
  downloadName,
  clipSchema,
  outputSize,
  parseSrt,
  suggestClips,
  toSrt,
  validateBounds,
} from "./domain.js";
import type { Clip, Segment } from "../shared/types.js";

const clip: Clip = {
  id: "test",
  title: "Clip",
  start: 10,
  end: 30,
  aspect: "9:16",
  cropX: 50,
  cropY: 50,
  fit: "cover",
  captionStyle: "studio",
  captions: true,
  captionSize: 52,
  captionPosition: 20,
  accent: "#d6f58a",
  status: "draft",
  createdAt: "2026-09-08",
};
it("keeps Unicode download names while removing path separators and controls", () => {
  expect(downloadName("Монгол клип")).toBe("Монгол клип");
  expect(downloadName("../A/B\nC")).toBe("ABC");
  expect(downloadName("../..", "clip")).toBe("clip");
});
describe("subtitle timing", () => {
  const segments: Segment[] = [
    { id: "a", start: 8, end: 12, text: "Opening" },
    { id: "b", start: 12, end: 15.25, text: "Middle" },
    { id: "c", start: 28, end: 32, text: "Ending" },
  ];
  it("clips and rebases SRT timestamps at both boundaries", () => {
    expect(toSrt(segments, 10, 30)).toBe(
      "1\n00:00:00,000 --> 00:00:02,000\nOpening\n\n2\n00:00:02,000 --> 00:00:05,250\nMiddle\n\n3\n00:00:18,000 --> 00:00:20,000\nEnding\n",
    );
  });
  it("rounds carry into the next minute correctly", () => {
    expect(
      toSrt([{ id: "s", start: 59.9998, end: 61, text: "Yes" }]),
    ).toContain("00:01:00,000");
  });
  it("reads CRLF, BOM, SRT markup, and WebVTT", () => {
    expect(
      parseSrt(
        "\uFEFF1\r\n00:00:01,000 --> 00:00:03,000\r\n<b>Hello</b> world\r\n",
      )[0],
    ).toMatchObject({ start: 1, end: 3, text: "Hello world" });
    expect(
      parseSrt("WEBVTT\n\n00:01.000 --> 00:03.000\nHello")[0],
    ).toMatchObject({ start: 1, end: 3 });
  });
  it("rejects unsupported or empty caption data", () => {
    expect(() => parseSrt("garbage")).toThrow();
    expect(() => parseSrt("1\n0 --> 4\nHello")).toThrow();
  });
  it("does not emit ASS control sequences from user text", () => {
    const ass = buildAss(
      [{ id: "a", start: 10, end: 12, text: "{\\pos(1,1)} hello\\Nworld" }],
      clip,
      1080,
      1920,
    );
    expect(ass).not.toContain("{\\pos");
    expect(ass).not.toContain("\\N");
    expect(ass).toContain("Dialogue: 0,0:00:00.00,0:00:02.00");
  });
  it("keeps an overlapping caption visible at the start of an export", () => {
    expect(buildAss(segments, clip, 1080, 1920)).toContain(
      "Dialogue: 0,0:00:00.00,0:00:02.00",
    );
  });
});
describe("clip validation", () => {
  it("rejects zero length, excessive duration, unsafe colors, and out-of-range framing", () => {
    for (const patch of [
      { end: 10 },
      { end: 2000 },
      { accent: "red';movie=file" },
      { cropX: 101 },
      { start: NaN },
    ])
      expect(clipSchema.safeParse({ ...clip, ...patch }).success).toBe(false);
  });
  it("checks source bounds independently from clip duration", () => {
    expect(() => validateBounds(10, 40, 30)).toThrow();
    expect(() => validateBounds(0, 30, 30)).not.toThrow();
  });
  it("produces standard output dimensions", () => {
    expect(outputSize("9:16", "720")).toEqual([720, 1280]);
    expect(outputSize("16:9")).toEqual([1920, 1080]);
    expect(outputSize("4:5")).toEqual([1080, 1350]);
  });
});
describe("transcript clip suggestions", () => {
  it("handles silent sources without inventing clips", () => {
    expect(suggestClips([], 50)).toEqual([]);
  });
  it("keeps proposed clips within the source and avoids substantial overlap", () => {
    const segments = Array.from({ length: 50 }, (_, i) => ({
      id: String(i),
      start: i * 5,
      end: i * 5 + 4,
      text:
        i % 7
          ? "An example with enough detail to follow."
          : "Why does this important idea work?",
    }));
    const cuts = suggestClips(segments, 250, 35);
    expect(cuts.length).toBeGreaterThan(1);
    for (const c of cuts) {
      expect(c.start).toBeGreaterThanOrEqual(0);
      expect(c.end).toBeLessThanOrEqual(250);
      expect(c.end).toBeGreaterThan(c.start);
      expect(c.reason).toBeTruthy();
    }
    for (let i = 0; i < cuts.length; i++)
      for (let j = i + 1; j < cuts.length; j++)
        expect(
          Math.max(
            0,
            Math.min(cuts[i].end, cuts[j].end) -
              Math.max(cuts[i].start, cuts[j].start),
          ),
        ).toBeLessThan(
          Math.min(cuts[i].end - cuts[i].start, cuts[j].end - cuts[j].start) *
            0.25,
        );
  });
});

it("exports word pop with speech bounds and preserves animation phase for a trimmed opening", () => {
  const words = [{ word: "Hello", start: 10, end: 10.3 }, { word: "world", start: 10.4, end: 10.7 }];
  const source = [{ id: "motion", start: 10, end: 11, text: "Hello world", words }];
  const ass = buildAss(source, { ...clip, start: 10.05, end: 11, captionStyle: "pop" }, 1080, 1920);
  expect(ass).toContain("HELLO");
  expect(ass).toContain("\\fscx100.857");
  expect(ass).toContain("\\t(0,20,\\fscx106");
  expect(ass.match(/Dialogue:/g)).toHaveLength(2);
});
it("build-up emits only words already spoken and keeps subtitle text inert", () => {
  const words = [{ word: "First", start: 10, end: 10.3 }, { word: "{\\b1}second", start: 10.4, end: 10.7 }];
  const ass = buildAss([{ id: "reveal", start: 10, end: 11, text: words.map(w => w.word).join(" "), words }], { ...clip, captionStyle: "reveal" }, 1080, 1920);
  const lines = ass.split("\n").filter(line => line.startsWith("Dialogue:"));
  expect(lines).toHaveLength(2);
  expect(lines[0]).not.toContain("second");
  expect(lines[1]).toContain("second");
  expect(ass).not.toContain("{\\b1}");
});
