import { describe, expect, it } from "vitest";
import fixtures from "../shared/clip-quality-fixtures.json" with { type: "json" };
import { assessmentInputSchema, autopilotEligible } from "../shared/clip-quality.js";
import { groundAssessment, reviewContext } from "./clip-quality.js";
import { validateSuggestions } from "./suggestion-domain.js";
import { rankCandidates } from "../shared/streams.js";
const segments = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, start: i * 3, end: i * 3 + 3, text: `Synthetic evidence for segment ${i}.` }));
const assessment = (index: number) => groundAssessment(assessmentInputSchema.parse(fixtures[index]), 0, 2, segments)!;

describe("grounded editorial scoring", () => {
  it.each(fixtures)("$name", fixture => {
    const result = groundAssessment(assessmentInputSchema.parse(fixture), 0, 2, segments)!;
    expect(result.total).toBe(fixture.total);
    expect(result.source).toBe("transcript");
    for (const e of result.evidence) expect(e.quote).toBe(segments[e.segment].text);
  });
  it("rejects fabricated evidence and invalid score shapes", () => {
    const input = assessmentInputSchema.parse(fixtures[0]);
    expect(groundAssessment({ ...input, anchors: { ...input.anchors, peak: 900 } }, 0, 2, segments)).toBeUndefined();
    expect(assessmentInputSchema.safeParse({ ...input, scores: { ...input.scores, hook: 5 } }).success).toBe(false);
    expect(assessmentInputSchema.safeParse({ ...input, scores: { ...input.scores, emotion: true } }).success).toBe(false);
  });
  it("requires a reviewed hook, payoff and clarity rather than intensity or requested quantity", () => {
    expect(autopilotEligible({ verdict: "reviewed", assessment: assessment(0) })).toBe(true);
    expect(autopilotEligible({ verdict: "reviewed", assessment: assessment(1) })).toBe(false);
    expect(autopilotEligible({ verdict: "reviewed", assessment: assessment(4) })).toBe(false);
    expect(autopilotEligible({ verdict: "needs-review", assessment: assessment(0) })).toBe(false);
    expect(autopilotEligible({ verdict: "reviewed" })).toBe(false);
  });
  it("preserves scored evidence and uses it to choose the final shortlist", () => {
    const proposal = { first: 0, last: 2, title: "A quiet insight", reason: "A clear resolution", weakness: "", quote: segments[0].text, strength: 2, verdict: "reviewed" as const, assessment: assessmentInputSchema.parse(fixtures[0]) };
    const loud = { ...proposal, first: 5, last: 7, title: "Loud reaction", quote: segments[5].text, strength: 3,
      assessment: { scores: fixtures[1].scores, anchors: { hook: 5, peak: 6, payoff: -1, contrast: 5 } } };
    const results = validateSuggestions([loud, proposal], segments, 30, 20, 1);
    expect(results).toHaveLength(1); expect(results[0].title).toBe("A quiet insight");
    expect(results[0].assessment?.total).toBe(76); expect(results[0].strength).toBe(2);
  });
  it("does not replace stronger clips with weaker ones to fill a part quota", () => {
    const best = { part: 0, order: 0, verdict: "reviewed" as const, assessment: assessment(0), key: "best" };
    const second = { ...best, order: 1, key: "second" };
    const weak = { ...best, part: 1, assessment: assessment(1), key: "weak" };
    expect(rankCandidates([weak, best, second], 2).map(c => c.key)).toEqual(["best", "second"]);
  });
  it("deduplicates repeated wording across parts", () => {
    const a = { part: 0, order: 0, verdict: "reviewed" as const, assessment: assessment(0), quote: "One original insight stated in precisely these same words." };
    expect(rankCandidates([a, { ...a, part: 1 }], 5)).toHaveLength(1);
  });
  it("bounds surrounding context without omitting the proposal", () => {
    expect(reviewContext(2, 4, segments)).toEqual({ first: 0, last: 6 });
    expect(reviewContext(2, 4, segments, 1)).toEqual({ first: 2, last: 4 });
  });
});
