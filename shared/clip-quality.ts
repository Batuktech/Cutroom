import { z } from "zod";
import rubric from "./clip-rubric.json" with { type: "json" };

export { rubric };
export const scoreKeys = ["hook", "payoff", "clarity", "novelty", "emotion", "value"] as const;
export const anchorKeys = ["hook", "peak", "payoff", "contrast"] as const;
const score = z.number().int().min(0).max(4);
export const editorialScoresSchema = z.object({ hook: score, payoff: score, clarity: score, novelty: score, emotion: score, value: score });
export const anchorsSchema = z.object({ hook: z.number().int().min(-1), peak: z.number().int().min(-1), payoff: z.number().int().min(-1), contrast: z.number().int().min(-1) });
export const assessmentInputSchema = z.object({ scores: editorialScoresSchema, anchors: anchorsSchema });
export const assessmentSchema = z.object({
  version: z.literal(1), source: z.literal("transcript"), total: z.number().int().min(0).max(100),
  scores: editorialScoresSchema,
  evidence: z.array(z.object({ role: z.enum(anchorKeys), segment: z.number().int().nonnegative(),
    start: z.number().finite().nonnegative(), end: z.number().finite().positive(), quote: z.string().min(1).max(240) })).max(4),
});
export type Assessment = z.infer<typeof assessmentSchema>;
export type AssessmentInput = z.infer<typeof assessmentInputSchema>;
export function editorialTotal(scores: Assessment["scores"]) {
  const total = Math.round(scoreKeys.reduce((sum, key) => sum + scores[key] * rubric.weights[key] / 4, 0));
  return Math.min(scores.hook < 2 || scores.payoff < 2 || scores.clarity < 2 ? 49 : 100, total);
}
export function qualityValue(c: { assessment?: Assessment; strength?: number }) {
  return c.assessment ? editorialTotal(c.assessment.scores) : (c.strength ?? 1) * 20;
}
export function autopilotEligible(c: { verdict?: string; assessment?: Assessment }) {
  return c.verdict === "reviewed" && !!c.assessment && qualityValue(c) >= 60 &&
    ["hook", "peak", "payoff"].every(role => c.assessment!.evidence.some(e => e.role === role)) &&
    c.assessment.scores.hook >= 2 && c.assessment.scores.payoff >= 2 && c.assessment.scores.clarity >= 2;
}
export const structuredObject = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
export const editorialReviewFormat = structuredObject({
  first: { type: "integer" }, last: { type: "integer" },
  context: { type: "boolean" }, ending: { type: "boolean" }, appeal: { type: "boolean" }, clarity: { type: "boolean" },
  reason: { type: "string" }, weakness: { type: "string" },
  assessment: structuredObject({ scores: structuredObject(Object.fromEntries(scoreKeys.map(k => [k, { type: "integer", enum: [0, 1, 2, 3, 4] }]))),
    anchors: structuredObject(Object.fromEntries(anchorKeys.map(k => [k, { type: "integer" }]))) }),
});
