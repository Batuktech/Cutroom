import { useEffect, useState } from "react";
import { Check, ChevronDown, LoaderCircle, Play, Music2, ShieldCheck } from "lucide-react";
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
    "Add Login Kit and the Content Posting API, and request user.info.basic, video.upload and video.publish.",
    "Register the redirect URI shown below, then copy the client key and secret here.",
  ] },
};

function AppCredentials({ account, update }: { account: SocialAccountStatus; update: (next: SocialAccountStatus[]) => void }) {
  const name = names[account.platform];
  const [editing, setEditing] = useState(!account.appConfigured || account.appSource === "cutroom");
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
    <p className="suggestion-note">{account.appSource === "cutroom" ? "Using Cutroom's app. Add your own developer app if you want a separate upload quota or your own app review."
      : account.appSource === "saved" ? `Developer app saved in this studio (${name.idLabel.toLowerCase()} ${account.clientHint}).`
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
        {account.appConfigured && account.appSource !== "cutroom" && <Button variant="ghost" disabled={busy} onClick={() => { setEditing(false); setError(""); }}>Keep current app</Button>}
      </div>
      <p className="suggestion-note provider-endpoint">Redirect URI to register: {account.redirectUri}</p>
      {account.appConfigured && <p className="settings-footnote">Using a different {name.idLabel.toLowerCase()} disconnects the current account, because its sign-in belongs to the old app.</p>}
    </form>}
    {saved && <p role="status" className="suggestion-note">{saved}</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
  </>;
}

const platformIcon: Record<AutopostPlatform, typeof Play> = { youtube: Play, tiktok: Music2 };
const blurb: Record<AutopostPlatform, string> = {
  youtube: "Stream autopilot uploads the top clips as Shorts.",
  tiktok: "Clips go to your TikTok inbox as drafts, or post directly when you choose.",
};

function AccountCard({ account, waiting, connect, disconnect, update }: {
  account: SocialAccountStatus;
  waiting: boolean;
  connect: () => void;
  disconnect: () => void;
  update: (next: SocialAccountStatus[]) => void;
}) {
  const name = names[account.platform];
  const Icon = platformIcon[account.platform];
  const easy = account.appSource === "cutroom" || (!account.appConfigured && account.cutroomApp);
  const blocked = account.appSource === "cutroom" ? account.cutroomAppBlocked : undefined;
  const state = account.connected ? "connected" : waiting ? "waiting" : account.appConfigured && !blocked ? "ready" : "setup";
  return <article className={`account-card account-${state}`} aria-labelledby={`account-${account.platform}`}>
    <header className="account-card-head">
      <span className={`account-mark mark-${account.platform}`} aria-hidden><Icon size={18} /></span>
      <div className="account-card-title">
        <h3 id={`account-${account.platform}`}>{name.title}</h3>
        <p>{blurb[account.platform]}</p>
      </div>
      <span className="account-state" role="status">
        {state === "connected" ? <><Check size={14} aria-hidden />Connected</>
          : state === "waiting" ? <><LoaderCircle size={14} className="spin" aria-hidden />Waiting for sign-in</>
          : state === "ready" ? "Not connected" : "Needs setup"}
      </span>
    </header>
    {account.connected && <p className="account-who">{account.account ?? "Signed in"}<small>{account.appSource === "cutroom" ? " · through Cutroom's app" : " · through your developer app"}</small></p>}
    {blocked && <p role="alert" className="error-message">{blocked}</p>}
    {account.appConfigured && !blocked && <div className="account-actions">
      <Button disabled={waiting} variant={account.connected ? "ghost" : "default"} onClick={connect}>
        {waiting ? "Finish signing in in the other tab…" : account.connected ? "Reconnect" : `Connect ${name.title}`}</Button>
      {account.connected && <Button variant="ghost" onClick={disconnect}>Disconnect</Button>}
    </div>}
    {easy && !account.connected && !blocked && <p className="account-trust"><ShieldCheck size={14} aria-hidden />
      You sign in on {account.platform === "youtube" ? "Google" : "TikTok"}'s own page. Cutroom keeps the sign-in on this computer and never sees your password.</p>}
    {easy ? <details className="account-advanced">
      <summary><ChevronDown size={14} aria-hidden />Use my own developer app instead</summary>
      <AppCredentials account={account} update={update} />
    </details> : <AppCredentials account={account} update={update} />}
  </article>;
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
  const easy = accounts?.some(a => a.cutroomApp);
  return <section className="settings-section" aria-labelledby="publishing-accounts-title">
    <div className="settings-heading"><div>
      <h2 id="publishing-accounts-title">Auto-publishing accounts</h2>
      <p>{easy ? "Connect the channels Stream autopilot should post to." : "Stream autopilot posts clips straight to YouTube and TikTok through your own developer apps."} Sign-in tokens{easy ? "" : " and app secrets"} are saved on this computer, readable only by your user account. They are never shown again, sent to the browser, or included in project backups.</p>
    </div></div>
    {!accounts && !error && <p role="status" className="suggestion-note"><LoaderCircle size={14} className="spin" aria-hidden /> Loading accounts…</p>}
    {accounts && <div className="account-cards">
      {accounts.map(a => <AccountCard key={a.platform} account={a} waiting={waiting === a.platform} update={setAccounts}
        connect={() => void connect(a.platform)} disconnect={() => void disconnect(a.platform)} />)}
    </div>}
    {error && <p role="alert" className="error-message">{error}</p>}
  </section>;
}
