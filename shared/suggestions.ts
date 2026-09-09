import { z } from "zod";
import { cloudProviders } from "./ai-providers.js";
const interestSchema = z.enum(["interesting", "funny", "educational", "story", "surprising", "debate", "emotional", "reactions", "quotes"]);
export const suggestionOptionsSchema = z.object({
  provider: z.enum(["local", ...cloudProviders]).default("local"),
  outputFormat: z.enum(["auto", "json_schema", "json_object"]).default("auto"),
  model: z.string().trim().max(120).regex(/^[a-zA-Z0-9_./:@-]*$/, "Use a model ID from your provider.").default(""),
  maxRequests: z.number().int().min(1).max(100).default(20),
  maxDuration: z.number().finite().min(20).max(100).default(60),
  minDuration: z.number().finite().min(3).max(20).default(5),
  maxPause: z.number().finite().min(2).max(30).default(15),
  interests: z.array(interestSchema).min(1).max(9).default(["interesting", "funny", "story", "reactions"]),
  guidance: z.string().trim().max(600).default(""),
  strictness: z.enum(["discovery", "reviewed", "strict"]).default("discovery"),
  count: z.number().int().min(1).max(30).default(25),
}).refine(o => !["openai", "anthropic"].includes(o.provider) || o.outputFormat !== "json_object", "This provider requires JSON schema output.").refine(o => o.minDuration <= o.maxDuration, "Minimum length must not exceed maximum length.");
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
export const aiUsageSchema = z.object({
  provider: z.enum(cloudProviders), model: z.string().max(120),
  requests: z.number().int().nonnegative(), inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(), limitReached: z.boolean(),
});
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
  usage: aiUsageSchema.optional(),
  requested: z.number().int().min(1).max(30).optional(),
  candidates: z.array(suggestionSchema).max(30),
});
export type SuggestionReview = z.infer<typeof suggestionReviewSchema>;
export type ClipSuggestion = z.infer<typeof suggestionSchema>;
export type SuggestionFocus = SuggestionReview["focus"];
