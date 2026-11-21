import { tiktokToken, type TokenEnv } from "./tiktok-token.ts";

interface Env extends TokenEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

// Static pages are served from ./public; only /api/* reaches this script (run_worker_first in wrangler.jsonc).
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/tiktok/token") return tiktokToken(request, env);
    if (pathname.startsWith("/api/")) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    return env.ASSETS.fetch(request);
  },
};
