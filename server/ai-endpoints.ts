import { isIP } from "node:net";
import { providerDetails, type CloudProvider } from "../shared/ai-providers.js";

// A custom destination is operator configuration, never a transcript, backup, or browser request field.
export function providerEndpoint(provider: CloudProvider, environment: NodeJS.ProcessEnv = process.env) {
  if (provider !== "custom") return providerDetails[provider].endpoint;
  try {
    const raw = environment.CUTROOM_CUSTOM_AI_BASE_URL?.trim();
    if (!raw || raw.length > 2048) throw new Error();
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.port && url.port !== "443") ||
      isIP(url.hostname.replace(/^\[|\]$/g, "")) || !url.hostname.includes(".") || /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)) throw new Error();
    url.pathname = url.pathname.replace(/\/+$/, "") + (url.pathname.replace(/\/+$/, "").endsWith("/chat/completions") ? "" : "/chat/completions");
    return url.href;
  } catch {
    throw Object.assign(new Error("Set CUTROOM_CUSTOM_AI_BASE_URL to a trusted public HTTPS API base URL in .env, without credentials, query parameters, or a custom port, then restart Cutroom."), { status: 409 });
  }
}
