import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Project, Segment } from "../shared/types.js";
import type { ClipSuggestion } from "../shared/suggestions.js";
import { suggestionDiagnosticsSchema, aiUsageSchema } from "../shared/suggestions.js";
import { suggestionBounds } from "../shared/suggestion-bounds.js";

export function transcriptHash(project: Pick<Project, "transcript" | "duration">) {
  return createHash("sha256").update(JSON.stringify({ duration: project.duration, segments: project.transcript })).digest("hex");
}

export const proposalSchema = z.object({
  first: z.number().int().nonnegative(), last: z.number().int().nonnegative(),
  title: z.string().trim().min(1).max(120), reason: z.string().trim().min(1).max(500),
  weakness: z.string().max(500), quote: z.string().trim().min(1).max(300),
  verdict: z.enum(["suggested", "reviewed", "needs-review"]).optional(),
  strength: z.number().int().min(1).max(3),
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
  for (const candidate of raw.toSorted((a, b) => b.strength - a.strength)) {
    if (candidate.first < 0 || candidate.last < candidate.first || candidate.last >= segments.length) continue;
    const passage = segments.slice(candidate.first, candidate.last + 1);
    const start = passage[0].start, end = passage.at(-1)!.end;
    const text = passage.map((s) => s.text).join(" ");
    if (end - start < bounds.min || end - start > bounds.max || end > duration || start < 0) continue;
    if (text.trim().split(/\s+/).length < 4 || !normalize(text).includes(normalize(candidate.quote))) continue;
    if (passage.some((s, i) => i > 0 && s.start - passage[i-1].end > maxPause)) continue;
    if (chosen.some((c) => Math.max(0, Math.min(c.end, end) - Math.max(c.start, start)) >= Math.min(c.end-c.start, end-start) * .25 || normalize(c.quote) === normalize(candidate.quote))) continue;
    chosen.push({ id: randomUUID(), start, end, title: candidate.title, reason: candidate.reason, weakness: candidate.weakness, quote: candidate.quote, ...(candidate.verdict ? { verdict: candidate.verdict } : {}) });
    if (chosen.length >= count) break;
  }
  return chosen;
}
