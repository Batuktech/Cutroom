import { z } from "zod";
import { qualityValue, type Assessment } from "./clip-quality.js";

export const autopostPlatforms = ["youtube", "tiktok"] as const;
export type AutopostPlatform = typeof autopostPlatforms[number];
export const STREAM_PART_SECONDS = 3600;
export const streamLanguages = ["auto", "en", "mn", "es", "fr", "de", "ja", "ko", "zh", "ru", "pt", "it", "ar", "hi", "tr"] as const;

export const streamRequestSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  language: z.enum(streamLanguages).default("auto"),
  topClips: z.number().int().min(1).max(10).default(5),
  visibility: z.enum(["public", "private"]).default("public"),
  platforms: z.array(z.enum(autopostPlatforms)).max(2).default([]),
  interests: z.array(z.enum(["interesting", "funny", "educational", "story", "surprising", "debate", "emotional", "reactions", "quotes"])).min(1).max(9)
    .default(["interesting", "funny", "story", "reactions"]),
  // Publishing is an outward action; each stream run needs explicit consent.
  publishConsent: z.boolean().default(false),
}).refine(r => !r.platforms.length || r.publishConsent, "Confirm automatic publishing to the selected accounts.")
  .refine(r => new Set(r.platforms).size === r.platforms.length, "Choose each platform once.");
export type StreamRequest = z.infer<typeof streamRequestSchema>;

export type StreamPartStage = "queued" | "downloading" | "transcribing" | "analyzing" | "ready" | "failed" | "cancelled";
export interface StreamPart {
  index: number;
  start: number;
  end: number;
  stage: StreamPartStage;
  projectId?: string;
  jobId?: string;
  candidates?: number;
  message?: string;
}
export type AutopostState = "pending" | "submitting" | "submitted" | "failed" | "unknown" | "skipped";
export interface AutopostTarget {
  platform: AutopostPlatform;
  state: AutopostState;
  remoteId?: string;
  url?: string;
  message?: string;
}
export interface AutopostClip {
  id: string;
  projectId: string;
  clipId?: string;
  part: number;
  start: number;
  end: number;
  title: string;
  exportId?: string;
  targets: AutopostTarget[];
}
export type StreamStatus = "planning" | "processing" | "publishing" | "completed" | "failed" | "cancelled";
export interface StreamRecord {
  id: string;
  url: string;
  title: string;
  duration?: number;
  createdAt: string;
  updatedAt: string;
  status: StreamStatus;
  message?: string;
  settings: Omit<StreamRequest, "url" | "publishConsent">;
  jobId?: string;
  parts: StreamPart[];
  clips: AutopostClip[];
}
export interface ProjectStream { id: string; part: number; parts: number; title: string }
export const projectStreamSchema = z.object({
  id: z.string().uuid(), part: z.number().int().min(1).max(24), parts: z.number().int().min(1).max(24), title: z.string().max(200),
});

export interface SocialAccountStatus {
  platform: AutopostPlatform;
  appConfigured: boolean;
  appSource: "saved" | "environment" | null;
  clientHint?: string;
  connected: boolean;
  account?: string;
  redirectUri: string;
}

/** Plans consecutive one-hour parts; a trailing sliver under a minute joins the previous part. */
export function streamParts(duration: number) {
  if (!Number.isFinite(duration) || duration < 1) throw new Error("The stream length could not be read.");
  if (duration > 24 * STREAM_PART_SECONDS) throw new Error("Streams up to 24 hours are supported.");
  const parts: { start: number; end: number }[] = [];
  for (let start = 0; start < duration; start += STREAM_PART_SECONDS)
    parts.push({ start, end: Math.min(duration, start + STREAM_PART_SECONDS) });
  const last = parts.at(-1)!;
  // Parts are capped at three hours elsewhere; merging only a short remainder stays well inside that.
  if (parts.length > 1 && last.end - last.start < 60) { parts.pop(); parts.at(-1)!.end = duration; }
  return parts;
}

type Ranked = { part: number; order: number; verdict?: "suggested" | "reviewed" | "needs-review"; assessment?: Assessment; strength?: number; quote?: string };
const verdictRank = { reviewed: 0, suggested: 1, "needs-review": 2 } as const;
/**
 * Scored reviews compete across the whole stream. Legacy reviews keep their original
 * round-robin ordering; scores are never invented for older saved results.
 */
export function rankCandidates<T extends Ranked>(candidates: T[], limit: number): T[] {
  if (limit <= 0) return [];
  const rank = (c: T) => verdictRank[c.verdict ?? "suggested"];
  if (candidates.some(c => c.assessment)) {
    const sorted = candidates.toSorted((a, b) => rank(a) - rank(b) || qualityValue(b) - qualityValue(a) || a.order - b.order || a.part - b.part);
    const chosen: T[] = [];
    const words = (s: string) => new Set(s.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
    for (const c of sorted) {
      const a = words(c.quote ?? "");
      if (a.size >= 5 && chosen.some(p => {
        const b = words(p.quote ?? ""), intersection = [...a].filter(w => b.has(w)).length;
        return (c.quote ?? "").trim().toLocaleLowerCase() === (p.quote ?? "").trim().toLocaleLowerCase() ||
          (Math.min(a.size, b.size) >= 12 && intersection / new Set([...a, ...b]).size > .9);
      })) continue;
      chosen.push(c);
      if (chosen.length >= limit) break;
    }
    return chosen;
  }
  const sorted = candidates.toSorted((a, b) => rank(a) - rank(b) || a.order - b.order || a.part - b.part);
  const chosen: T[] = [];
  for (const tier of [0, 1, 2]) {
    const byPart = new Map<number, T[]>();
    for (const c of sorted.filter(c => rank(c) === tier)) byPart.set(c.part, [...(byPart.get(c.part) ?? []), c]);
    const queues = [...byPart.entries()].toSorted(([a], [b]) => a - b).map(([, list]) => list);
    while (chosen.length < limit && queues.some(q => q.length))
      for (const queue of queues) { const next = queue.shift(); if (next && chosen.length < limit) chosen.push(next); }
  }
  return chosen;
}
