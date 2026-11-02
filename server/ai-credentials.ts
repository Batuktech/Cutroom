import { z } from "zod";
import { providerEndpoint } from "./ai-endpoints.js";
import { probeClaudeCode, type ClaudeCodeStatus } from "./claude-code.js";
import { apiKeyProviders, cloudProviders, providerDetails, usesApiKey, type ApiKeyProvider, type CloudProvider, type ProviderStatus } from "../shared/ai-providers.js";

export const cloudProviderSchema = z.enum(cloudProviders);
export const apiKeyProviderSchema = z.enum(apiKeyProviders);
export const credentialSchema = z.object({
  apiKey: z.string().trim().min(8, "Enter an API key.").max(4096).regex(/^[\x21-\x7e]+$/, "API keys cannot contain whitespace or control characters."),
});

// Session keys never enter project metadata, job history, or files.
export class AICredentials {
  private keys = new Map<ApiKeyProvider, string>();
  private environment: NodeJS.ProcessEnv;
  private probe: () => Promise<ClaudeCodeStatus>;
  private cli?: { at: number; status: Promise<ClaudeCodeStatus> };
  constructor(environment: NodeJS.ProcessEnv = process.env, probe = () => probeClaudeCode(environment)) {
    this.environment = environment; this.probe = probe;
  }
  /** Claude Code holds its own sign-in, so it has no key here. */
  get(provider: CloudProvider) {
    if (!usesApiKey(provider)) return "";
    const key = this.keys.get(provider) || this.environment[providerDetails[provider].envKey];
    const result = credentialSchema.safeParse({ apiKey: key });
    if (!result.success) throw Object.assign(new Error("Add an API key for the selected provider in AI settings."), { status: 409 });
    return result.data.apiKey;
  }
  async ready(provider: CloudProvider) {
    if (usesApiKey(provider)) { this.get(provider); return; }
    const cli = await this.claudeCode(true);
    if (!cli.installed) throw Object.assign(new Error("Claude Code was not found on this computer. Install it, run `claude` to sign in, then try again."), { status: 409 });
    if (!cli.loggedIn) throw Object.assign(new Error("Claude Code is installed but not signed in. Run `claude` in a terminal and sign in, then try again."), { status: 409 });
  }
  private claudeCode(refresh = false) {
    if (refresh || !this.cli || Date.now() - this.cli.at > 30_000) {
      this.cli = { at: Date.now(), status: this.probe().catch(() => ({ installed: false, loggedIn: false })) };
    }
    return this.cli.status;
  }
  async status(refresh = false): Promise<ProviderStatus[]> {
    const keyed = apiKeyProviders.map((provider): ProviderStatus => {
      const source = this.keys.has(provider) ? "session" : credentialSchema.safeParse({ apiKey: this.environment[providerDetails[provider].envKey] }).success ? "environment" : null;
      let endpoint: string | undefined;
      try { endpoint = providerEndpoint(provider, this.environment); } catch { /* Settings explains missing custom configuration. */ }
      return { provider, configured: source !== null, source, endpoint, endpointReady: !!endpoint };
    });
    const cli = await this.claudeCode(refresh);
    return [...keyed, { provider: "claude-code", configured: cli.installed && cli.loggedIn, source: cli.installed && cli.loggedIn ? "login" : null,
      endpoint: providerDetails["claude-code"].endpoint, endpointReady: cli.installed, cli }];
  }
  set(provider: ApiKeyProvider, input: unknown) {
    this.keys.set(provider, credentialSchema.parse(input).apiKey);
    return this.status();
  }
  forget(provider: ApiKeyProvider) {
    this.keys.delete(provider);
    return this.status();
  }
}
export const aiCredentials = new AICredentials();
