import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { z } from "zod";
import { ROOT } from "./store.js";
import type { AutopostPlatform, SocialAccountStatus } from "../shared/streams.js";

/** A failure that is `definite` happened before the platform could have created a post. */
export class SocialError extends Error {
  readonly definite: boolean;
  readonly code?: string;
  constructor(message: string, definite: boolean, code?: string) { super(message); this.definite = definite; this.code = code; }
}

export interface JsonResponse { status: number; headers: Headers; body: unknown }
/** Bounded JSON request: no redirects, a timeout, a 1 MB body cap and no upstream error text in messages. */
export async function requestJson(url: string, init: RequestInit & { timeout?: number } = {}, service = "The platform"): Promise<JsonResponse> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, redirect: "error",
      signal: AbortSignal.any([AbortSignal.timeout(init.timeout ?? 30_000), ...(init.signal ? [init.signal] : [])]) });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new SocialError(`${service} could not be reached. Check your connection.`, false);
  }
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  if (reader) try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length;
      if (length > 1_000_000) throw new SocialError(`${service} returned an oversized response.`, false);
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  let body: unknown = null;
  try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null; } catch { /* Non-JSON bodies are treated as empty. */ }
  return { status: response.status, headers: response.headers, body };
}

const TOKEN_FILE = path.join(ROOT, "social-accounts.json");
const tokenSchema = z.object({
  refreshToken: z.string().min(1).max(4096),
  accessToken: z.string().max(8192).optional(),
  expiresAt: z.number().optional(),
  account: z.string().max(200).optional(),
});
type Token = z.infer<typeof tokenSchema>;
const credential = z.string().trim().min(8).max(512).regex(/^[\x21-\x7e]+$/);
const appSchema = z.object({ clientId: credential, clientSecret: credential });
const field = (name: string) => z.string({ error: `Enter the ${name}.` }).trim()
  .min(8, `The ${name} looks too short. Copy it from your developer app.`).max(512, `The ${name} is too long.`)
  .regex(/^[\x21-\x7e]+$/, `The ${name} cannot contain spaces or special characters.`);
export const appInputSchema = z.object({ clientId: field("client ID"), clientSecret: field("client secret") });
const fileSchema = z.object({
  youtube: tokenSchema.optional(), tiktok: tokenSchema.optional(),
  apps: z.object({ youtube: appSchema.optional(), tiktok: appSchema.optional() }).optional(),
});

const apps = {
  youtube: {
    idEnv: "YOUTUBE_CLIENT_ID", secretEnv: "YOUTUBE_CLIENT_SECRET", refreshEnv: "YOUTUBE_REFRESH_TOKEN",
    authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", service: "Google",
  },
  tiktok: {
    idEnv: "TIKTOK_CLIENT_KEY", secretEnv: "TIKTOK_CLIENT_SECRET", refreshEnv: "TIKTOK_REFRESH_TOKEN",
    authorize: "https://www.tiktok.com/v2/auth/authorize/", token: "https://open.tiktokapis.com/v2/oauth/token/", service: "TikTok",
  },
} as const;
const tokenResponse = z.object({
  access_token: z.string().min(1).max(8192),
  expires_in: z.number().positive().max(10 ** 8),
  refresh_token: z.string().min(1).max(4096).optional(),
});

export class SocialAccounts {
  private tokens: z.infer<typeof fileSchema> = {};
  private pending = new Map<string, { platform: AutopostPlatform; verifier: string; expires: number }>();
  private writes = Promise.resolve();
  private environment: NodeJS.ProcessEnv;
  private file: string;
  constructor(environment: NodeJS.ProcessEnv = process.env, file = TOKEN_FILE) { this.environment = environment; this.file = file; }

