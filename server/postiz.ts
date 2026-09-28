import { openAsBlob } from "node:fs";
import { lstat } from "node:fs/promises";
import { z } from "zod";
import { credentialSchema } from "./ai-credentials.js";
import { channelIdSchema, type PostizChannel, type PostizStatus } from "../shared/publishing.js";

export function postizDestination(environment: NodeJS.ProcessEnv = process.env) {
  try {
    const url = new URL(environment.CUTROOM_POSTIZ_API_URL || "https://api.postiz.com/public/v1");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) || url.username || url.password || url.search || url.hash) throw new Error();
    if (!url.pathname.replace(/\/+$/, "").endsWith("/public/v1")) throw new Error();
    return url.href.replace(/\/+$/, "");
  } catch { throw new Error("Set CUTROOM_POSTIZ_API_URL to your trusted Postiz API URL ending in /public/v1. Use HTTPS, or HTTP on localhost."); }
}
export class PostizCredentials {
  private key?: string;
  private environment: NodeJS.ProcessEnv;
  constructor(environment: NodeJS.ProcessEnv = process.env) { this.environment = environment; }
  status(): PostizStatus {
    const source = this.key ? "session" : credentialSchema.safeParse({ apiKey: this.environment.POSTIZ_API_KEY }).success ? "environment" : null;
    return { configured: !!source, source, destination: postizDestination(this.environment) };
  }
  set(input: unknown) { this.key = credentialSchema.parse(input).apiKey; return this.status(); }
  forget() { this.key = undefined; return this.status(); }
  client() {
    const parsed = credentialSchema.safeParse({ apiKey: this.key || this.environment.POSTIZ_API_KEY });
    if (!parsed.success) throw Object.assign(new Error("Add your Postiz API key in Studio settings."), { status: 409 });
    return new PostizClient(postizDestination(this.environment), parsed.data.apiKey);
  }
}
export class PostizError extends Error {}
const mediaSchema = z.object({ id: channelIdSchema, path: z.string().url().max(2048) });
export class PostizClient {
  readonly destination: string;
  private key: string;
  constructor(destination: string, key: string) { this.destination = destination; this.key = key; }
  async request(route: string, options: RequestInit = {}, timeout = 30_000): Promise<unknown> {
    try {
      const response = await fetch(this.destination + route, { ...options,
        headers: { ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }), Authorization: this.key },
        redirect: "error", signal: AbortSignal.any([AbortSignal.timeout(timeout), ...(options.signal ? [options.signal] : [])]),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new PostizError(`Postiz returned HTTP ${response.status}. Check the key, channel connection, settings and account limits in Postiz.`);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error();
      const chunks: Uint8Array[] = []; let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          length += value.length; if (length > 1_000_000) throw new Error();
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); }
      return JSON.parse(Buffer.concat(chunks).toString());
    } catch (error) {
      if (error instanceof PostizError) throw error;
      throw new PostizError("Postiz could not confirm the request. Check your connection and Postiz calendar before submitting again.");
    }
  }
  async channels(signal?: AbortSignal): Promise<PostizChannel[]> {
    const parsed = z.array(z.object({ id: channelIdSchema, name: z.string().max(200), identifier: z.string(), disabled: z.boolean() })).max(1000)
      .safeParse(await this.request("/integrations", { signal }));
    if (!parsed.success) throw new PostizError("Postiz returned an unreadable channel list.");
    return parsed.data.filter(c => ["youtube", "instagram", "instagram-standalone", "tiktok"].includes(c.identifier)) as PostizChannel[];
  }
  async settings(id: string, signal?: AbortSignal) {
    const result = z.object({ output: z.object({ maxLength: z.number().positive(), rules: z.string().optional(), settings: z.record(z.string(), z.unknown()) }) })
      .safeParse(await this.request(`/integration-settings/${channelIdSchema.parse(id)}`, { signal }));
    if (!result.success) throw new PostizError("Postiz could not provide channel posting limits. Update Postiz or check this channel in its composer.");
    return result.data.output;
  }
  async upload(filename: string, signal?: AbortSignal) {
    const info = await lstat(filename);
    if (!info.isFile() || info.size > 500 * 1024 * 1024) throw new PostizError("The rendered video must be a regular MP4 under 500 MB. Choose 720p or a shorter clip.");
    const body = new FormData(); body.append("file", await openAsBlob(filename, { type: "video/mp4" }), "clip.mp4");
    const parsed = mediaSchema.safeParse(await this.request("/upload", { method: "POST", body, signal }, 10 * 60_000));
    if (!parsed.success) throw new PostizError("Postiz returned an unreadable upload receipt.");
    const url = new URL(parsed.data.path);
    if (url.protocol !== "https:" || url.username || url.password || url.hash || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      throw new PostizError("Configure public HTTPS media storage in Postiz so social platforms can fetch the video.");
    return parsed.data;
  }
  async create(payload: unknown, integration: string, signal?: AbortSignal) {
    const result = z.array(z.object({ postId: channelIdSchema, integration: channelIdSchema })).length(1)
      .safeParse(await this.request("/posts", { method: "POST", body: JSON.stringify(payload), signal }, 120_000));
    if (!result.success || result.data[0].integration !== integration) throw new PostizError("Postiz returned an unreadable post receipt. Check its calendar before submitting again.");
    return result.data[0].postId;
  }
}
export const postizCredentials = new PostizCredentials();
