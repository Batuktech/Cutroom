/**
 * TikTok token exchange for Cutroom's own TikTok app.
 *
 * Cutroom runs on each user's computer, so it cannot hold the app's client secret. The local Cutroom server
 * sends the authorization code (with its PKCE verifier) or a refresh token here; this service adds the client
 * key and secret, forwards the grant to TikTok, and returns only the token fields. Nothing is stored or logged.
 */
export interface TokenEnv {
  TIKTOK_CLIENT_KEY?: string;
  TIKTOK_CLIENT_SECRET?: string;
  /** Comma-separated exact redirect URIs; defaults to Cutroom's loopback callback. */
  TIKTOK_REDIRECT_URIS?: string;
  /** Optional Workers rate-limit binding, keyed by client IP. */
  TOKEN_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const DEFAULT_REDIRECT = "http://127.0.0.1:4318/api/social/tiktok/callback";
const MAX_BODY = 8 * 1024;
const TOKEN_FIELDS = ["access_token", "expires_in", "refresh_token", "refresh_expires_in", "open_id", "scope", "token_type"] as const;
const printable = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max && /^[\x21-\x7e]+$/.test(value);

function reply(body: unknown, status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers },
  });
}

async function readCapped(request: Request) {
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > MAX_BODY) return null;
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BODY) return null;
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

export async function tiktokToken(request: Request, env: TokenEnv, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405, { Allow: "POST" });
  // Only the local Cutroom server calls this. Browsers always send Origin on cross-site POSTs, so refuse them.
  if (request.headers.has("Origin")) return reply({ error: "forbidden" }, 403);
  if (!(request.headers.get("Content-Type") ?? "").toLowerCase().startsWith("application/json"))
    return reply({ error: "unsupported_media_type" }, 415);
  if (!printable(env.TIKTOK_CLIENT_KEY, 512) || !printable(env.TIKTOK_CLIENT_SECRET, 512)) return reply({ error: "not_configured" }, 503);

  if (env.TOKEN_LIMITER) {
    const { success } = await env.TOKEN_LIMITER.limit({ key: request.headers.get("CF-Connecting-IP") ?? "unknown" });
    if (!success) return reply({ error: "rate_limited" }, 429, { "Retry-After": "60" });
  }

  const text = await readCapped(request);
  if (text === null) return reply({ error: "too_large" }, 413);
  let input: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    input = parsed as Record<string, unknown>;
  } catch {
    return reply({ error: "invalid_json" }, 400);
  }

  const redirects = (env.TIKTOK_REDIRECT_URIS ?? DEFAULT_REDIRECT).split(",").map(uri => uri.trim()).filter(Boolean);
  const grant = new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET });
  if (input.grant_type === "authorization_code") {
    if (!printable(input.code, 2048) || typeof input.code_verifier !== "string" || !/^[\w.~-]{43,128}$/.test(input.code_verifier)
      || typeof input.redirect_uri !== "string" || !redirects.includes(input.redirect_uri))
      return reply({ error: "invalid_request" }, 400);
    grant.set("grant_type", "authorization_code");
    grant.set("code", input.code);
    grant.set("code_verifier", input.code_verifier);
    grant.set("redirect_uri", input.redirect_uri);
  } else if (input.grant_type === "refresh_token") {
    if (!printable(input.refresh_token, 4096)) return reply({ error: "invalid_request" }, 400);
    grant.set("grant_type", "refresh_token");
    grant.set("refresh_token", input.refresh_token);
  } else {
    return reply({ error: "unsupported_grant_type" }, 400);
  }

  let upstream: Response;
  try {
    upstream = await fetchImpl(TIKTOK_TOKEN_URL, {
      method: "POST",
      body: grant,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      // Workers support only "follow" and "manual"; a redirect from the token endpoint is treated as a failure below.
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return reply({ error: "upstream_unreachable" }, 502);
  }
  if (upstream.status >= 300 && upstream.status < 400) return reply({ error: "upstream_redirect" }, 502);
  const data: unknown = await upstream.json().catch(() => null);
  const fields = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  if (!upstream.ok || typeof fields.access_token !== "string") {
    // Pass through TikTok's short error code only; error descriptions can echo request details.
    const code = typeof fields.error === "string" && /^[\w.-]{1,60}$/.test(fields.error) ? fields.error : "token_refused";
    return reply({ error: code }, upstream.status >= 500 ? 502 : 400);
  }
  return reply(Object.fromEntries(TOKEN_FIELDS.filter(key => key in fields).map(key => [key, fields[key]])), 200);
}
