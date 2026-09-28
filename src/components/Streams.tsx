import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Check, CircleDashed, ExternalLink, LoaderCircle, RotateCcw, X } from "lucide-react";
import type { Health } from "../../shared/types";
import type { AutopostPlatform, SocialAccountStatus, StreamPart, StreamRecord, StreamRequest } from "../../shared/streams";
import { streamLanguages } from "../../shared/streams";
import { sourceTime } from "../../shared/youtube-range";
import { api, post } from "../lib/api";
import { Button } from "./ui/button";

const platformName: Record<AutopostPlatform, string> = { youtube: "YouTube Shorts", tiktok: "TikTok" };
const stageText: Record<StreamPart["stage"], string> = {
  queued: "Waiting in queue", downloading: "Downloading", transcribing: "Transcribing with Whisper large-v3",
  analyzing: "Finding clips with Qwen", ready: "Analyzed", failed: "Failed", cancelled: "Cancelled",
};
const running = (s: StreamRecord) => ["planning", "processing", "publishing"].includes(s.status);

export function Streams({ health, openProject, openSettings, notify }: {
  health: Health | null;
  openProject: (id: string) => void;
  openSettings: () => void;
  notify: (message: string, error?: boolean) => void;
}) {
  const [streams, setStreams] = useState<StreamRecord[] | null>(null);
  const [accounts, setAccounts] = useState<SocialAccountStatus[]>([]);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState<Omit<StreamRequest, "interests">>({ url: "", language: "auto", topClips: 5, visibility: "public", platforms: [], publishConsent: false });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [next, social] = await Promise.all([api<StreamRecord[]>("/streams"), api<SocialAccountStatus[]>("/social/accounts")]);
      setStreams(next); setAccounts(social); setLoadError("");
    } catch (e) { setLoadError((e as Error).message); }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [load]);

  const large = health?.models.find(m => m.id === "large-v3")?.installed;
  const checks = [
    { ok: !!health?.youtube, text: "YouTube downloader", fix: "Run npm run setup:ai and restart" },
    { ok: !!large, text: "Whisper large-v3 installed", fix: "Install it in Settings" },
    { ok: !!health?.qwen.ready, text: "Local Qwen3-8B", fix: health?.qwen.message },
  ];
  const connected = (p: AutopostPlatform) => accounts.find(a => a.platform === p)?.connected;
  const blocked = checks.some(c => !c.ok);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await post<StreamRecord>("/streams", form);
      setForm(f => ({ ...f, url: "", publishConsent: false }));
      notify("Stream queued. Parts are processed one at a time; large-v3 on CPU can take hours per part.");
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function act(stream: StreamRecord, action: "cancel" | "retry") {
    try { await post(`/streams/${stream.id}/${action}`); await load(); }
    catch (e) { notify((e as Error).message, true); }
  }
  const togglePlatform = (p: AutopostPlatform) =>
    setForm(f => ({ ...f, platforms: f.platforms.includes(p) ? f.platforms.filter(x => x !== p) : [...f.platforms, p] }));

  return <>
    <div className="page-heading">
      <div>
        <h1>Stream autopilot.<br /><span>Long VOD in, shorts out.</span></h1>
        <p>Paste a finished stream. Cutroom splits it into one-hour projects, transcribes each with Whisper large-v3, lets local Qwen pick the strongest moments, then renders and posts the best ones.</p>
      </div>
    </div>

    <section className="settings-section stream-start" aria-labelledby="stream-start-title">
      <h2 id="stream-start-title">Start a stream</h2>
      <ul className="stream-checks" aria-label="Requirements">
        {checks.map(c => <li key={c.text} className={c.ok ? "ok" : "missing"}>
          {c.ok ? <Check size={15} aria-hidden /> : <AlertCircle size={15} aria-hidden />}
          <span>{c.text}{!c.ok && c.fix ? ` · ${c.fix}` : ""}</span>
        </li>)}
      </ul>
      <form onSubmit={start} className="stream-form">
        <label className="field-label stream-url">YouTube stream URL
          <input type="url" required inputMode="url" autoComplete="off" spellCheck={false} maxLength={2048} value={form.url}
            placeholder="https://www.youtube.com/watch?v=…" onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
        </label>
        <label className="field-label">Spoken language
          <select value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value as StreamRequest["language"] }))}>
            {streamLanguages.map(l => <option key={l} value={l}>{l === "auto" ? "Detect automatically" : l}</option>)}
          </select>
        </label>
        <label className="field-label">Clips to publish from this stream
          <select value={form.topClips} onChange={e => setForm(f => ({ ...f, topClips: Number(e.target.value) }))}>
            {[1, 2, 3, 4, 5, 6, 8, 10].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <fieldset className="social-fieldset stream-platforms">
          <legend className="field-label">Post automatically to</legend>
          {(["youtube", "tiktok"] as const).map(p => <label className="social-check" key={p}>
            <input type="checkbox" checked={form.platforms.includes(p)} disabled={!connected(p)} onChange={() => togglePlatform(p)} />
            <span>{platformName[p]}{!connected(p) && <> · <button type="button" className="text-link" onClick={openSettings}>connect in Settings</button></>}</span>
          </label>)}
          {form.platforms.length > 0 && <>
            <label className="field-label">Visibility
              <select value={form.visibility} onChange={e => setForm(f => ({ ...f, visibility: e.target.value as "public" | "private" }))}>
                <option value="public">Public</option>
                <option value="private">Private (only you)</option>
              </select>
            </label>
            <p className="suggestion-note">Unverified Google API projects and unaudited TikTok apps can only post privately. YouTube's default quota allows about 6 uploads a day.</p>
            <label className="social-check">
              <input type="checkbox" checked={form.publishConsent} onChange={e => setForm(f => ({ ...f, publishConsent: e.target.checked }))} />
              <span>Publish the top {form.topClips} clip{form.topClips === 1 ? "" : "s"} to the selected accounts without asking again for this stream.</span>
            </label>
          </>}
        </fieldset>
        {error && <p role="alert" className="error-message">{error}</p>}
        <Button type="submit" disabled={busy || blocked || !form.url.trim() || (form.platforms.length > 0 && !form.publishConsent)}>
          {busy ? <><LoaderCircle size={16} className="spin" />Queuing</> : form.platforms.length ? "Start and publish automatically" : "Start: prepare clips only"}
        </Button>
      </form>
    </section>

    <section className="stream-list" aria-labelledby="stream-list-title">
      <h2 id="stream-list-title">Streams</h2>
      {loadError && <p role="alert" className="error-message">{loadError}</p>}
      {!streams && !loadError && <p role="status" className="suggestion-note">Loading streams…</p>}
      {streams?.length === 0 && <p className="suggestion-note">No streams yet. Paste a finished YouTube VOD above; its parts and published posts will show up here.</p>}
      {streams?.map(stream => <article className="stream-card" key={stream.id}>
        <header>
          <div>
            <h3>{stream.title}</h3>
            <p>{stream.duration ? `${sourceTime(stream.duration)} · ` : ""}{stream.parts.length || "–"} part{stream.parts.length === 1 ? "" : "s"} · top {stream.settings.topClips}{stream.settings.platforms.length ? ` · ${stream.settings.visibility} on ${stream.settings.platforms.map(p => platformName[p]).join(", ")}` : " · no auto-posting"}</p>
          </div>
          <span className={`stream-status status-${stream.status}`}>{running(stream) && <LoaderCircle size={14} className="spin" aria-hidden />}{stream.status}</span>
        </header>
        {stream.message && <p className="stream-message">{stream.message}</p>}
        {stream.parts.length > 0 && <ol className="stream-parts">
          {stream.parts.map(part => <li key={part.index} className={`part-${part.stage}`}>
            {part.stage === "ready" ? <Check size={15} aria-hidden /> : part.stage === "failed" ? <AlertCircle size={15} aria-hidden />
              : part.stage === "cancelled" ? <X size={15} aria-hidden /> : part.stage === "queued" ? <CircleDashed size={15} aria-hidden /> : <LoaderCircle size={15} className="spin" aria-hidden />}
            <span className="part-time">Part {part.index + 1} · {sourceTime(part.start)}–{sourceTime(part.end)}</span>
            <span>{stageText[part.stage]}{part.stage === "ready" && part.candidates !== undefined ? ` · ${part.candidates} candidates` : ""}{part.message ? ` · ${part.message}` : ""}</span>
            {part.projectId && <button type="button" className="text-link" onClick={() => openProject(part.projectId!)}>Open project</button>}
          </li>)}
        </ol>}
        {stream.clips.length > 0 && <div className="stream-clips">
          <h4>Selected clips</h4>
          {stream.clips.map(clip => <div className="stream-clip" key={clip.id}>
            <button type="button" className="text-link" onClick={() => openProject(clip.projectId)}>{clip.title}</button>
            <span className="part-time">Part {clip.part + 1} · {sourceTime(clip.start)}–{sourceTime(clip.end)}{clip.exportId ? " · rendered" : ""}</span>
            {clip.targets.map(t => <span key={t.platform} className={`post-state post-${t.state}`}>
              {platformName[t.platform]}: {t.url ? <a href={t.url} target="_blank" rel="noreferrer">{t.state}<ExternalLink size={12} aria-hidden /></a> : t.state}
              {t.message && <small> · {t.message}</small>}
            </span>)}
          </div>)}
        </div>}
        <div className="stream-actions">
          {running(stream) && <Button variant="ghost" size="small" onClick={() => void act(stream, "cancel")}>Cancel stream</Button>}
          {["failed", "cancelled", "completed"].includes(stream.status) &&
            (stream.parts.some(p => p.stage !== "ready") || stream.clips.some(c => c.targets.some(t => t.state === "failed")) || !stream.parts.length) &&
            <Button variant="secondary" size="small" onClick={() => void act(stream, "retry")}><RotateCcw size={14} />Retry failed steps</Button>}
          {stream.clips.some(c => c.targets.some(t => t.state === "unknown")) && <p className="suggestion-note">Unconfirmed uploads are never resent automatically. Check the platform first.</p>}
        </div>
      </article>)}
    </section>
  </>;
}
