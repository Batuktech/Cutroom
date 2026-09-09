import { describe, expect, it } from "vitest";
import { transcriptHash, validateSuggestions } from "./suggestion-domain.js";
import type { Segment } from "../shared/types.js";

const segments: Segment[] = [
  { id: "a", start: 0, end: 10, text: "Start with one useful idea and explain the problem clearly before giving your answer to the audience." },
  { id: "b", start: 10, end: 25, text: "Then show a practical example so the viewer can understand how to apply that idea in their own work." },
  { id: "c", start: 26, end: 40, text: "Finish the explanation with a clear conclusion and give people a concrete action that they can try today." },
];
const proposal = { first: 0, last: 1, title: "One useful idea", quote: "Start with one useful idea", reason: "A focused explanation with a practical example.", weakness: "Review the delivery.", strength: 2 };
describe("Qwen suggestion validation", () => {
  it("uses source bounds and accepts an exact grounded quote", () => {
    expect(validateSuggestions([proposal], segments, 40, 35)[0]).toMatchObject({ start: 0, end: 25, quote: proposal.quote });
  });
  it("rejects fabricated quotes, invalid ranges, fragments, and out-of-bounds clips", () => {
    for (const candidate of [
      { ...proposal, quote: "A guaranteed viral video" }, { ...proposal, first: 2, last: 1 },
      { ...proposal, last: 10 }, { ...proposal, first: -1 },
    ]) expect(validateSuggestions([candidate], segments, 40, 35)).toEqual([]);
    expect(validateSuggestions([proposal], segments, 40, 20)).toEqual([]);
    expect(validateSuggestions([proposal], segments, 20, 35)).toEqual([]);
  });
  it("rejects long silence and removes overlapping candidates", () => {
    expect(validateSuggestions([proposal], [segments[0], { ...segments[1], start: 18 }], 40, 35, 25, 5, 4)).toEqual([]);
    expect(validateSuggestions([proposal, { ...proposal, last: 2 }], segments, 40, 35)).toHaveLength(1);
  });
  it("changes the fingerprint when text, source timing, or word timing changes", () => {
    const original = { duration: 40, transcript: segments };
    for (const change of [
      { ...original, duration: 41 },
      { ...original, transcript: [{ ...segments[0], text: "An edited caption" }, ...segments.slice(1)] },
      { ...original, transcript: [{ ...segments[0], words: [{ start: 1, end: 2, word: "Start" }] }, ...segments.slice(1)] },
    ]) expect(transcriptHash(change)).not.toBe(transcriptHash(original));
  });
});

it("can return thirty grounded non-overlapping candidates and honor a smaller requested count", () => {
  const sources = Array.from({ length: 35 }, (_, i) => ({ id: String(i), start: i*30, end: i*30+25, text: `Topic number ${i} has a useful explanation with enough detail to stand alone and a complete conclusion that the audience can understand without earlier context.` }));
  const proposals = sources.map((_s, i) => ({ ...proposal, first: i, last: i, quote: `Topic number ${i}` }));
  expect(validateSuggestions(proposals, sources, 1050, 35, 30)).toHaveLength(30);
  expect(validateSuggestions(proposals, sources, 1050, 35, 20)).toHaveLength(20);
});


it("uses an exact maximum, accepts shorter clips, and honors minimum and pause filters", () => {
  const short = { ...proposal, last: 0 };
  expect(validateSuggestions([short], segments, 40, 100)).toHaveLength(1);
  expect(validateSuggestions([short], segments, 40, 20)).toHaveLength(1);
  expect(validateSuggestions([proposal], segments, 40, 20)).toEqual([]);
  expect(validateSuggestions([short], segments, 40, 100, 25, 15)).toEqual([]);
  expect(validateSuggestions([proposal], [segments[0], { ...segments[1], start: 18 }], 40, 100, 25, 5, 15)).toHaveLength(1);
});
