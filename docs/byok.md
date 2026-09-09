# Cloud AI with your own API key

Cutroom offers **16 built-in providers plus a custom OpenAI-compatible endpoint** to suggest clips from a transcript. Qwen stays the default and runs locally. Cloud review needs no local Qwen installation or GPU. Whisper transcription, caption rendering, and video export remain local.

## Provider catalog

| Provider | Environment key | Default format / endpoint scope |
| --- | --- | --- |
| OpenAI | `OPENAI_API_KEY` | Native Responses JSON schema |
| Anthropic | `ANTHROPIC_API_KEY` | Native Messages JSON schema |
| OpenRouter | `OPENROUTER_API_KEY` | JSON schema; upstream model routing |
| GLM / Z.ai | `ZAI_API_KEY` | JSON mode; general international API |
| Kimi / Moonshot | `MOONSHOT_API_KEY` | JSON mode; international API |
| DeepSeek | `DEEPSEEK_API_KEY` | JSON mode |
| Google Gemini | `GEMINI_API_KEY` | JSON schema; Google AI Studio compatible API |
| Groq | `GROQ_API_KEY` | JSON schema; model-dependent |
| Mistral | `MISTRAL_API_KEY` | JSON mode |
| Grok / xAI | `XAI_API_KEY` | JSON schema |
| Together AI | `TOGETHER_API_KEY` | JSON schema |
| Fireworks AI | `FIREWORKS_API_KEY` | JSON schema; full model/deployment ID |
| Cerebras | `CEREBRAS_API_KEY` | JSON schema |
| SambaNova | `SAMBANOVA_API_KEY` | JSON schema; enforcement varies |
| Qwen / Alibaba Cloud | `DASHSCOPE_API_KEY` | JSON mode; Singapore endpoint, thinking disabled |
| SiliconFlow | `SILICONFLOW_API_KEY` | JSON mode; international endpoint |
| Custom OpenAI-compatible | `CUSTOM_AI_API_KEY` | JSON mode by default; server-configured HTTPS endpoint |

The catalog covers common API-key services, not every proprietary API or every model. Availability and JSON support vary by account and model. Kimi K3 uses low reasoning effort to leave more of the output budget for the clip result; other Kimi models retain their defaults. GLM and Kimi presets use general APIs, not coding-subscription endpoints. Use the provider's own API key; keys cannot be exchanged between services. Regional accounts need matching endpoints. The displayed destination lets you check where the transcript will go.

## Set up and review

1. Open **Studio settings → Cloud AI · bring your own key**, choose a provider, and follow **Get an API key**. Configure billing with that provider as needed.
2. Paste the key and choose **Use key for this session**. This saves the key in the local server's memory; it does not make an inference request or verify provider access. Restarting Cutroom clears it.
3. Open a transcribed project and choose **Suggest cuts → AI review → Review with**. Select the provider. You can also add a key directly in this dialog.
4. Enter the exact **Model ID** from your provider. The model must support the selected JSON output format. Use **Output compatibility** to select the provider default, JSON schema, or JSON mode on compatible chat APIs. JSON mode receives the schema in its prompt and is still validated locally. OpenAI and Anthropic use their native schema APIs. The OpenAI and Anthropic fields provide editable examples; OpenRouter requires a `provider/model` ID. Availability depends on your account. Cutroom does not automatically select another model or provider on failure.
5. Choose interests, duration, candidate count, and review strictness. Set a **Request cap per analysis** (1–100, default 20). Discovery uses one request per section. Reviewed and Strict add one request per checked candidate.
6. Read and check the transcript-sharing confirmation, then analyze. Preview the saved findings, stop early if needed, and add selected clips.

Cloud output goes through the same source-index, duration, pause, quote, duplicate, and source-fingerprint checks as local suggestions. The AI never edits a video automatically. Grounded timestamps still depend on an accurate transcript.

Sections contain at most 120 segments and approximately 16,000 characters, with overlap based on the maximum clip length. The scan keeps a bounded pool of proposals, ranks them, and saves up to your selected candidate count. It rejects overlong proposals rather than silently cutting off their endings. Very dense transcripts can still split a moment across sections.

## Billing and limits

Cutroom charges nothing for this feature; **the API provider can charge for each request**. The request cap is not a dollar limit. Set a spending limit in the provider's billing dashboard and use a small cap for a first trial. Each request permits up to 4,096 output tokens; input size, reasoning, model choice, provider-specific pricing, and failed or cancelled requests affect billing. Saved token totals reflect usage reported in successful responses, not a complete invoice.

Reaching the request cap stops further requests and saves a partial result. Some transcript sections or second reviews may remain unfinished. Reviewed keeps unchecked candidates marked for closer review; Strict only shows candidates that passed the second check. A new run starts from the beginning and can incur charges for sections scanned before; it is not a resume operation.

Requests time out after two minutes and are not automatically retried. Cancellation aborts the in-flight HTTP request and prevents later results from being saved, but cannot revoke a request the provider already received. Provider failures leave existing saved findings available. Forgetting a session key does not cancel an analysis already running; use **Stop analysis, keep findings** for that.

## Chat subscriptions

