#!/usr/bin/env node
// Synthetic Claude Code CLI for the isolated BYOK test. It never contacts Anthropic.
import { syntheticAnswer } from "./clip-answer.mjs";

const args = process.argv.slice(2);
if (args[0] === "--version") { console.log("0.0.0 (Claude Code test fixture)"); process.exit(0); }
if (args[0] === "auth") { console.log(JSON.stringify({ loggedIn: true, authMethod: "claude.ai", email: "person@example.com" })); process.exit(0); }
let input = "";
process.stdin.on("data", data => { input += data; });
process.stdin.on("end", () => {
  const model = args.find(a => a.startsWith("--model="))?.slice(8);
  const reply = () => process.stdout.write(JSON.stringify({ type: "result", subtype: "success", is_error: false, structured_output: syntheticAnswer(input),
    modelUsage: { "claude-test": { inputTokens: 100, outputTokens: 30 } } }));
  if (model === "test-delayed") setTimeout(reply, 800); else reply();
});
