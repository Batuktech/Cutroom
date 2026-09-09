import { z } from "zod";
import { providerEndpoint } from "./ai-endpoints.js";
import { cloudProviders, providerDetails, type CloudProvider, type ProviderStatus } from "../shared/ai-providers.js";

export const cloudProviderSchema = z.enum(cloudProviders);
export const credentialSchema = z.object({
  apiKey: z.string().trim().min(8, "Enter an API key.").max(4096).regex(/^[\x21-\x7e]+$/, "API keys cannot contain whitespace or control characters."),
});

// Session keys never enter project metadata, job history, or files.
export class AICredentials {
  private keys = new Map<CloudProvider, string>();
  private environment: NodeJS.ProcessEnv;
  constructor(environment: NodeJS.ProcessEnv = process.env) { this.environment = environment; }
  get(provider: CloudProvider) {
    const key = this.keys.get(provider) || this.environment[providerDetails[provider].envKey];
    const result = credentialSchema.safeParse({ apiKey: key });
    if (!result.success) throw Object.assign(new Error("Add an API key for the selected provider in AI settings."), { status: 409 });
    return result.data.apiKey;
  }
  status(): ProviderStatus[] {
    return cloudProviders.map(provider => {
      const source = this.keys.has(provider) ? "session" : credentialSchema.safeParse({ apiKey: this.environment[providerDetails[provider].envKey] }).success ? "environment" : null;
      let endpoint: string | undefined;
      try { endpoint = providerEndpoint(provider, this.environment); } catch { /* Settings explains missing custom configuration. */ }
      return { provider, configured: source !== null, source, endpoint, endpointReady: !!endpoint };
    });
  }
  set(provider: CloudProvider, input: unknown) {
    this.keys.set(provider, credentialSchema.parse(input).apiKey);
    return this.status();
  }
  forget(provider: CloudProvider) {
    this.keys.delete(provider);
    return this.status();
  }
}
export const aiCredentials = new AICredentials();
