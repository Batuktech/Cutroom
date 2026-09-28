import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { AutopostPlatform, SocialAccountStatus } from "../../shared/streams";
import { api, post } from "../lib/api";
import { Button } from "./ui/button";

const names: Record<AutopostPlatform, { title: string; idLabel: string; setup: string[] }> = {
  youtube: { title: "YouTube", idLabel: "Client ID", setup: [
    "In Google Cloud Console, create a project and enable YouTube Data API v3.",
    "Configure the OAuth consent screen and add your Google account as a test user.",
    "Create an OAuth client ID of type Desktop app, then copy its client ID and secret here.",
  ] },
  tiktok: { title: "TikTok", idLabel: "Client key", setup: [
    "In TikTok for Developers, create an app on the Desktop platform.",
    "Add Login Kit and Content Posting API with Direct Post, and request user.info.basic and video.publish.",
    "Register the redirect URI shown below, then copy the client key and secret here.",
  ] },
};

function AppCredentials({ account, update }: { account: SocialAccountStatus; update: (next: SocialAccountStatus[]) => void }) {
  const name = names[account.platform];
  const [editing, setEditing] = useState(!account.appConfigured);
  const [clientId, setClientId] = useState(""), [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setSaved("");
    try {
      update(await api<SocialAccountStatus[]>(`/social/${account.platform}/app`, { method: "PUT", body: JSON.stringify({ clientId, clientSecret }) }));
      setClientId(""); setClientSecret(""); setEditing(false);
      setSaved("App credentials saved. Now connect the account that should receive posts.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError(""); setSaved("");
    try { update(await api<SocialAccountStatus[]>(`/social/${account.platform}/app`, { method: "DELETE" })); setEditing(true); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const id = `app-${account.platform}`;
  return <>
    <p className="suggestion-note">{account.appSource === "saved" ? `Developer app saved in this studio (${name.idLabel.toLowerCase()} ${account.clientHint}).`
      : account.appSource === "environment" ? `Developer app read from .env (${name.idLabel.toLowerCase()} ${account.clientHint}). Saving here overrides it.`
      : "No developer app yet. Add your app's credentials to enable sign-in."}</p>
    {!editing ? <div className="provider-key-actions">
      <Button variant="ghost" size="small" onClick={() => { setEditing(true); setSaved(""); }}>Replace app credentials</Button>
      {account.appSource === "saved" && <Button variant="ghost" size="small" disabled={busy} onClick={() => void remove()}>Remove saved credentials</Button>}
    </div> : <form className="social-app-form" onSubmit={save}>
      <details className="social-copy-section">
        <summary>How to create the {name.title} app</summary>
        <ol className="social-setup-steps">{name.setup.map(step => <li key={step}>{step}</li>)}</ol>
      </details>
      <div className="social-fields">
        <label className="field-label" htmlFor={`${id}-id`}>{name.idLabel}
          <input id={`${id}-id`} autoComplete="off" spellCheck={false} maxLength={512} required value={clientId} disabled={busy} onChange={e => setClientId(e.target.value)} />
        </label>
        <label className="field-label" htmlFor={`${id}-secret`}>Client secret
          <input id={`${id}-secret`} type="password" autoComplete="off" spellCheck={false} maxLength={512} required value={clientSecret} disabled={busy} onChange={e => setClientSecret(e.target.value)} />
        </label>
      </div>
      <div className="provider-key-actions">
        <Button type="submit" variant="secondary" disabled={busy || !clientId.trim() || !clientSecret.trim()}>{busy ? "Saving…" : "Save app credentials"}</Button>
        {account.appConfigured && <Button variant="ghost" disabled={busy} onClick={() => { setEditing(false); setError(""); }}>Keep current app</Button>}
      </div>
      {account.appConfigured && <p className="settings-footnote">Using a different {name.idLabel.toLowerCase()} disconnects the current account, because its sign-in belongs to the old app.</p>}
    </form>}
    {saved && <p role="status" className="suggestion-note">{saved}</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
  </>;
}

export function SocialAccounts() {
  const [accounts, setAccounts] = useState<SocialAccountStatus[] | null>(null);
  const [error, setError] = useState(""), [waiting, setWaiting] = useState<AutopostPlatform | null>(null);
  async function load() {
    try {
      const next = await api<SocialAccountStatus[]>("/social/accounts");
      setAccounts(next); setError("");
      setWaiting(w => w && next.find(a => a.platform === w)?.connected ? null : w);
    }
    catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void Promise.resolve().then(load); }, []);
  // Sign-in finishes in another tab; poll until the account appears.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void load(), 2000);
    const stop = setTimeout(() => setWaiting(null), 10 * 60_000);
    return () => { clearInterval(timer); clearTimeout(stop); };
  }, [waiting]);
  async function connect(platform: AutopostPlatform) {
    setError("");
    try {
      const { url } = await post<{ url: string }>(`/social/${platform}/connect`);
      window.open(url, "_blank", "noopener");
      setWaiting(platform);
    } catch (e) { setError((e as Error).message); }
  }
  async function disconnect(platform: AutopostPlatform) {
    try { setAccounts(await api<SocialAccountStatus[]>(`/social/${platform}`, { method: "DELETE" })); }
    catch (e) { setError((e as Error).message); }
  }
  return <section className="settings-section">
    <div className="settings-heading"><div>
      <h2>Auto-publishing accounts</h2>
      <p>Stream autopilot posts clips straight to YouTube and TikTok through your own developer apps. App secrets and sign-in tokens are saved on this computer, readable only by your user account. They are never shown again, sent to the browser, or included in project backups.</p>
    </div></div>
    {!accounts && !error && <p role="status">Loading accounts…</p>}
    {accounts?.map(a => <div className="social-channel" key={a.platform}>
      <h3 className="social-account-title">{names[a.platform].title}</h3>
      <AppCredentials account={a} update={setAccounts} />
      <p className="suggestion-note provider-endpoint">Redirect URI to register: {a.redirectUri}</p>
      {a.connected && <p className="suggestion-note"><Check size={14} aria-hidden /> Connected{a.account ? ` as ${a.account}` : ""}</p>}
      {a.appConfigured && <div className="provider-key-actions">
        <Button disabled={waiting === a.platform} variant={a.connected ? "ghost" : "default"} onClick={() => void connect(a.platform)}>
          {waiting === a.platform ? "Waiting for sign-in in the other tab…" : a.connected ? "Reconnect" : `Connect ${names[a.platform].title} account`}</Button>
        {a.connected && <Button variant="ghost" onClick={() => void disconnect(a.platform)}>Disconnect</Button>}
      </div>}
    </div>)}
    {error && <p role="alert" className="error-message">{error}</p>}
  </section>;
}
