export const cloudProviders = [
  "openai", "anthropic", "openrouter", "zai", "moonshot", "deepseek", "gemini",
  "groq", "mistral", "xai", "together", "fireworks", "cerebras", "sambanova",
  "dashscope", "siliconflow", "custom",
] as const;
export type CloudProvider = typeof cloudProviders[number];
export type AIProvider = "local" | CloudProvider;
export type OutputFormat = "json_schema" | "json_object";
interface ProviderDetails {
  name: string; model: string; keyUrl: string; envKey: string;
  endpoint: string; format: OutputFormat; note: string;
}
export const providerDetails: Record<AIProvider, ProviderDetails> = {
  local: { name: "Local Qwen3-8B", model: "", keyUrl: "", envKey: "", endpoint: "", format: "json_schema", note: "Runs on this computer." },
  openai: { name: "OpenAI", model: "gpt-6-astra", keyUrl: "https://platform.openai.com/api-keys", envKey: "OPENAI_API_KEY", endpoint: "https://api.openai.com/v1/responses", format: "json_schema", note: "OpenAI API key; ChatGPT billing is separate." },
  anthropic: { name: "Anthropic", model: "claude-opus-5", keyUrl: "https://platform.claude.com/settings/keys", envKey: "ANTHROPIC_API_KEY", endpoint: "https://api.anthropic.com/v1/messages", format: "json_schema", note: "Anthropic API key; Claude chat billing is separate." },
  openrouter: { name: "OpenRouter", model: "", keyUrl: "https://openrouter.ai/settings/keys", envKey: "OPENROUTER_API_KEY", endpoint: "https://openrouter.ai/api/v1/chat/completions", format: "json_schema", note: "Routes to upstream model providers. Enter a provider/model ID." },
  zai: { name: "GLM · Z.ai", model: "glm-5", keyUrl: "https://docs.z.ai/guides/overview/quick-start", envKey: "ZAI_API_KEY", endpoint: "https://api.z.ai/api/paas/v4/chat/completions", format: "json_object", note: "Z.ai general API. Use a GLM model with JSON mode; this is not the Coding Plan endpoint." },
  moonshot: { name: "Kimi · Moonshot", model: "kimi-k3", keyUrl: "https://platform.moonshot.ai/console/api-keys", envKey: "MOONSHOT_API_KEY", endpoint: "https://api.moonshot.ai/v1/chat/completions", format: "json_object", note: "Moonshot international API, not Kimi Code. Use a Kimi model with JSON mode. Regional keys need the matching endpoint." },
  deepseek: { name: "DeepSeek", model: "", keyUrl: "https://platform.deepseek.com/api_keys", envKey: "DEEPSEEK_API_KEY", endpoint: "https://api.deepseek.com/chat/completions", format: "json_object", note: "Use a DeepSeek chat model with JSON output support." },
  gemini: { name: "Google Gemini", model: "gemini-3.8-flash", keyUrl: "https://aistudio.google.com/apikey", envKey: "GEMINI_API_KEY", endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", format: "json_schema", note: "Google AI Studio API key through Google's OpenAI-compatible API." },
  groq: { name: "Groq", model: "", keyUrl: "https://console.groq.com/keys", envKey: "GROQ_API_KEY", endpoint: "https://api.groq.com/openai/v1/chat/completions", format: "json_schema", note: "Choose a model with structured output support, or select JSON mode if supported." },
  mistral: { name: "Mistral", model: "", keyUrl: "https://console.mistral.ai/api-keys", envKey: "MISTRAL_API_KEY", endpoint: "https://api.mistral.ai/v1/chat/completions", format: "json_object", note: "Mistral API key with JSON-mode chat model access." },
  xai: { name: "Grok · xAI", model: "", keyUrl: "https://console.x.ai", envKey: "XAI_API_KEY", endpoint: "https://api.x.ai/v1/chat/completions", format: "json_schema", note: "xAI API key; an X or Grok chat subscription is not an API key." },
  together: { name: "Together AI", model: "", keyUrl: "https://api.together.ai/settings/api-keys", envKey: "TOGETHER_API_KEY", endpoint: "https://api.together.xyz/v1/chat/completions", format: "json_schema", note: "Enter the complete model ID from your Together account." },
  fireworks: { name: "Fireworks AI", model: "", keyUrl: "https://fireworks.ai/account/api-keys", envKey: "FIREWORKS_API_KEY", endpoint: "https://api.fireworks.ai/inference/v1/chat/completions", format: "json_schema", note: "Use the full model or deployment ID, including its accounts/... path." },
  cerebras: { name: "Cerebras", model: "", keyUrl: "https://cloud.cerebras.ai", envKey: "CEREBRAS_API_KEY", endpoint: "https://api.cerebras.ai/v1/chat/completions", format: "json_schema", note: "Cerebras Inference API key and an available chat model." },
  sambanova: { name: "SambaNova", model: "", keyUrl: "https://cloud.sambanova.ai", envKey: "SAMBANOVA_API_KEY", endpoint: "https://api.sambanova.ai/v1/chat/completions", format: "json_schema", note: "Schema output is model-dependent; Cutroom validates every proposal locally." },
  dashscope: { name: "Qwen · Alibaba Cloud", model: "qwen-plus", keyUrl: "https://www.alibabacloud.com/help/en/model-studio/get-api-key", envKey: "DASHSCOPE_API_KEY", endpoint: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions", format: "json_object", note: "Singapore API key. Thinking is disabled for JSON output; choose a model that supports non-thinking mode. Other regions or workspace URLs use Custom." },
  siliconflow: { name: "SiliconFlow", model: "", keyUrl: "https://cloud.siliconflow.com/account/ak", envKey: "SILICONFLOW_API_KEY", endpoint: "https://api.siliconflow.com/v1/chat/completions", format: "json_object", note: "International endpoint. Choose a model supporting the selected JSON format." },
  custom: { name: "Custom OpenAI-compatible", model: "", keyUrl: "", envKey: "CUSTOM_AI_API_KEY", endpoint: "", format: "json_object", note: "Set CUTROOM_CUSTOM_AI_BASE_URL in the local .env file and restart. Use a trusted HTTPS OpenAI-compatible service and its own key." },
};
export interface ProviderStatus {
  provider: CloudProvider;
  configured: boolean;
  source: "session" | "environment" | null;
  endpoint?: string;
  endpointReady?: boolean;
}
