import { z } from "zod";
const interestSchema = z.enum(["interesting", "funny", "educational", "story", "surprising", "debate", "emotional", "reactions", "quotes"]);
export const suggestionOptionsSchema = z.object({
  maxDuration: z.number().finite().min(20).max(100).default(60),
  minDuration: z.number().finite().min(3).max(20).default(5),
  maxPause: z.number().finite().min(2).max(30).default(15),
  interests: z.array(interestSchema).min(1).max(9).default(["interesting", "funny", "story", "reactions"]),
  guidance: z.string().trim().max(600).default(""),
  strictness: z.enum(["discovery", "reviewed", "strict"]).default("discovery"),
  count: z.number().int().min(1).max(30).default(25),
}).refine(o => o.minDuration <= o.maxDuration, "Minimum length must not exceed maximum length.");
export const suggestionDiagnosticsSchema = z.object({
  proposed: z.number().int().nonnegative(), invalid: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(), rejected: z.number().int().nonnegative(),
  emptySections: z.number().int().nonnegative(),
  reasons: z.record(z.string().max(80), z.number().int().nonnegative()),
});

export const suggestionSchema = z.object({
  id: z.string().uuid(),
  start: z.number().finite().nonnegative(),
  end: z.number().finite().positive(),
  title: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(1).max(500),
  weakness: z.string().max(500),
  quote: z.string().trim().min(1).max(300),
  verdict: z.enum(["suggested", "reviewed", "needs-review"]).optional(),
}).refine((c) => c.end > c.start);
export const suggestionReviewSchema = z.object({
  id: z.string().uuid(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(),
  target: z.number().min(15).max(100),
  focus: z.enum(["interesting", "funny", "educational"]),
  sections: z.number().int().positive(),
  reviewed: z.number().int().nonnegative(),
  options: suggestionOptionsSchema.optional(),
  complete: z.boolean().optional(),
  scanned: z.number().int().nonnegative().optional(),
  diagnostics: suggestionDiagnosticsSchema.optional(),
  requested: z.number().int().min(1).max(30).optional(),
  candidates: z.array(suggestionSchema).max(30),
});
export type SuggestionReview = z.infer<typeof suggestionReviewSchema>;
export type ClipSuggestion = z.infer<typeof suggestionSchema>;
export type SuggestionFocus = SuggestionReview["focus"];
