import { z } from "zod";
import type { CloudProvider } from "../shared/ai-providers.js";

export interface AIRequest {
  provider: CloudProvider;
  model: string;
  apiKey: string;
  instruction: string;
  input: string;
  schema: Record<string, unknown>;
  signal?: AbortSignal;
}
export interface AIResponse { data: unknown; inputTokens: number; outputTokens: number }
const endpoints = {
  openai: "https://api.openai.com/v1/responses",
  anthropic: "https://api.anthropic.com/v1/messages",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};
const tokenCount = z.number().int().nonnegative().catch(0);
const textBlock = z.object({ type: z.string(), text: z.string().optional() });

export async function requestAI(request: AIRequest): Promise<AIResponse> {
  const { provider, model, apiKey, instruction, input, schema } = request;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const messages = [{ role: "system", content: instruction }, { role: "user", content: input }];
  let body: unknown;
  if (provider === "openai") {
    headers.Authorization = `Bearer ${apiKey}`;
    body = { model, store: false, input: messages, max_output_tokens: 4096,
      text: { format: { type: "json_schema", name: "clip_review", strict: true, schema } } };
  } else if (provider === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    body = { model, max_tokens: 4096, system: instruction, messages: messages.slice(1),
      output_config: { format: { type: "json_schema", schema } } };
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
    body = { model, messages, max_tokens: 4096, provider: { require_parameters: true },
      response_format: { type: "json_schema", json_schema: { name: "clip_review", strict: true, schema } } };
  }
  const signal = AbortSignal.any([...(request.signal ? [request.signal] : []), AbortSignal.timeout(120_000)]);
  try {
    const response = await fetch(endpoints[provider], { method: "POST", headers, body: JSON.stringify(body), redirect: "error", signal });
    if (!response.ok) {
      await response.body?.cancel();
      const hint = response.status === 401 || response.status === 403 ? "Check your API key and model access."
        : response.status === 429 ? "Check your provider quota, billing, or rate limit."
        : response.status === 400 || response.status === 404 ? "Check the model ID and its structured-output support."
        : "Try again later or choose another model.";
      throw new ProviderError(`The provider returned HTTP ${response.status}. ${hint} Saved findings remain available. No automatic retry was sent.`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 1_000_000) throw new Error();
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const raw: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    let text: string;
    let inputTokens: number, outputTokens: number;
    if (provider === "openai") {
      const result = z.object({ status: z.literal("completed"), output: z.array(z.object({ type: z.string(), content: z.array(textBlock).optional() })),
        usage: z.object({ input_tokens: tokenCount, output_tokens: tokenCount }).optional() }).parse(raw);
      text = result.output.flatMap(o => o.type === "message" ? o.content ?? [] : []).filter(c => c.type === "output_text").map(c => c.text ?? "").join("");
      inputTokens = result.usage?.input_tokens ?? 0; outputTokens = result.usage?.output_tokens ?? 0;
    } else if (provider === "anthropic") {
      const result = z.object({ stop_reason: z.literal("end_turn"), content: z.array(textBlock),
        usage: z.object({ input_tokens: tokenCount, output_tokens: tokenCount }).optional() }).parse(raw);
      text = result.content.filter(c => c.type === "text").map(c => c.text ?? "").join("");
      inputTokens = result.usage?.input_tokens ?? 0; outputTokens = result.usage?.output_tokens ?? 0;
    } else {
      const result = z.object({ choices: z.array(z.object({ finish_reason: z.literal("stop"), message: z.object({ content: z.string(), refusal: z.null().optional() }) })).min(1),
        usage: z.object({ prompt_tokens: tokenCount, completion_tokens: tokenCount }).optional() }).parse(raw);
      text = result.choices[0].message.content;
      inputTokens = result.usage?.prompt_tokens ?? 0; outputTokens = result.usage?.completion_tokens ?? 0;
    }
    return { data: JSON.parse(text), inputTokens, outputTokens };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (request.signal?.aborted) throw new ProviderError("Analysis cancelled. The provider may bill a request already received.");
    if (signal.aborted) throw new ProviderError("The provider request timed out. Saved findings remain available; the request may still be billed. No automatic retry was sent.");
    // Never include upstream errors: they may echo headers, prompts, or credentials.
    throw new ProviderError("The provider could not return a complete structured result. Check your connection and model support. Saved findings remain available; no automatic retry was sent.");
  }
}
class ProviderError extends Error {}
