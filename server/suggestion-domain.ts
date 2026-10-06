import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Project, Segment } from "../shared/types.js";
import type { ClipSuggestion } from "../shared/suggestions.js";
import { suggestionDiagnosticsSchema, aiUsageSchema } from "../shared/suggestions.js";
import { suggestionBounds } from "../shared/suggestion-bounds.js";
import { assessmentInputSchema, qualityValue } from "../shared/clip-quality.js";
import { groundAssessment } from "./clip-quality.js";

export function transcriptHash(project: Pick<Project, "transcript" | "duration">) {
  return createHash("sha256").update(JSON.stringify({ duration: project.duration, segments: project.transcript })).digest("hex");
}

export const proposalSchema = z.object({
  first: z.number().int().nonnegative(), last: z.number().int().nonnegative(),
  title: z.string().trim().min(1).max(120), reason: z.string().trim().min(1).max(500),
  weakness: z.string().max(500), quote: z.string().trim().min(1).max(300),
  verdict: z.enum(["suggested", "reviewed", "needs-review"]).optional(),
  strength: z.number().int().min(1).max(3),
  assessment: assessmentInputSchema.optional(),
});
export const recognitionResultSchema = z.object({
  sections: z.number().int().positive(), reviewed: z.number().int().nonnegative(),
  candidates: z.array(proposalSchema).max(100),
  complete: z.boolean().optional(), scanned: z.number().int().nonnegative().optional(),
  diagnostics: suggestionDiagnosticsSchema.optional(),
  usage: aiUsageSchema.optional(),
});
const normalize = (value: string) => value.toLocaleLowerCase().replace(/\s+/g, " ").trim();

export function validateSuggestions(raw: z.infer<typeof proposalSchema>[], segments: Segment[], duration: number, target: number, count = 25, minDuration = 5, maxPause = 15): ClipSuggestion[] {
  const bounds = suggestionBounds(target, minDuration);
  const chosen: ClipSuggestion[] = [];
  const grounded: ClipSuggestion[] = [];
  for (const candidate of raw) {
    if (candidate.first < 0 || candidate.last < candidate.first || candidate.last >= segments.length) continue;
    const passage = segments.slice(candidate.first, candidate.last + 1);
    const start = passage[0].start, end = passage.at(-1)!.end;
    const text = passage.map((s) => s.text).join(" ");
    if (end - start < bounds.min || end - start > bounds.max || end > duration || start < 0) continue;
    if (text.trim().split(/\s+/).length < 4 || !normalize(text).includes(normalize(candidate.quote))) continue;
    if (passage.some((s, i) => i > 0 && s.start - passage[i-1].end > maxPause)) continue;
    const assessment = candidate.assessment && groundAssessment(candidate.assessment, candidate.first, candidate.last, segments);
    if (candidate.assessment && !assessment) continue;
    grounded.push({ id: randomUUID(), start, end, title: candidate.title, reason: candidate.reason, weakness: candidate.weakness,
      quote: candidate.quote, strength: candidate.strength, ...(assessment ? { assessment } : {}), ...(candidate.verdict ? { verdict: candidate.verdict } : {}) });
  }
  const tier = (c: ClipSuggestion) => c.verdict === "reviewed" ? 2 : c.verdict === "needs-review" ? 0 : 1;
  for (const candidate of grounded.toSorted((a, b) => tier(b) - tier(a) || qualityValue(b) - qualityValue(a) || a.start - b.start)) {
    if (chosen.some(c => Math.max(0, Math.min(c.end, candidate.end) - Math.max(c.start, candidate.start)) >= Math.min(c.end-c.start, candidate.end-candidate.start) * .25 || normalize(c.quote) === normalize(candidate.quote))) continue;
    chosen.push(candidate);
    if (chosen.length >= count) break;
  }
  return chosen;
}
