import path from "node:path";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SocialAccounts, SocialError, socialAccounts } from "./social-accounts.js";
import { tiktokChunks, uploadYoutube } from "./social-upload.js";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const env = { CUTROOM_PORT: "4318", YOUTUBE_CLIENT_ID: "synthetic-client-id", YOUTUBE_CLIENT_SECRET: "synthetic-secret",
  TIKTOK_CLIENT_KEY: "synthetic-key", TIKTOK_CLIENT_SECRET: "synthetic-tiktok-secret" };
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
async function scratch() {
  const folder = await mkdtemp(path.join("output", "social-test-"));
  return folder;
}

describe("social account sign-in", () => {
  it("requires app credentials and builds loopback PKCE sign-in URLs", async () => {
    const accounts = new SocialAccounts({}, path.join(await scratch(), "tokens.json"));
    expect(accounts.status().every(a => !a.appConfigured && !a.connected)).toBe(true);
    expect(() => accounts.connect("youtube")).toThrow("in Settings");
    const configured = new SocialAccounts(env, path.join(await scratch(), "tokens.json"));
    const youtube = new URL(configured.connect("youtube").url);
    expect(youtube.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:4318/api/social/youtube/callback");
    expect(youtube.searchParams.get("code_challenge")).toMatch(/^[\w-]{43}$/);
    const tiktok = new URL(configured.connect("tiktok").url);
    expect(tiktok.searchParams.get("code_challenge")).toMatch(/^[a-f0-9]{64}$/);
    expect(tiktok.searchParams.get("scope")).toContain("video.publish");
    expect(JSON.stringify(configured.status())).not.toContain("synthetic-secret");
  });
  it("rejects unknown state and stores refresh tokens owner-only", async () => {
    const file = path.join(await scratch(), "tokens.json");
    const accounts = new SocialAccounts(env, file);
    await expect(accounts.callback("youtube", { code: "abc", state: "forged" })).rejects.toThrow("expired");
    const state = new URL(accounts.connect("tiktok").url).searchParams.get("state")!;
    await expect(accounts.callback("youtube", { code: "abc", state })).rejects.toThrow("expired");
    const state2 = new URL(accounts.connect("tiktok").url).searchParams.get("state")!;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ access_token: "access", expires_in: 3600, refresh_token: "synthetic-refresh" }))
      .mockResolvedValueOnce(json({ data: { creator_username: "synthetic_creator" }, error: { code: "ok" } }));
    vi.stubGlobal("fetch", fetchMock);
    await accounts.callback("tiktok", { code: "abc", state: state2 });
    const tokenBody = String(fetchMock.mock.calls[0][1].body);
    expect(tokenBody).toContain("code_verifier=");
    expect(tokenBody).toContain("client_key=synthetic-key");
    expect(accounts.status().find(a => a.platform === "tiktok")).toMatchObject({ connected: true, account: "@synthetic_creator" });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await readFile(file, "utf8")).toContain("synthetic-refresh");
    await accounts.callback("tiktok", { code: "abc", state: state2 }).catch(error => expect(error.message).toContain("expired"));
  });
});

describe("app credentials entered in Settings", () => {
  it("saves over .env, never exposes the secret, and drops sign-ins from a replaced app", async () => {
    const file = path.join(await scratch(), "tokens.json");
    const accounts = new SocialAccounts({ YOUTUBE_CLIENT_ID: "env-client-id-111111", YOUTUBE_CLIENT_SECRET: "env-secret-value" }, file);
    expect(accounts.status()[0]).toMatchObject({ appSource: "environment", clientHint: "env-clie…" });
    await expect(accounts.setApp("youtube", { clientId: "short", clientSecret: "ui-secret-value" })).rejects.toThrow("too short");
    let status = await accounts.setApp("youtube", { clientId: "ui-client-id-222222", clientSecret: "ui-secret-value" });
    expect(status[0]).toMatchObject({ appSource: "saved", clientHint: "ui-clien…" });
    expect(JSON.stringify(status)).not.toContain("secret-value");
    expect(new URL(accounts.connect("youtube").url).searchParams.get("client_id")).toBe("ui-client-id-222222");
    await new Promise(resolve => setTimeout(resolve, 50));
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    const reloaded = new SocialAccounts({}, file);
    await reloaded.load();
    expect(reloaded.status()[0]).toMatchObject({ appSource: "saved", appConfigured: true });
    const state = new URL(reloaded.connect("youtube").url).searchParams.get("state")!;
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json({ access_token: "access", expires_in: 3600, refresh_token: "refresh" }))
      .mockResolvedValueOnce(json({ items: [{ snippet: { title: "Synthetic channel" } }] })));
    await reloaded.callback("youtube", { code: "abc", state });
    expect(reloaded.status()[0]).toMatchObject({ connected: true, account: "Synthetic channel" });
    status = await reloaded.setApp("youtube", { clientId: "ui-client-id-222222", clientSecret: "rotated-secret" });
    expect(status[0].connected).toBe(true);
    status = await reloaded.setApp("youtube", { clientId: "other-client-id-333333", clientSecret: "rotated-secret" });
    expect(status[0].connected).toBe(false);
    status = await reloaded.forgetApp("youtube");
    expect(status[0]).toMatchObject({ appSource: null, appConfigured: false, connected: false });
  });
});

describe("platform uploads", () => {
  it("plans TikTok chunks within the documented limits", () => {
    expect(tiktokChunks(3 * 1024 * 1024)).toEqual({ chunkSize: 3 * 1024 * 1024, count: 1 });
    expect(tiktokChunks(15 * 1024 * 1024)).toEqual({ chunkSize: 15 * 1024 * 1024, count: 1 });
    expect(tiktokChunks(35 * 1024 * 1024)).toEqual({ chunkSize: 10 * 1024 * 1024, count: 3 });
  });
  it("treats refusals before upload as definite and lost upload receipts as unknown", async () => {
    const file = path.join(await scratch(), "clip.mp4");
    await writeFile(file, Buffer.alloc(1024));
    vi.spyOn(socialAccounts, "accessToken").mockResolvedValue("access");
    const meta = { title: "A <clip>", description: "Synthetic", tags: ["#test"], visibility: "public" as const, duration: 30 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ error: { errors: [{ reason: "quotaExceeded" }] } }, 403)));
    const quota = await uploadYoutube(file, meta).catch(e => e);
    expect(quota).toBeInstanceOf(SocialError);
    expect(quota).toMatchObject({ definite: true, code: "quotaExceeded" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({}, 200, { Location: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=x" }))
      .mockRejectedValueOnce(new Error("socket hang up"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await uploadYoutube(file, meta).catch(e => e)).toMatchObject({ definite: false });
    const init = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(init.snippet.title).toBe("A clip");
    expect(init.status.privacyStatus).toBe("public");
    expect(init.snippet.description).toContain("#Shorts");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json({}, 200, { Location: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=x" }))
      .mockResolvedValueOnce(json({ id: "abcDEF12345" })));
    expect(await uploadYoutube(file, meta)).toEqual({ remoteId: "abcDEF12345", url: "https://youtube.com/shorts/abcDEF12345" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({}, 200, { Location: "https://attacker.example/upload" })));
    expect(await uploadYoutube(file, meta).catch(e => e)).toMatchObject({ definite: true });
  });
});
