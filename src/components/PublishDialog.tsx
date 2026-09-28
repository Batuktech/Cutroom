import { useCallback, useEffect, useRef, useState } from "react";
import type { Clip, Health, Job, Project } from "../../shared/types";
import { socialPlatforms, socialCopySchema, postContent, initialChannelSettings, type ChannelSettings, type PostizChannel, type PostizStatus, type PublishPreparation, type SocialCopy, type PublishRequest } from "../../shared/publishing";
import { cloudProviders, providerDetails, type AIProvider } from "../../shared/ai-providers";
import { useAIProviders } from "../lib/useAIProviders";
import { api, post } from "../lib/api";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { PublishingChannel } from "./PublishingChannel";

export function PublishDialog({ project, clip, jobs, health, close, refresh, openSettings }: {
  project: Project; clip: Clip; jobs: Job[]; health: Health | null; close: () => void;
  refresh: () => Promise<void>; openSettings: () => void;
}) {
  const route = `/projects/${project.id}/clips/${clip.id}`;
  const [preparation, setPreparation] = useState<PublishPreparation | null>(null), [copy, setCopy] = useState<SocialCopy | null>(null);
  const [status, setStatus] = useState<PostizStatus | null>(null), [channels, setChannels] = useState<PostizChannel[] | null>(null);
  const [chosen, setChosen] = useState<Record<string, ChannelSettings>>({});
  const [mode, setMode] = useState<PublishRequest["mode"]>("draft"), [date, setDate] = useState(""), [quality, setQuality] = useState<"720" | "1080">("1080");
  const [consent, setConsent] = useState(false), [reviewed, setReviewed] = useState(false);
  const [provider, setProvider] = useState<AIProvider>("local"), [model, setModel] = useState(""), [language, setLanguage] = useState("Same language as the transcript");
  const [format, setFormat] = useState<"auto" | "json_schema" | "json_object">("auto"), [cloudConsent, setCloudConsent] = useState(false);
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [copyJob, setCopyJob] = useState<string | null>(null);
  const [publishJob, setPublishJob] = useState<string | null>(null);
  const [copyRevision, setCopyRevision] = useState(0);
  const requestId = useRef(crypto.randomUUID()), edited = useRef(false), initialCopy = useRef("");
  const providers = useAIProviders();
  const providerStatus = providers.statuses.find(s => s.provider === provider);
  const active = jobs.find(j => j.projectId === project.id && ["queued", "running"].includes(j.status));
  const activePreparation = active && ["publish", "social-copy"].includes(active.kind) ? active : undefined;
  const copyResult = jobs.find(j => j.id === copyJob);
  const publishResult = jobs.find(j => j.id === publishJob);
  const reload = useCallback(async (replaceCopy = false) => {
    setError("");
    try {
      const [p, s] = await Promise.all([api<PublishPreparation>(route + "/publishing"), api<PostizStatus>("/postiz")]);
      setPreparation(p); setStatus(s);
      if (replaceCopy || !edited.current) { setCopy(p.copy); initialCopy.current = JSON.stringify(p.copy); edited.current = false; setCopyRevision(v => v + 1); }
      if (s.configured) setChannels(await api<PostizChannel[]>("/postiz/channels"));
      else setChannels([]);
      await refresh();
    } catch (e) { setError((e as Error).message); }
  }, [route, refresh]);
  useEffect(() => { void Promise.resolve().then(() => reload()); }, [reload]);
  useEffect(() => {
    if (copyResult && ["completed", "failed", "cancelled"].includes(copyResult.status)) {
      void Promise.resolve().then(() => {
        setCopyJob(null);
        if (copyResult.status === "completed") { void reload(true); setMessage("Social copy generated. Review the descriptions and hashtags before sending."); }
        else setError(copyResult.message);
      });
    }
  }, [copyResult, reload]);
  useEffect(() => {
    if (publishResult && ["completed", "failed", "cancelled"].includes(publishResult.status)) {
      void Promise.resolve().then(() => {
        setPublishJob(null);
        if (publishResult.status === "failed") { setMessage(""); setError(publishResult.message); }
        else setMessage(publishResult.status === "completed"
          ? "Posts accepted by Postiz. Check its calendar for delivery results."
          : "Remaining work stopped. Check Postiz for posts already accepted.");
      });
    }
  }, [publishResult]);
  function changeCopy(platform: typeof socialPlatforms[number], patch: Partial<SocialCopy[typeof platform]>) {
    setCopy(current => current ? { ...current, [platform]: { ...current[platform], ...patch } } : current);
    edited.current = true; setConsent(false); setReviewed(false);
  }
  async function saveCopy() {
    if (!copy || !preparation) return;
    const parsed = socialCopySchema.safeParse(copy);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Check the social copy.");
    await api(route + "/social-copy", { method: "PUT", body: JSON.stringify({ sourceHash: preparation.sourceHash, copy: parsed.data }) });
    initialCopy.current = JSON.stringify(copy); edited.current = false;
  }
  async function action(fn: () => Promise<void>) {
    setPending(true); setError(""); setMessage("");
    try { await fn(); } catch (e) { setError((e as Error).message); }
    finally { setPending(false); }
  }
  async function generate() {
    if (!preparation) return;
    await saveCopy();
    const job = await post<Job>(route + "/social-copy", { sourceHash: preparation.sourceHash, provider, model, language, outputFormat: format, cloudConsent, cloudDestination: providerStatus?.endpoint });
    setCopyJob(job.id); setCloudConsent(false); await refresh();
  }
  async function submit() {
    if (!preparation || !copy || !status) return;
    await saveCopy();
    const result = await post<Job | { existing: true; publicationId: string }>(route + "/publish", { requestId: requestId.current, sourceHash: preparation.sourceHash, destination: status.destination,
      mode, ...(mode === "schedule" ? { date: new Date(date).toISOString() } : {}), quality, copy,
      channels: Object.entries(chosen).map(([id, settings]) => ({ id, settings })), uploadConsent: consent,
    });
    requestId.current = crypto.randomUUID();
    edited.current = false; setConsent(false); setReviewed(false);
    if ("id" in result) {
      setPublishJob(result.id);
      setMessage("Preparation queued. Cutroom will render, upload and submit these posts to Postiz.");
    } else setMessage("This submission is already recorded. Check its status below and in the Postiz calendar.");
    await refresh(); await reload();
  }
  function dismiss() {
    if (edited.current && JSON.stringify(copy) !== initialCopy.current && !window.confirm("Close without saving your social copy changes?")) return false;
    close();
    return true;
  }
  const records = project.publications?.filter(r => r.clipId === clip.id) ?? preparation?.publications ?? [];
  const portrait = clip.aspect === "9:16" && clip.end - clip.start >= 3 && clip.end - clip.start <= 180;
  return <Dialog open onOpenChange={value => { if (!value && !pending) dismiss(); }} title="Prepare social posts" description="Render this saved clip automatically and send it to your connected Postiz channels. Downloading an export is optional." wide>
    <div className="social-summary"><strong>{clip.title}</strong><span>{clip.aspect} · {Math.round(clip.end - clip.start)} seconds · captions {clip.captions ? "on" : "off"}</span></div>
    {!preparation && !error && <p role="status">Loading saved clip and publishing options…</p>}
    {!portrait && <p className="notice">This workflow needs a saved 9:16 clip between 3 seconds and 3 minutes. Set the frame and trim in the editor, save, then reopen Prepare posts.</p>}
    {status && !status.configured && <p className="notice">Add your Postiz API key to load channels. You can write and save social copy now. <Button variant="secondary" onClick={() => { if (dismiss()) openSettings(); }}>Open studio settings</Button></p>}
    {preparation && copy && <>
      <details className="suggestion-extra"><summary>Generate titles, descriptions and hashtags</summary>
        <fieldset className="social-fieldset" disabled={pending || !!active || !!copyJob}>
          <div className="social-fields"><label className="field-label">Write with<select value={provider} onChange={e => { const p = e.target.value as AIProvider; setProvider(p); setModel(providerDetails[p].model); setCloudConsent(false); setFormat("auto"); }}>
            <option value="local">Local Qwen3-8B</option>{cloudProviders.map(p => <option key={p} value={p}>{providerDetails[p].name}</option>)}
          </select></label><label className="field-label">Copy language<input value={language} maxLength={60} onChange={e => { setLanguage(e.target.value); setCloudConsent(false); }} /></label></div>
          {provider !== "local" ? <>
            <label className="field-label">Model ID<input value={model} maxLength={120} onChange={e => { setModel(e.target.value); setCloudConsent(false); }} /></label>
            {provider !== "openai" && provider !== "anthropic" && <label className="field-label">Output format<select value={format} onChange={e => setFormat(e.target.value as typeof format)}><option value="auto">Provider default</option><option value="json_schema">JSON schema</option><option value="json_object">JSON object</option></select></label>}
            <p className="suggestion-note provider-endpoint">Destination: {providerStatus?.endpoint || "Not configured"}. One API request per clip; your provider may charge.</p>
            {!providerStatus?.configured && <p className="notice">Add this provider's key in Studio settings first.</p>}
            <label className="social-check"><input type="checkbox" checked={cloudConsent} onChange={e => setCloudConsent(e.target.checked)} />Share this clip's transcript, title and copy language with the selected provider for this request.</label>
          </> : <p className="suggestion-note">{health?.qwen?.ready ? "Qwen runs locally. Long or dense clips may exceed its context limit." : health?.qwen?.message || "Checking Qwen availability…"}</p>}
          <Button variant="secondary" disabled={!language.trim() || (provider === "local" ? !health?.qwen?.ready : !cloudConsent || !providerStatus?.configured || !model.trim())} onClick={() => void action(generate)}>Generate social copy</Button>
          <p className="suggestion-note">Generation replaces the saved social copy. Review names, claims and hashtags. AI suggestions do not predict views.</p>
        </fieldset>
        {providers.error && <p role="alert" className="error-message">{providers.error}</p>}
      </details>
      <fieldset className="social-fieldset" disabled={pending || !!copyJob}>
        {socialPlatforms.map(platform => <details className="social-copy-section" key={platform} open={platform === "youtube"}>
          <summary>{platform === "youtube" ? "YouTube Shorts" : platform === "instagram" ? "Instagram Reels" : "TikTok"} · {postContent(copy[platform]).length} characters</summary>
          <label className="field-label">{platform} title<input value={copy[platform].title} maxLength={90} onChange={e => changeCopy(platform, { title: e.target.value })} /></label>
          <label className="field-label">{platform} description<textarea rows={3} value={copy[platform].description} maxLength={1800} onChange={e => changeCopy(platform, { description: e.target.value })} /></label>
          <label className="field-label">{platform} hashtags<input key={copyRevision} defaultValue={copy[platform].hashtags.join(" ")} maxLength={305} onChange={e => changeCopy(platform, { hashtags: e.target.value.split(/\s+/).filter(Boolean) })} placeholder="#Topic #SpecificSubject" /></label>
          <p className="suggestion-note">Up to five hashtags, separated by spaces. {platform === "instagram" ? "The description and hashtags form the Reel caption." : "Titles and copy must match the clip."}</p>
        </details>)}
      </fieldset>
      <Button variant="secondary" disabled={pending || !!copyJob} onClick={() => void action(async () => { await saveCopy(); setMessage("Social copy saved locally."); })}>Save social copy</Button>
      <section className="social-channels" aria-label="Publishing channels"><h3>Choose channels</h3>
        {channels === null ? <p role="status">{error ? "Channels could not be loaded." : "Loading connected channels…"}</p> : !channels.length ? <p>No supported channels available. Connect YouTube, TikTok or Instagram in Postiz, then reload.</p> : channels.map(channel => <div className="social-channel" key={channel.id}>
          <label className="social-check"><input type="checkbox" checked={!!chosen[channel.id]} disabled={pending || !!active || channel.disabled} onChange={e => {
            setChosen(current => { const next = { ...current }; if (e.target.checked) next[channel.id] = initialChannelSettings(channel.identifier); else delete next[channel.id]; return next; });
            setConsent(false); setReviewed(false); requestId.current = crypto.randomUUID();
          }} /><span>{channel.name} · {channel.identifier}{channel.disabled ? " · reconnect in Postiz" : ""}</span></label>
          {chosen[channel.id] && <fieldset className="social-fieldset" disabled={pending || !!active}><PublishingChannel settings={chosen[channel.id]} change={settings => { setChosen(c => ({ ...c, [channel.id]: settings })); setConsent(false); setReviewed(false); }} /></fieldset>}
        </div>)}
        <Button variant="ghost" disabled={pending} onClick={() => void reload()}>Reload channels and status</Button>
      </section>
      <fieldset className="social-fieldset" disabled={pending || !!active}>
        <div className="social-fields">
          <label className="field-label">Delivery<select value={mode} onChange={e => { setMode(e.target.value as typeof mode); setConsent(false); requestId.current = crypto.randomUUID(); }}><option value="draft">Draft in Postiz</option><option value="schedule">Schedule through Postiz</option><option value="now">Publish when ready</option></select></label>
          <label className="field-label">Render resolution<select value={quality} onChange={e => setQuality(e.target.value as typeof quality)}><option value="1080">1080p</option><option value="720">720p</option></select></label>
        </div>
        {mode === "schedule" && <label className="field-label">Publish at ({Intl.DateTimeFormat().resolvedOptions().timeZone})<input type="datetime-local" value={date} onChange={e => { setDate(e.target.value); setConsent(false); }} /></label>}
        <label className="social-check"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I reviewed the selected channels, visibility, audience and content disclosures.</label>
        <label className="social-check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>Upload this rendered video and copy to {status?.destination || "Postiz"}{mode === "draft" ? " as drafts." : mode === "schedule" ? " and authorize publishing at the selected time." : " and authorize publishing as soon as preparation finishes."}</span></label>
        <p className="suggestion-note">Cutroom must remain running until upload and submission finish. Cancel stops remaining work; posts already accepted must be changed or cancelled in Postiz.</p>
      </fieldset>
      <div className="dialog-actions"><Button variant="secondary" disabled={pending} onClick={dismiss}>Close</Button><Button disabled={pending || !!active || !portrait || !status?.configured || !Object.keys(chosen).length || !consent || !reviewed || (mode === "schedule" && !date)} onClick={() => void action(submit)}>{mode === "draft" ? "Prepare Postiz drafts" : mode === "schedule" ? "Render and schedule" : "Render and publish"}</Button></div>
    </>}
    {activePreparation && <div className="suggestion-progress" role="status"><p>{activePreparation.message}</p><progress value={activePreparation.progress} max={100} aria-label="Preparation progress" /><Button variant="secondary" onClick={() => void action(async () => { await post(`/jobs/${activePreparation.id}/cancel`); await refresh(); await reload(); })}>Stop remaining work</Button></div>}
    {active && !activePreparation && <p role="status" className="notice">Another processing job is running for this project. Wait for it to finish before preparing posts.</p>}
    {message && <p role="status" className="notice">{message}</p>}
    {error && <p role="alert" className="error-message">{error} <Button variant="secondary" onClick={() => void reload()}>Reload</Button></p>}
    {!!records.length && <section className="social-history"><h3>Postiz submissions</h3>{records.toReversed().slice(0, 20).map(record => <div key={record.id}><p>{new Date(record.createdAt).toLocaleString()} · {record.mode}</p>{record.channels.map(c => <div key={c.id}>
      <strong>{channels?.find(ch => ch.id === c.id)?.name || c.name} · {c.state}</strong><p>{c.message || "Waiting for preparation."}{c.postId ? ` Postiz ID: ${c.postId}` : ""}</p>
      {c.state === "unknown" && <div className="provider-key-actions">{(["exists", "absent"] as const).map(outcome => <Button variant="secondary" key={outcome} disabled={pending} onClick={() => {
        if (!window.confirm(outcome === "exists" ? "Have you checked the Postiz calendar and confirmed this post exists?" : "Have you checked the Postiz calendar and confirmed no post was created? Another submission could publish a duplicate.")) return;
        void action(async () => { await post(`/projects/${project.id}/publications/${record.id}/resolve`, { channelId: c.id, outcome, confirm: true }); requestId.current = crypto.randomUUID(); await refresh(); await reload(); });
      }}>{outcome === "exists" ? "I found this post in Postiz" : "I confirmed no post exists"}</Button>)}</div>}
    </div>)}</div>)}</section>}
  </Dialog>;
}
