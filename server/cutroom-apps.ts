/**
 * Cutroom's own developer apps, offered as one-click "Connect with Cutroom" when the user has not added an app.
 * A user's app saved in Settings or set in .env always takes precedence. Leave a platform undefined to require one.
 *
 * - YouTube: a Google OAuth client of type Desktop app. Google treats installed-app client secrets as
 *   non-confidential, so both values may ship in source.
 * - TikTok: only the public client key ships. The client secret stays in the token service
 *   (site/src/tiktok-token.ts), which adds it to code and refresh exchanges.
 *
 * See docs/cutroom-apps.md for the release checklist (verification, quota, TikTok audit, token service).
 */
export interface CutroomApps {
  youtube?: { clientId: string; clientSecret: string };
  tiktok?: { clientKey: string; tokenService: string };
}

export const TIKTOK_TOKEN_SERVICE = "https://cutroom.batuukka.com/api/tiktok/token";
/** TikTok only accepts the exact redirect URI registered for the app, so Cutroom's app needs the default port. */
export const CUTROOM_APP_PORT = 4318;

export const cutroomApps: CutroomApps = {
  youtube: undefined,
  tiktok: undefined,
};
