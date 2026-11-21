# Cutroom's own publishing apps

By default, Stream autopilot posts through developer apps that each user creates. Cutroom can also ship its **own** YouTube and TikTok apps, so a user just chooses **Connect YouTube** or **Connect TikTok** in **Settings → Auto-publishing accounts**. A user's own app, saved in Settings or set in `.env`, always takes precedence.

This page is the maintainer checklist for turning that on. Until the IDs are filled in, the one-click option is hidden and nothing changes for users.

## How it works

| | YouTube | TikTok |
| --- | --- | --- |
| What ships in source | Client ID and client secret of a Google OAuth **Desktop app** client. Google treats installed-app secrets as non-confidential. | Client key only. |
| Where the secret lives | In source (non-confidential). | In the token service on `cutroom.batuukka.com` (`site/src/tiktok-token.ts`), set with `wrangler secret put`. |
| Sign-in | Loopback redirect with PKCE on any port. | Loopback redirect with PKCE. TikTok needs the exact registered URI, so Cutroom's app works only on port 4318. |
| Token exchange | The local server calls Google directly. | The local server sends the code and PKCE verifier, or a refresh token, to the token service. It adds the key and secret, calls TikTok, and returns only token fields. It stores and logs nothing. |

Tokens are stored on the user's computer exactly as with their own app (`social-accounts.json`, mode 600). Each sign-in records the app that issued it, so a token from Cutroom's app is never refreshed with another app's credentials.

## Release checklist

### YouTube

1. In Google Cloud, create a project for Cutroom, enable **YouTube Data API v3**, and create an OAuth client of type **Desktop app**.
2. Configure the OAuth consent screen with the home page, [privacy policy](https://cutroom.batuukka.com/privacy) and [terms](https://cutroom.batuukka.com/terms), then submit it for **verification** of the `youtube.upload` and `youtube.readonly` scopes. Until it is verified, only test users can sign in (at most 100) and they see an unverified-app warning.
3. Complete the **YouTube API Services audit**. Until it passes, Google locks every upload from the project to private.
4. Request a **quota extension**. The default 10,000 units per day is about six uploads in total, shared by every user of Cutroom's app.
5. Fill in `cutroomApps.youtube` in `server/cutroom-apps.ts`.

### TikTok

1. In TikTok for Developers, use the Cutroom app on the **Desktop** platform with Login Kit and the Content Posting API. Request `user.info.basic`, `video.upload` and `video.publish`.
2. Register the redirect URI `http://127.0.0.1:4318/api/social/tiktok/callback`.
3. Deploy the token service from `site/` (see [site/README.md](../site/README.md)): set `TIKTOK_CLIENT_KEY` in `wrangler.jsonc`, run `npx wrangler secret put TIKTOK_CLIENT_SECRET`, then `npx wrangler deploy`.
4. Submit the app for TikTok's **audit**, using **Exports → Post to TikTok** as the posting experience. Until it passes, direct posts are private only. Drafts to the inbox work without the audit and stay the default for Stream autopilot. TikTok's content sharing guidelines expect a manual privacy choice for each post, so unattended public posting is unlikely to be approved.
5. Fill in `cutroomApps.tiktok` in `server/cutroom-apps.ts` with the client key and the token-service URL.

### Before announcing

- Keep the privacy policy's effective date current and keep it describing the token service.
- Test the whole path on a clean install with a non-maintainer Google and TikTok account.
- Watch for the shared-quota messages: when Cutroom's YouTube quota or TikTok daily cap runs out, users are told to retry the next day or add their own app.

## Testing before the IDs ship

Set these in a private `.env` to try Cutroom's-app mode without editing source:

| Variable | Meaning |
| --- | --- |
| `CUTROOM_APP_YOUTUBE_CLIENT_ID`, `CUTROOM_APP_YOUTUBE_CLIENT_SECRET` | Desktop OAuth client used as Cutroom's YouTube app. |
| `CUTROOM_APP_TIKTOK_CLIENT_KEY` | Client key used as Cutroom's TikTok app. |
| `CUTROOM_APP_TIKTOK_TOKEN_SERVICE` | Token-service URL. HTTPS, or HTTP on localhost for `npx wrangler dev`. Defaults to `https://cutroom.batuukka.com/api/tiktok/token`. |

`npm test` covers the token service (`site/src/tiktok-token.test.ts`) and the local sign-in flow with synthetic credentials. It makes no real platform requests.