  async load() {
    try { this.tokens = fileSchema.parse(JSON.parse(await readFile(this.file, "utf8"))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        console.warn("Saved publishing accounts could not be read. Connect them again in Settings.");
    }
  }
  private save() {
    const data = JSON.stringify(this.tokens);
    this.writes = this.writes.catch(() => {}).then(async () => {
      // Owner-only: this file holds long-lived refresh tokens.
      await writeFile(this.file + ".tmp", data, { mode: 0o600 });
      await rename(this.file + ".tmp", this.file);
    });
    return this.writes;
  }
  private appSource(platform: AutopostPlatform) {
    if (this.tokens.apps?.[platform]) return "saved" as const;
    const app = apps[platform];
    return credential.safeParse(this.environment[app.idEnv]).success && credential.safeParse(this.environment[app.secretEnv]).success ? "environment" as const : null;
  }
  // Settings-entered credentials take precedence over .env.
  private app(platform: AutopostPlatform) {
    const app = apps[platform], saved = this.tokens.apps?.[platform];
    if (saved) return { ...app, id: saved.clientId, secret: saved.clientSecret };
    const id = credential.safeParse(this.environment[app.idEnv]), secret = credential.safeParse(this.environment[app.secretEnv]);
    if (!id.success || !secret.success)
      throw Object.assign(new Error(`Add the ${app.service} app client ID and secret in Settings first.`), { status: 409 });
    return { ...app, id: id.data, secret: secret.data };
  }
  async setApp(platform: AutopostPlatform, input: unknown) {
    const parsed = appInputSchema.parse(input);
    let previous: string | undefined;
    try { previous = this.app(platform).id; } catch { /* No app configured yet. */ }
    // Tokens belong to the app that issued them; a different client ID needs a fresh sign-in.
    if (previous && previous !== parsed.clientId) delete this.tokens[platform];
    (this.tokens.apps ??= {})[platform] = parsed;
    await this.save();
    return this.status();
  }
  async forgetApp(platform: AutopostPlatform) {
    if (this.tokens.apps) delete this.tokens.apps[platform];
    delete this.tokens[platform];
    await this.save();
    return this.status();
  }
  redirectUri(platform: AutopostPlatform) {
    return `http://127.0.0.1:${Number(this.environment.CUTROOM_PORT || 4318)}/api/social/${platform}/callback`;
  }
  private token(platform: AutopostPlatform): Token | undefined {
    const fromEnv = z.string().trim().min(1).max(4096).safeParse(this.environment[apps[platform].refreshEnv]);
    return this.tokens[platform] ?? (fromEnv.success ? { refreshToken: fromEnv.data } : undefined);
  }
  status(): SocialAccountStatus[] {
    return (["youtube", "tiktok"] as const).map(platform => {
      const appSource = this.appSource(platform);
      const token = this.token(platform);
      // The client ID is shown only as a hint so the right app can be recognised; the secret never leaves the server.
      const clientHint = appSource ? this.app(platform).id.slice(0, 8) + "…" : undefined;
      return { platform, appConfigured: !!appSource, appSource, clientHint, connected: !!token, account: token?.account, redirectUri: this.redirectUri(platform) };
    });
  }
  connect(platform: AutopostPlatform) {
    const app = this.app(platform);
    const now = Date.now();
    for (const [key, value] of this.pending) if (value.expires < now) this.pending.delete(key);
    const state = randomBytes(24).toString("hex"), verifier = randomBytes(48).toString("base64url");
    this.pending.set(state, { platform, verifier, expires: now + 10 * 60_000 });
    const url = new URL(app.authorize);
    const redirect = this.redirectUri(platform);
    if (platform === "youtube") {
      url.search = new URLSearchParams({ client_id: app.id, redirect_uri: redirect, response_type: "code", access_type: "offline", prompt: "consent",
        scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly", state,
        code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" }).toString();
    } else {
      // TikTok's desktop Login Kit expects a hex-encoded SHA-256 challenge.
      url.search = new URLSearchParams({ client_key: app.id, redirect_uri: redirect, response_type: "code", scope: "user.info.basic,video.publish", state,
        code_challenge: createHash("sha256").update(verifier).digest("hex"), code_challenge_method: "S256" }).toString();
    }
    return { url: url.href };
  }
  async callback(platform: AutopostPlatform, query: { code?: unknown; state?: unknown; error?: unknown }) {
    const state = typeof query.state === "string" ? query.state : "";
    const pending = this.pending.get(state);
    this.pending.delete(state);
    if (!pending || pending.platform !== platform || pending.expires < Date.now()) throw new Error("This sign-in link expired. Start Connect again from Settings.");
    if (typeof query.code !== "string" || !query.code || query.code.length > 2048) throw new Error("Sign-in was cancelled or refused.");
    const app = this.app(platform);
    const token = await this.exchange(platform, {
      ...(platform === "youtube" ? { client_id: app.id } : { client_key: app.id }), client_secret: app.secret,
      code: query.code, grant_type: "authorization_code", redirect_uri: this.redirectUri(platform), code_verifier: pending.verifier,
    });
    if (!token.refreshToken) throw new Error(`${app.service} did not return offline access. Remove Cutroom's access in your account settings and connect again.`);
    this.tokens[platform] = token as Token;
    this.tokens[platform]!.account = await this.accountName(platform).catch(() => undefined);
    await this.save();
  }
  async forget(platform: AutopostPlatform) {
    delete this.tokens[platform];
    await this.save();
    return this.status();
  }
  private async exchange(platform: AutopostPlatform, form: Record<string, string>): Promise<Partial<Token> & { accessToken: string; expiresAt: number }> {
    const app = apps[platform];
    const response = await requestJson(app.token, { method: "POST", body: new URLSearchParams(form),
      headers: { "Content-Type": "application/x-www-form-urlencoded" } }, app.service);
    const parsed = tokenResponse.safeParse(response.body);
    if (response.status >= 400 || !parsed.success)
      throw new SocialError(`${app.service} refused the sign-in (HTTP ${response.status}). Connect the account again in Settings.`, true, "auth");
    return { accessToken: parsed.data.access_token, expiresAt: Date.now() + (parsed.data.expires_in - 60) * 1000, refreshToken: parsed.data.refresh_token };
  }
  async accessToken(platform: AutopostPlatform, signal?: AbortSignal) {
    const saved = this.token(platform);
    if (!saved) throw new SocialError(`Connect ${apps[platform].service} in Settings before publishing.`, true, "auth");
    if (saved.accessToken && (saved.expiresAt ?? 0) > Date.now()) return saved.accessToken;
    signal?.throwIfAborted();
    const app = this.app(platform);
    const next = await this.exchange(platform, {
      ...(platform === "youtube" ? { client_id: app.id } : { client_key: app.id }),
      client_secret: app.secret, grant_type: "refresh_token", refresh_token: saved.refreshToken,
    });
    // TikTok rotates refresh tokens; Google usually keeps the original one.
    this.tokens[platform] = { ...saved, ...next, refreshToken: next.refreshToken || saved.refreshToken };
    await this.save();
    return next.accessToken;
  }
  private async accountName(platform: AutopostPlatform) {
    const token = await this.accessToken(platform);
    if (platform === "youtube") {
      const { body } = await requestJson("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        { headers: { Authorization: `Bearer ${token}` } }, "YouTube");
      return z.object({ items: z.array(z.object({ snippet: z.object({ title: z.string().max(200) }) })).min(1) }).parse(body).items[0].snippet.title;
    }
    const { body } = await requestJson("https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
      { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" } }, "TikTok");
    return "@" + z.object({ data: z.object({ creator_username: z.string().max(200) }) }).parse(body).data.creator_username;
  }
}
export const socialAccounts = new SocialAccounts();
