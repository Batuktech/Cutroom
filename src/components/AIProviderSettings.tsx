import { useState } from "react";
import { cloudProviders, providerDetails, type CloudProvider, type ProviderStatus } from "../../shared/ai-providers";
import { api } from "../lib/api";
import { useAIProviders } from "../lib/useAIProviders";
import { Button } from "./ui/button";


export function ProviderKeyForm({ provider, status, refresh }: {
  provider: CloudProvider; status?: ProviderStatus; refresh: () => Promise<void>;
}) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function update(forget = false) {
    setBusy(true); setError(""); setMessage("");
    try {
      await api(`/ai/providers/${provider}`, { method: forget ? "DELETE" : "PUT", ...(forget ? {} : { body: JSON.stringify({ apiKey: key }) }) });
      setKey("");
      await refresh();
      setMessage(forget ? "Session key removed. An environment key, if configured, remains available." : "Key saved for this server session. It has not been tested with the provider.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="provider-key-form">
    <p className="suggestion-note">{providerDetails[provider].note}</p>
    <p className="suggestion-note provider-endpoint">Destination: {status?.endpoint || providerDetails[provider].endpoint || "Not configured"}</p>
    {provider === "custom" && !status?.endpointReady && <p role="status" className="error-message">Custom review is unavailable until CUTROOM_CUSTOM_AI_BASE_URL is configured on the server.</p>}
    <p className="suggestion-note" role="status">{status?.configured ? `Key available · ${status.source === "session" ? "server session" : "server environment"}` : "No API key configured"}</p>
    <label className="field-label">{providerDetails[provider].name} API key
      <input type="password" value={key} onChange={e => setKey(e.target.value)} autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={4096} disabled={busy} placeholder={status?.configured ? "Enter a replacement key" : "Paste your API key"} />
    </label>
    <div className="provider-key-actions">
      <Button variant="secondary" size="small" disabled={busy || !key.trim()} onClick={() => void update()}>{busy ? "Saving…" : "Use key for this session"}</Button>
      {status?.source === "session" && <Button variant="ghost" size="small" disabled={busy} onClick={() => void update(true)}>Forget session key</Button>}
      {providerDetails[provider].keyUrl && <a href={providerDetails[provider].keyUrl} target="_blank" rel="noreferrer">Get an API key ↗</a>}
    </div>
    <p className="suggestion-note">Keys entered here stay in server memory until Cutroom restarts. They are not saved in your browser, projects, or metadata backups. For persistence, set <code>{providerDetails[provider].envKey}</code> in your local .env file.</p>
    {message && <p className="suggestion-note" role="status">{message}</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </div>;
}

function claudeCodeState(status?: ProviderStatus) {
  const cli = status?.cli;
  if (!cli) return "Checking for Claude Code on this computer…";
  if (!cli.installed) return "Claude Code was not found on this computer.";
  const version = cli.version ? ` ${cli.version}` : "";
  if (!cli.loggedIn) return `Claude Code${version} is installed but not signed in.`;
  return `Claude Code${version} is signed in${cli.authMethod === "claude.ai" ? " with a Claude account" : ""}.`;
}

export function ClaudeCodePanel({ status, refresh }: { status?: ProviderStatus; refresh: (recheck?: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const details = providerDetails["claude-code"];
  async function recheck() {
    setBusy(true);
    try { await refresh(true); } finally { setBusy(false); }
  }
  return <div className="provider-key-form">
    <p className="suggestion-note">{details.note}</p>
    <p className="suggestion-note provider-endpoint">Destination: {details.endpoint}</p>
    <p className="suggestion-note" role="status">{busy ? "Checking Claude Code…" : claudeCodeState(status)}</p>
    {status?.cli && !status.configured && <p className="suggestion-note">
      {status.cli.installed ? "Open a terminal and run claude to sign in with your Claude subscription. Or run claude setup-token, set CLAUDE_CODE_OAUTH_TOKEN in the environment that starts Cutroom, and restart it. Then check again." : "Install Claude Code, run claude in a terminal to sign in, then check again. If it is installed outside your PATH, set CUTROOM_CLAUDE_CODE_BIN in .env and restart Cutroom."}
    </p>}
    <div className="provider-key-actions">
      <Button variant="secondary" size="small" disabled={busy} onClick={() => void recheck()}>{busy ? "Checking…" : "Check again"}</Button>
      <a href={details.keyUrl} target="_blank" rel="noreferrer">Claude Code setup guide ↗</a>
    </div>
    <p className="suggestion-note">Cutroom starts Claude Code with tools, plugins, hooks and MCP servers turned off, and sends the transcript through standard input. Cutroom has no field for Claude tokens and never reads or stores your Claude login; a setup-token in the environment is used only by Claude Code itself.</p>
  </div>;
}

export function ProviderKeyDisclosure(props: { provider: CloudProvider; status?: ProviderStatus; refresh: (recheck?: boolean) => Promise<void> }) {
  const [open, setOpen] = useState(!props.status?.configured);
  const cli = props.provider === "claude-code";
  return <details className="suggestion-extra" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
    <summary>{cli ? (props.status?.configured ? "Claude Code signed in · details" : "Set up Claude Code") : props.status?.configured ? "API key available · manage key" : "Add your API key"}</summary>
    {cli ? <ClaudeCodePanel status={props.status} refresh={props.refresh} /> : <ProviderKeyForm {...props} />}
  </details>;
}

export function AIProviderSettings() {
  const [provider, setProvider] = useState<CloudProvider>("openai");
  const { statuses, refresh, error } = useAIProviders();
  return <section className="settings-section cloud-ai-settings">
    <div className="settings-heading"><div><h2>Cloud AI · bring your own key</h2>
      <p>Use an API model, or your own signed-in Claude Code, for clip suggestions. Local Qwen and free transcript rules remain available.</p></div></div>
    <label className="field-label">Provider<select value={provider} onChange={e => setProvider(e.target.value as CloudProvider)}>
      {cloudProviders.map(id => <option key={id} value={id}>{providerDetails[id].name}</option>)}
    </select></label>
    {provider === "claude-code"
      ? <ClaudeCodePanel status={statuses.find(s => s.provider === provider)} refresh={refresh} />
      : <ProviderKeyForm key={provider} provider={provider} status={statuses.find(s => s.provider === provider)} refresh={refresh} />}
    {error && <p role="alert" className="error-message">{error} <Button variant="secondary" size="small" onClick={() => void refresh()}>Retry</Button></p>}
    <p className="settings-footnote">API usage is billed by your provider. ChatGPT and Claude chat subscriptions do not include general API credits, but Claude Code (local CLI) can use your own Claude sign-in through the official CLI. Cutroom never reads or stores chat logins or subscription tokens. You choose the provider and confirm transcript sharing before each cloud analysis.</p>
  </section>;
}
