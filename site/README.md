# cutroom.batuukka.com

Static home page, privacy policy and terms of service for Cutroom. Google OAuth verification and the TikTok app review link to these pages.

It is served as Cloudflare Worker static assets (`wrangler.jsonc`). Preview and deploy from this folder:

```bash
npx wrangler dev --port 8788   # http://127.0.0.1:8788
npx wrangler deploy            # needs a Cloudflare login for the batuukka.com account
```

## TikTok token service

`src/worker.ts` serves `/api/tiktok/token` for [Cutroom's own TikTok app](../docs/cutroom-apps.md); every other path is a static page. Before the first deploy, set the client key in `wrangler.jsonc` (`vars.TIKTOK_CLIENT_KEY`) and the secret with:

```bash
npx wrangler secret put TIKTOK_CLIENT_SECRET
```

The service only accepts JSON `authorization_code` grants for the registered loopback redirect and `refresh_token` grants, refuses browser requests, is rate-limited per IP, and stores and logs nothing. Its tests run with the main `npm test`.

Update the effective date at the top of `privacy.html` or `terms.html` whenever their content changes. The fonts are Manrope and Fraunces under the SIL Open Font License (`public/assets/fonts/`).
