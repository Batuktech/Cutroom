import { describe, expect, it } from "vitest";
import { captionCues } from "./captions.js";
describe("caption cues", () => {
  it("uses measured word timing for each caption group", () => {
    const words = Array.from({ length: 10 }, (_, i) => ({
      word: ` word${i}`,
      start: 2 + i * 0.4,
      end: 2.2 + i * 0.4,
    }));
    const cues = captionCues(
      {
        id: "one",
        start: 1,
        end: 8,
        text: words.map((w) => w.word.trim()).join(" "),
        words,
      },
      "highlight",
    );
    expect(cues).toHaveLength(2);
    expect(cues[0].start).toBe(2);
    expect(cues[1].start).toBe(4);
    expect(cues[0].text).toBe("word0 word1 word2 word3 word4");
  });
  it("falls back to an even timeline after text edits invalidate measured words", () => {
    const cues = captionCues(
      {
        id: "a",
        start: 10,
        end: 12,
        text: "New words",
        words: [{ word: "old", start: 10.8, end: 11 }],
      },
      "studio",
    );
    expect(cues[0]).toMatchObject({ start: 10, end: 12, text: "New words" });
  });
  it("does not generate empty captions", () => {
    expect(
      captionCues({ id: "a", start: 0, end: 5, text: "   " }, "studio"),
    ).toEqual([]);
  });
  it("does not show a previous exchange across a long pause", () => {
    const cues = captionCues({
      id: "pause", start: 6, end: 23, text: "You know what I am saying",
      words: [
        { word: "You", start: 8.7, end: 8.8 },
        { word: "know", start: 8.8, end: 9 },
        { word: "what", start: 9, end: 9.3 },
        { word: "I", start: 9.3, end: 9.4 },
        { word: "am", start: 9.4, end: 9.56 },
        { word: "saying", start: 21.53, end: 21.8 },
      ],
    }, "studio");
    expect(cues).toHaveLength(2);
    expect(cues[0].end).toBeCloseTo(9.64);
    expect(cues[1].start).toBe(21.53);
    expect(cues.some((cue) => cue.start <= 15 && cue.end > 15)).toBe(false);
  });
  it("retains measured timing when tokenizer spacing differs around punctuation", () => {
    const cues = captionCues({
      id: "number", start: 0, end: 8, text: "3-4!",
      words: [{ word: "3", start: 5, end: 5.2 }, { word: " -4!", start: 5.2, end: 5.6 }],
    }, "studio");
    expect(cues[0].start).toBe(5);
    expect(cues[0].end).toBeCloseTo(5.68);
  });
  it("limits how far ahead a measured caption group can reveal words", () => {
    const cues = captionCues({
      id: "slow", start: 0, end: 8, text: "one two three four",
      words: [0, 1, 2, 3].map((i) => ({word: ["one", "two", "three", "four"][i], start: i * 2, end: i * 2 + 1.5})),
    }, "studio");
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe("one two");
    expect(cues[1].start).toBe(4);
  });
  it("does not overlap adjacent caption groups with the trailing hold", () => {
    const words = Array.from({length: 10}, (_, i) => ({word: `w${i}`, start: i * 0.1, end: (i + 1) * 0.1}));
    const cues = captionCues({id: "fast", start: 0, end: 2, text: words.map(w => w.word).join(" "), words}, "highlight");
    expect(cues).toHaveLength(2);
    expect(cues[0].end).toBe(cues[1].start);
  });
});

describe("short-form caption pacing", () => {
  const words = Array.from({ length: 12 }, (_, i) => ({ word: `word${i}`, start: 2 + i * .4, end: 2.3 + i * .4 }));
  const segment = { id: "pacing", start: 0, end: 9, text: words.map(w => w.word).join(" "), words };
  it("shows exactly one measured word per cue without revealing the next", () => {
    const cues = captionCues(segment, "pop");
    expect(cues).toHaveLength(12);
    cues.forEach((cue, i) => {
      expect(cue.start).toBe(words[i].start);
      expect(cue.words).toHaveLength(1);
      expect(cue.end).toBeLessThanOrEqual(words[i+1]?.start ?? segment.end);
    });
  });
  it("caps short phrases at the selected duration without dropping words", () => {
    for (const captionDuration of [1, 1.5, 2]) {
      const cues = captionCues(segment, "punch", { captionMode: "short", captionDuration });
      expect(cues.map(c => c.text).join(" ")).toBe(segment.text);
      expect(cues.every(c => c.end-c.start <= captionDuration + .0001)).toBe(true);
    }
  });
  it("supports one-word pacing for an existing visual preset", () => {
    expect(captionCues(segment, "studio", { captionMode: "word" })).toHaveLength(12);
    expect(captionCues(segment, "studio")).toHaveLength(2);
  });
});