There is no ChatGPT/Claude subscription login in Cutroom. ChatGPT and the OpenAI API have separate billing systems. Anthropic directs developers building products for other users to API keys or supported cloud providers. A consumer chat subscription is not a general API credential. Cutroom does not read Codex/Claude login files, browser cookies, or subscription tokens.

Official references:

- [OpenAI: ChatGPT and API billing](https://help.openai.com/en/articles/9039756)
- [Anthropic: paid Claude plans and API billing](https://support.claude.com/en/articles/9876003-i-have-a-paid-claude-subscription-pro-max-team-or-enterprise-plans-why-do-i-have-to-pay-separately-to-use-the-claude-api-and-console)
- [Anthropic: supported account authentication and third-party tools](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs)

## Keys and privacy

The sharing confirmation applies to one analysis with the selected provider. Requests contain transcript passages, segment indexes/timestamps, interests, and editorial guidance. OpenRouter routes those requests to its model providers. Audio files, video files, project paths, and API keys are not part of the prompt. Provider data policies apply to submitted text. OpenAI requests set `store: false`; this is not a promise of zero provider retention.

Keys entered in the UI go only to the loopback server, then to the selected provider in authentication headers. They are never returned by the API or saved in browser storage, projects, metadata backups, or job history. **Forget session key** removes the server's configured session key. Requests use fixed HTTPS endpoints and reject redirects; built-in base URLs cannot be changed by a review request. Custom destinations are configured by the local operator as described below.

For persistence, add one or more variables to your untracked local `.env` file and restart Cutroom:

```dotenv
OPENAI_API_KEY=your-api-key
ANTHROPIC_API_KEY=your-api-key
OPENROUTER_API_KEY=your-api-key
```

A session key overrides that provider's environment key. Forgetting the session key restores the environment key if present. To remove an environment key, edit `.env` or your shell environment and restart. Environment files are plaintext; keep them private and out of source control and shared backups. Cutroom metadata backups exclude these credentials. Anyone with access to your OS account or local server can use the configured provider; keep the app on loopback.

## Other providers and regional endpoints

Choose **Custom OpenAI-compatible** for a service or gateway implementing `POST /chat/completions` with Bearer-key authentication and JSON mode or JSON schema output. This includes compatible regional endpoints and gateways; it does not implement AWS request signing, OAuth, or vendor-specific APIs. Configure the base URL on the local server:

```dotenv
CUTROOM_CUSTOM_AI_BASE_URL=https://your-trusted-provider.example/v1
CUSTOM_AI_API_KEY=your-api-key
```

Replace the example with your provider's documented API base, then restart Cutroom. A full `/chat/completions` URL is also accepted. Enter the model ID in the review dialog and select a supported output format. The UI displays the configured destination, and the analyze request must confirm that exact destination. Missing or invalid configuration disables custom review.

Use a trusted HTTPS hostname without embedded credentials, query parameters, fragments, or nonstandard ports. Literal IPs, loopback names, and common internal suffixes are rejected. The configuration is trusted operator input: these syntactic checks are not a DNS-based network sandbox. Do not point it at a service you do not control or trust with the transcript and its dedicated API key. The app never accepts an endpoint from model output, imported metadata, or an arbitrary browser request. Redirects remain disabled, and it never retries with another provider or format automatically.

Provider references used for the adapters:

- [Z.ai JSON output](https://docs.z.ai/guides/capabilities/struct-output) and [Kimi JSON mode](https://platform.kimi.ai/docs/guide/use-json-mode-feature-of-kimi-api)
- [DeepSeek API](https://api-docs.deepseek.com/) and [Gemini compatibility](https://ai.google.dev/gemini-api/docs/openai)
- [Groq structured outputs](https://console.groq.com/docs/structured-outputs) and [Mistral chat API](https://docs.mistral.ai/api/endpoint/chat)
- [xAI structured outputs](https://docs.x.ai/developers/model-capabilities/text/structured-outputs) and [Together structured outputs](https://docs.together.ai/docs/inference/chat/structured-outputs)
- [Fireworks compatibility](https://docs.fireworks.ai/tools-sdks/openai-compatibility) and [Cerebras structured outputs](https://inference-docs.cerebras.ai/capabilities/structured-outputs)
- [SambaNova JSON output](https://docs.sambanova.ai/docs/en/features/function-calling), [Alibaba compatibility](https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions), and [SiliconFlow JSON mode](https://docs.siliconflow.com/en/userguide/guides/json-mode)

## Troubleshooting

- **401/403:** check API key, account permissions, and model access.
- **429:** check credit balance, billing, quota, and rate limits.
- **400/404 or incomplete structured result:** verify the model ID and JSON-schema support. Some models spend their output budget on reasoning or refuse a request; no partial JSON is accepted.
- **No candidates:** inspect the transcript and try Discovery with several interests. A one-request cap is useful for testing connectivity but may cover only a small part of a long video.

`npm test` exercises the adapters with mocked HTTP responses. `npm run test:byok` exercises the real local API, job queue, saving, cancellation, and secret redaction with a synthetic demo and a network-blocking provider fixture. It requires FFmpeg, not API credits or downloaded AI models. These tests verify mechanics; they do not establish output quality or live account/model access.
