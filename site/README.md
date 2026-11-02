# cutroom.batuukka.com

Static home page, privacy policy and terms of service for Cutroom. Google OAuth verification and the TikTok app review link to these pages.

It is served as Cloudflare Worker static assets (`wrangler.jsonc`). Preview and deploy from this folder:

```bash
npx wrangler dev --port 8788   # http://127.0.0.1:8788
npx wrangler deploy            # needs a Cloudflare login for the batuukka.com account
```

Update the effective date at the top of `privacy.html` or `terms.html` whenever their content changes. The fonts are Manrope and Fraunces under the SIL Open Font License (`public/assets/fonts/`).
