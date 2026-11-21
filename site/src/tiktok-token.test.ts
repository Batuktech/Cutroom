import { describe, expect, it, vi } from "vitest";
import { tiktokToken } from "./tiktok-token.ts";
import worker from "./worker.ts";

const env = { TIKTOK_CLIENT_KEY: "synthetic-key", TIKTOK_CLIENT_SECRET: "synthetic-secret" };
const verifier = "v".repeat(64);
const redirect = "http://127.0.0.1:4318/api/social/tiktok/callback";
const call = (body: unknown, init: RequestInit = {}) => new Request("https://cutroom.example/api/tiktok/token", {
  method: "POST", headers: { "Content-Type": "application/json", ...(init.headers as Record<string, string> | undefined) },
  body: typeof body === "string" ? body : JSON.stringify(body), ...(init.method ? { method: init.method } : {}),
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("TikTok token service", () => {
  it("adds the secret to a code exchange and returns only token fields", async () => {
    const upstream = vi.fn(async () => json({ access_token: "a", expires_in: 86400, refresh_token: "r", open_id: "o", scope: "video.upload", token_type: "Bearer", log_id: "x" }));
    const response = await tiktokToken(call({ grant_type: "authorization_code", code: "abc", code_verifier: verifier, redirect_uri: redirect }), env, upstream);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ access_token: "a", expires_in: 86400, refresh_token: "r", open_id: "o", scope: "video.upload", token_type: "Bearer" });
    const [url, init] = upstream.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://open.tiktokapis.com/v2/oauth/token/");
    const form = new URLSearchParams(String(init.body));
    expect(Object.fromEntries(form)).toEqual({ client_key: "synthetic-key", client_secret: "synthetic-secret", grant_type: "authorization_code",
      code: "abc", code_verifier: verifier, redirect_uri: redirect });
    expect(init.redirect).toBe("manual");
  });

  it("refreshes tokens", async () => {
    const upstream = vi.fn(async () => json({ access_token: "a2", expires_in: 86400, refresh_token: "r2" }));
    const response = await tiktokToken(call({ grant_type: "refresh_token", refresh_token: "r1" }), env, upstream);
    expect(await response.json()).toMatchObject({ access_token: "a2", refresh_token: "r2" });
    expect(new URLSearchParams(String((upstream.mock.calls[0] as unknown as [string, RequestInit])[1].body)).get("refresh_token")).toBe("r1");
  });

  it("refuses browsers, other methods, unknown redirects and malformed grants without calling TikTok", async () => {
    const upstream = vi.fn();
    const good = { grant_type: "authorization_code", code: "abc", code_verifier: verifier, redirect_uri: redirect };
    const cases: [Request, number][] = [
      [new Request("https://cutroom.example/api/tiktok/token"), 405],
      [call(good, { headers: { Origin: "https://evil.example" } }), 403],
      [new Request("https://cutroom.example/api/tiktok/token", { method: "POST", body: "code=abc" }), 415],
      [call({ ...good, redirect_uri: "https://evil.example/callback" }), 400],
      [call({ ...good, code_verifier: "short" }), 400],
      [call({ ...good, code: "has space" }), 400],
      [call({ grant_type: "client_credentials" }), 400],
      [call({ grant_type: "refresh_token" }), 400],
      [call("not json"), 400],
      [call("[]"), 400],
      [call({ grant_type: "refresh_token", refresh_token: "x".repeat(9000) }), 413],
    ];
    for (const [request, status] of cases) expect((await tiktokToken(request, env, upstream)).status, request.method).toBe(status);
    expect((await tiktokToken(call(good), {}, upstream)).status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("passes on TikTok's short error code but never its description", async () => {
    const refused = await tiktokToken(call({ grant_type: "refresh_token", refresh_token: "r" }), env,
      vi.fn(async () => json({ error: "invalid_grant", error_description: "refresh token r is expired" }, 400)));
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: "invalid_grant" });
    const down = await tiktokToken(call({ grant_type: "refresh_token", refresh_token: "r" }), env, vi.fn(async () => { throw new Error("offline"); }));
    expect(down.status).toBe(502);
    const moved = await tiktokToken(call({ grant_type: "refresh_token", refresh_token: "r" }), env,
      vi.fn(async () => new Response(null, { status: 302, headers: { Location: "https://elsewhere.example/" } })));
    expect(await moved.json()).toEqual({ error: "upstream_redirect" });
  });

  it("rate-limits by client IP when the binding exists", async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const response = await tiktokToken(call({ grant_type: "refresh_token", refresh_token: "r" }, { headers: { "CF-Connecting-IP": "203.0.113.9" } }),
      { ...env, TOKEN_LIMITER: { limit } }, vi.fn());
    expect(response.status).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: "203.0.113.9" });
  });

  it("routes only the token path to the script and other API paths to 404", async () => {
    const assets = { fetch: vi.fn(async () => new Response("page")) };
    expect((await worker.fetch(new Request("https://cutroom.example/api/other"), { ...env, ASSETS: assets })).status).toBe(404);
    expect((await worker.fetch(new Request("https://cutroom.example/api/tiktok/token"), { ...env, ASSETS: assets })).status).toBe(405);
    expect(await (await worker.fetch(new Request("https://cutroom.example/privacy"), { ...env, ASSETS: assets })).text()).toBe("page");
  });
});
