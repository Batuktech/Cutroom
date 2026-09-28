import { useEffect, useState } from "react";
import type { PostizChannel, PostizStatus } from "../../shared/publishing";
import { api } from "../lib/api";
import { Button } from "./ui/button";

export function PostizSettings() {
  const [status, setStatus] = useState<PostizStatus | null>(null);
  const [key, setKey] = useState("");
  const [channels, setChannels] = useState<PostizChannel[] | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  async function load() {
    setError("");
    try { setStatus(await api<PostizStatus>("/postiz")); }
    catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void Promise.resolve().then(load); }, []);
  async function update(forget = false) {
    setBusy(true); setError(""); setMessage(""); setChannels(null);
    try {
      setStatus(await api<PostizStatus>("/postiz", { method: forget ? "DELETE" : "PUT", ...(forget ? {} : { body: JSON.stringify({ apiKey: key }) }) }));
      setKey(""); setMessage(forget ? "Session key removed. An environment key may remain configured." : "Key saved for this server session. Load channels to test the connection.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function connect() {
    setBusy(true); setError(""); setMessage("");
    try { setChannels(await api<PostizChannel[]>("/postiz/channels")); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="settings-section">
    <div className="settings-heading"><div><h2>Publish through Postiz</h2><p>Connect your channels in Postiz, then prepare posts from a saved clip.</p></div></div>
    {!status && !error && <p role="status">Loading Postiz settings…</p>}
    {status && <>
      <p className="suggestion-note provider-endpoint">Upload destination: {status.destination}</p>
      <p className="suggestion-note">{status.configured ? `Key available in ${status.source === "session" ? "this server session" : "the server environment"}.` : "No Postiz key configured."}</p>
      <label className="field-label">Postiz API key<input type="password" autoComplete="off" spellCheck={false} maxLength={4096} value={key} disabled={busy} onChange={e => setKey(e.target.value)} placeholder="Copy from Postiz → Developers → Access" /></label>
      <div className="provider-key-actions">
        <Button variant="secondary" disabled={busy || !key.trim()} onClick={() => void update()}>Use key for this session</Button>
        {status.source === "session" && <Button variant="ghost" disabled={busy} onClick={() => void update(true)}>Forget session key</Button>}
        <Button variant="secondary" disabled={busy || !status.configured} onClick={() => void connect()}>Load connected channels</Button>
      </div>
      <p className="settings-footnote">For persistence, set POSTIZ_API_KEY in your private .env. For self-hosting, also set CUTROOM_POSTIZ_API_URL to your Postiz API URL ending in /public/v1. Restart Cutroom after environment changes. Keys stay on the server and are excluded from project metadata.</p>
    </>}
    {busy && <p role="status">Contacting the local server…</p>}
    {message && <p role="status" className="suggestion-note">{message}</p>}
    {channels && <div className="social-channel-list">{channels.length ? channels.map(c => <p key={c.id}>{c.name} · {c.identifier} · {c.disabled ? "Reconnect in Postiz" : "Connected"}</p>) : <p>No YouTube, TikTok or Instagram channels are connected. Add them in Postiz, then load channels again.</p>}</div>}
    {error && <p role="alert" className="error-message">{error} <Button variant="secondary" onClick={() => void load()}>Reload settings</Button></p>}
  </section>;
}
