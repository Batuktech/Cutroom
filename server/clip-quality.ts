import { z } from "zod";
import type { Segment } from "../shared/types.js";
import { anchorKeys, assessmentInputSchema, editorialTotal, type Assessment, type AssessmentInput } from "../shared/clip-quality.js";

export const editorialReviewSchema = z.object({
  first: z.number().int().nonnegative(), last: z.number().int().nonnegative(),
  context: z.boolean(), ending: z.boolean(), appeal: z.boolean(), clarity: z.boolean(),
  reason: z.string().trim().min(1).max(500), weakness: z.string().max(500), assessment: assessmentInputSchema,
});
export function groundAssessment(input: AssessmentInput, first: number, last: number, segments: Segment[]): Assessment | undefined {
  const scores = { ...input.scores }, a = input.anchors;
  if (anchorKeys.some(key => a[key] !== -1 && (a[key] < first || a[key] > last))) return;
  if (a.hook === -1) scores.hook = 0;
  else if (segments[a.hook].start - segments[first].start > 5) scores.hook = Math.min(scores.hook, 1);
  if (a.payoff === -1) scores.payoff = 0;
  else if (segments[last].end - segments[a.payoff].end > 5) scores.payoff = Math.min(scores.payoff, 2);
  if (a.peak === -1) { scores.novelty = 0; scores.emotion = 0; scores.value = 0; }
  if (a.contrast === -1 || a.contrast >= a.peak) scores.emotion = 0;
  const evidence = anchorKeys.filter(role => a[role] !== -1).map(role => {
    const segment = a[role], s = segments[segment];
    return { role, segment, start: s.start, end: s.end, quote: s.text.trim().slice(0, 240) };
  });
  if (evidence.some(e => !e.quote)) return;
  return { version: 1, source: "transcript", scores, total: editorialTotal(scores), evidence };
}

export function reviewContext(first: number, last: number, segments: Segment[], budget = 14000) {
  let start = first, end = last;
  let size = JSON.stringify(segments.slice(first, last + 1)).length;
  for (let n = 1; n <= 2; n++) for (const index of [first - n, last + n]) {
    if (index < 0 || index >= segments.length) continue;
    const extra = JSON.stringify(segments[index]).length;
    if (size + extra > budget) continue;
    if (index === start - 1) { start = index; size += extra; }
    if (index === end + 1) { end = index; size += extra; }
  }
  return { first: start, last: end };
}
