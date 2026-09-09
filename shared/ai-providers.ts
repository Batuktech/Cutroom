export const cloudProviders = ["openai", "anthropic", "openrouter"] as const;
export type CloudProvider = typeof cloudProviders[number];
export type AIProvider = "local" | CloudProvider;
export const providerDetails = {
  local: { name: "Local Qwen3-8B", model: "", keyUrl: "" },
  openai: { name: "OpenAI", model: "gpt-6-astra", keyUrl: "https://platform.openai.com/api-keys" },
  anthropic: { name: "Anthropic", model: "claude-opus-5", keyUrl: "https://platform.claude.com/settings/keys" },
  openrouter: { name: "OpenRouter", model: "", keyUrl: "https://openrouter.ai/settings/keys" },
} as const;
export interface ProviderStatus {
  provider: CloudProvider;
  configured: boolean;
  source: "session" | "environment" | null;
}
