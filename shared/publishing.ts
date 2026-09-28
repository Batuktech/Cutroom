import { z } from "zod";
import { cloudProviders } from "./ai-providers.js";

export const socialPlatforms = ["youtube", "instagram", "tiktok"] as const;
export type SocialPlatform = typeof socialPlatforms[number];
export const channelIdSchema = z.string().min(1).max(150).regex(/^[a-zA-Z0-9_-]+$/);
export const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const copySchema = z.object({
  title: z.string().trim().min(2).max(90),
  description: z.string().trim().min(1).max(1800),
  hashtags: z.array(z.string().regex(/^#[\p{L}\p{N}_]+$/u).max(60)).max(5),
});
export const socialCopySchema = z.object({ youtube: copySchema, instagram: copySchema, tiktok: copySchema });
export type SocialCopy = z.infer<typeof socialCopySchema>;
export const savedSocialCopySchema = z.object({
  sourceHash: hashSchema, createdAt: z.string().datetime(), copy: socialCopySchema,
  provider: z.enum(["local", "manual", ...cloudProviders]),
});
export type SavedSocialCopy = z.infer<typeof savedSocialCopySchema>;
export const copyOptionsSchema = z.object({
  provider: z.enum(["local", ...cloudProviders]).default("local"),
  model: z.string().trim().max(120).regex(/^[a-zA-Z0-9_./:@-]*$/).default(""),
  outputFormat: z.enum(["auto", "json_schema", "json_object"]).default("auto"),
  language: z.string().trim().min(1).max(60).default("Same language as the transcript"),
  sourceHash: hashSchema,
  cloudConsent: z.boolean().default(false), cloudDestination: z.string().max(2048).optional(),
}).refine(o => !["openai", "anthropic"].includes(o.provider) || o.outputFormat !== "json_object", "This provider requires JSON schema output.");
export type CopyOptions = z.infer<typeof copyOptionsSchema>;
export const channelSettingsSchema = z.discriminatedUnion("__type", [
  z.object({ __type: z.literal("youtube"), type: z.enum(["public", "private", "unlisted"]), selfDeclaredMadeForKids: z.enum(["yes", "no"]) }),
  z.object({ __type: z.literal("instagram"), post_type: z.literal("post") }),
  z.object({ __type: z.literal("instagram-standalone"), post_type: z.literal("post") }),
  z.object({ __type: z.literal("tiktok"), privacy_level: z.enum(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"]),
    duet: z.boolean(), stitch: z.boolean(), comment: z.boolean(),
    brand_content_toggle: z.boolean(), brand_organic_toggle: z.boolean(), video_made_with_ai: z.boolean(),
    autoAddMusic: z.literal("no"), content_posting_method: z.literal("DIRECT_POST"),
  }),
]);
export type ChannelSettings = z.infer<typeof channelSettingsSchema>;
export function initialChannelSettings(identifier: ChannelSettings["__type"]): ChannelSettings {
  if (identifier === "youtube") return { __type: identifier, type: "private", selfDeclaredMadeForKids: "no" };
  if (identifier === "tiktok") return { __type: identifier, privacy_level: "SELF_ONLY", duet: false, stitch: false, comment: false,
    autoAddMusic: "no", brand_content_toggle: false, brand_organic_toggle: false, video_made_with_ai: false, content_posting_method: "DIRECT_POST" };
  return { __type: identifier, post_type: "post" };
}
export const publishRequestSchema = z.object({
  requestId: z.string().uuid(), sourceHash: hashSchema, destination: z.string().max(2048),
  mode: z.enum(["draft", "schedule", "now"]), date: z.string().datetime().optional(),
  quality: z.enum(["720", "1080"]).default("1080"), copy: socialCopySchema,
  channels: z.array(z.object({ id: channelIdSchema, settings: channelSettingsSchema })).min(1).max(10),
  uploadConsent: z.literal(true),
}).refine(r => r.mode !== "schedule" || !!r.date, "Choose a scheduled date.")
  .refine(r => new Set(r.channels.map(c => c.id)).size === r.channels.length, "Choose each channel once.");
export type PublishRequest = z.infer<typeof publishRequestSchema>;
export const publicationSchema = z.object({
  id: z.string().uuid(), clipId: z.string().uuid(), sourceHash: hashSchema,
  destination: z.string().max(2048), createdAt: z.string().datetime(),
  mode: z.enum(["draft", "schedule", "now"]), date: z.string().datetime().optional(),
  exportId: z.string().uuid().optional(),
  channels: z.array(z.object({ id: channelIdSchema, name: z.string().max(200),
    platform: z.enum(socialPlatforms), state: z.enum(["pending", "submitting", "submitted", "failed", "unknown", "cancelled"]),
    postId: channelIdSchema.optional(), message: z.string().max(500).optional(),
  })).max(10),
});
export type Publication = z.infer<typeof publicationSchema>;
export interface PostizStatus { configured: boolean; source: "session" | "environment" | null; destination: string; }
export interface PostizChannel { id: string; name: string; identifier: ChannelSettings["__type"]; disabled: boolean; }
export interface PublishPreparation { sourceHash: string; copy: SocialCopy; generated: boolean; publications: Publication[]; }
export const platformOf = (identifier: string): SocialPlatform => identifier === "instagram-standalone" ? "instagram" : identifier as SocialPlatform;
export function postContent(copy: SocialCopy[SocialPlatform]) {
  return [copy.description, copy.hashtags.join(" ")].filter(Boolean).join("\n\n");
}
