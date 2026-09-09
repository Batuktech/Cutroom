// Loaded only by the isolated API test process. No request can reach a cloud provider.
if (process.env.CUTROOM_MOCK_AI_TEST !== "1") throw new Error("This fixture is only for the isolated BYOK test.");
globalThis.fetch = async (url, init) => {
  const endpoint = String(url);
  if (!["https://api.openai.com/v1/responses", "https://api.anthropic.com/v1/messages", "https://openrouter.ai/api/v1/chat/completions"].includes(endpoint)) throw new Error("Unexpected network request in test");
  const body = JSON.parse(init.body);
  if (body.model === "test-delayed") await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 800);
    init.signal.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("Cancelled")); }, { once: true });
  });
  if (body.model === "test-failure") return new Response("sk-synthetic-secret", { status: 429 });
  const text = (body.input ?? body.messages).at(-1).content;
  const transcript = JSON.parse(text.split("TRANSCRIPT:\n")[1]);
  const output = text.startsWith("Independently")
    ? { context: true, ending: true, appeal: true, clarity: true, weakness: "" }
    : { candidates: [{ first: transcript[0].index, last: transcript[Math.min(2, transcript.length - 1)].index, title: "A useful idea", reason: "A complete synthetic thought.", weakness: "Check the video.", strength: 3 }] };
  if (endpoint.includes("anthropic")) return Response.json({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(output) }], usage: { input_tokens: 100, output_tokens: 30 } });
  if (endpoint.includes("openrouter")) return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 100, completion_tokens: 30 } });
  return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }], usage: { input_tokens: 100, output_tokens: 30 } });
};
