import { afterEach, describe, expect, it, vi } from "vitest";
import { PostizClient, PostizCredentials, postizDestination } from "./postiz.js";
import { checkSchedule, checkSettings, postSettings } from "./publishing.js";
import { copyOptionsSchema, initialChannelSettings, publishRequestSchema, socialCopySchema } from "../shared/publishing.js";
import { fallbackCopy, clipSourceHash } from "./social-copy.js";
import type { Clip, Project } from "../shared/types.js";

afterEach(() => vi.unstubAllGlobals());
const clip = { id: "00000000-0000-4000-8000-000000000002", title: "Synthetic source", start: 0, end: 10, aspect: "9:16", status: "draft" } as Clip;
const copy = fallbackCopy(clip);
const request = () => ({ requestId: "00000000-0000-4000-8000-000000000001", sourceHash: "a".repeat(64), destination: "https://api.postiz.com/public/v1", mode: "draft", copy,
  channels: [{ id: "channel", settings: initialChannelSettings("youtube") }], uploadConsent: true });
describe("Postiz publishing boundaries", () => {
  it("validates consent, duplicate channels, metadata and provider options", () => {
    expect(publishRequestSchema.safeParse(request()).success).toBe(true);
    expect(publishRequestSchema.safeParse({ ...request(), uploadConsent: false }).success).toBe(false);
    expect(publishRequestSchema.safeParse({ ...request(), channels: [...request().channels, ...request().channels] }).success).toBe(false);
    expect(publishRequestSchema.safeParse({ ...request(), mode: "schedule" }).success).toBe(false);
    expect(socialCopySchema.safeParse({ ...copy, tiktok: { ...copy.tiktok, hashtags: ["#bad tag"] } }).success).toBe(false);
    expect(copyOptionsSchema.safeParse({ sourceHash: "a".repeat(64), provider: "openai", outputFormat: "json_object" }).success).toBe(false);
    expect(() => checkSchedule({ mode: "schedule", date: new Date().toISOString() })).toThrow("future");
  });
  it("keeps credentials private and accepts explicit local Postiz configuration", () => {
    const credentials = new PostizCredentials({});
    expect(credentials.status().configured).toBe(false);
    expect(() => credentials.client()).toThrow("API key");
    credentials.set({ apiKey: "synthetic-secret" });
    expect(JSON.stringify(credentials.status())).not.toContain("synthetic-secret");
    expect(credentials.forget().configured).toBe(false);
    expect(postizDestination({ CUTROOM_POSTIZ_API_URL: "http://localhost:4007/api/public/v1/" })).toBe("http://localhost:4007/api/public/v1");
    for (const url of ["https://user:secret@example.com/public/v1", "http://example.com/public/v1", "https://example.com/public/v1?token=secret", "https://example.com/wrong"]) {
      expect(() => postizDestination({ CUTROOM_POSTIZ_API_URL: url })).toThrow();
    }
  });
  it("sets platform fields from validated copy and refuses unsupported live enums", () => {
    const r = publishRequestSchema.parse(request());
    expect(postSettings(r, r.channels[0])).toMatchObject({ title: "Synthetic source", type: "private", tags: [] });
    expect(initialChannelSettings("instagram-standalone")).toEqual({ __type: "instagram-standalone", post_type: "post" });
    expect(() => checkSettings({ type: "public" }, { properties: { type: { enum: ["private"] } } })).toThrow("unsupported");
    expect(() => checkSettings({}, { properties: { extra: {} }, required: ["extra"] })).toThrow("additional settings");
  });
  it("fingerprints render edits and transcripts, ignoring copy and export status", () => {
    const p = { filename: "source.mp4", transcript: [] } as unknown as Project;
    const hash = clipSourceHash(p, clip);
    expect(clipSourceHash(p, { ...clip, status: "exported", socialCopy: { copy, sourceHash: hash, provider: "manual", createdAt: new Date().toISOString() } })).toBe(hash);
    expect(clipSourceHash(p, { ...clip, cropX: 25 })).not.toBe(hash);
    expect(clipSourceHash({ ...p, transcript: [{ id: "s", start: 0, end: 1, text: "Changed" }] }, clip)).not.toBe(hash);
  });
  it("uses raw API authorization, strips unsupported channels and rejects redirects", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json([{ id: "one", name: "Synthetic", identifier: "youtube", disabled: false }, { id: "two", name: "Other", identifier: "x", disabled: false }]));
    vi.stubGlobal("fetch", fetcher);
    const client = new PostizClient("https://api.postiz.com/public/v1", "synthetic-secret");
    expect(await client.channels()).toHaveLength(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ headers: { Authorization: "synthetic-secret" }, redirect: "error" });
  });
  it("redacts upstream failures, malformed results and oversized responses", async () => {
    const client = new PostizClient("https://api.postiz.com/public/v1", "synthetic-secret");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("synthetic-secret")));
    await expect(client.channels()).rejects.toThrow("could not confirm");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("synthetic-secret", { status: 401 })));
    await expect(client.channels()).rejects.toThrow("HTTP 401");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x".repeat(1_000_001))));
    await expect(client.channels()).rejects.toThrow("could not confirm");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([{ postId: "remote", integration: "other" }])));
    await expect(client.create({}, "one")).rejects.toThrow("unreadable post receipt");
  });
});
