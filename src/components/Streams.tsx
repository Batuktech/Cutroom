import { useCallback, useEffect, useState } from "react";
import { AlertCircle, AudioLines, Check, CircleDashed, Download, ExternalLink, LoaderCircle, Radio, RotateCcw, ScanSearch, Send, Smartphone, X } from "lucide-react";
import type { Health } from "../../shared/types";
import type { AutopostPlatform, SocialAccountStatus, StreamPart, StreamRecord, StreamRequest, StreamReviewer, TiktokMode } from "../../shared/streams";
import { streamLanguages } from "../../shared/streams";
import { sourceTime } from "../../shared/youtube-range";
import { api, post } from "../lib/api";
import { useAIProviders } from "../lib/useAIProviders";
import { Button } from "./ui/button";
import { Select, SelectItem } from "./ui/select";

const pipeline: [typeof Send, string, string][] = [
  [Download, "Download", "The VOD in one-hour parts"],
  [AudioLines, "Transcribe", "Whisper large-v3, on this computer"],
  [ScanSearch, "Pick moments", "Scored for hook, payoff and clarity"],
  [Smartphone, "Render 9:16", "Face framing and burned-in captions"],
  [Send, "Post", "YouTube Shorts and TikTok, if you opt in"],
];
const platformName: Record<AutopostPlatform, string> = { youtube: "YouTube Shorts", tiktok: "TikTok" };
const reviewerName: Record<StreamReviewer, string> = { local: "Qwen", "claude-code": "Claude" };
const stageText = (stage: StreamPart["stage"], reviewer: StreamReviewer = "local") => ({
  queued: "Waiting in queue", downloading: "Downloading", transcribing: "Transcribing with Whisper large-v3",
  analyzing: `Finding clips with ${reviewerName[reviewer]}`, ready: "Analyzed", failed: "Failed", cancelled: "Cancelled",
})[stage];
const languageNames = new Intl.DisplayNames(["en"], { type: "language" });
const languageName = (code: string) => { try { return languageNames.of(code) ?? code; } catch { return code; } };
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
  const [form, setForm] = useState<Omit<StreamRequest, "interests">>({ url: "", language: "auto", topClips: 5, visibility: "public", platforms: [],
    tiktokMode: "draft", reviewer: "local", publishConsent: false, cloudConsent: false });
  const ai = useAIProviders();
  const claude = ai.statuses.find(s => s.provider === "claude-code");
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
    form.reviewer === "local" ? { ok: !!health?.qwen.ready, text: "Local Qwen3-8B", fix: health?.qwen.message }
      : { ok: !!claude?.configured, text: "Claude Code signed in", fix: !claude ? "Checking…" : !claude.cli?.installed
        ? "Install Claude Code, then check again" : "Run claude in a terminal to sign in, then check again" },
  ];
  const connected = (p: AutopostPlatform) => accounts.find(a => a.platform === p)?.connected;
  const account = (p: AutopostPlatform) => accounts.find(a => a.platform === p)?.account;
  const source = (p: AutopostPlatform) => accounts.find(a => a.platform === p)?.appSource;
  const blocked = checks.some(c => !c.ok);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await post<StreamRecord>("/streams", form);
      setForm(f => ({ ...f, url: "", publishConsent: false, cloudConsent: false }));
      notify("Stream queued. Parts are processed one at a time; large-v3 on CPU can take hours per part.");
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function act(stream: StreamRecord, action: "cancel" | "retry" | "publish-reviewed") {
    if (action === "publish-reviewed" && !window.confirm(`Post up to ${stream.settings.topClips} clips that passed review but scored under the autopilot bar to ` +
      `${stream.settings.platforms.map(p => platformName[p]).join(" and ")} (${stream.settings.visibility})?`)) return;
    try { await post(`/streams/${stream.id}/${action}`); await load(); }
    catch (e) { notify((e as Error).message, true); }
  }
  async function copyCaption(caption: string) {
    try { await navigator.clipboard.writeText(caption); notify("Caption copied. Paste it into the TikTok draft."); }
    catch { notify("Copying failed. Select the caption in the project's social copy instead.", true); }
  }
  const togglePlatform = (p: AutopostPlatform) =>
    setForm(f => ({ ...f, platforms: f.platforms.includes(p) ? f.platforms.filter(x => x !== p) : [...f.platforms, p] }));

  return <>
    <div className="page-heading">
      <div>
        <h1>Stream autopilot.<br /><span>Long VOD in, shorts out.</span></h1>
        <p>Paste a finished stream. Cutroom splits it into one-hour projects, transcribes each with Whisper large-v3, lets local Qwen or your Claude sign-in pick the strongest moments, then renders and posts the best ones.</p>
      </div>
    </div>
    <ol className="pipeline" aria-label="How Stream autopilot works">
      {pipeline.map(([Icon, title, detail], i) => <li key={title}>
        <span className="pipeline-index">{String(i + 1).padStart(2, "0")}</span>
        <Icon size={18} aria-hidden />
        <strong>{title}</strong>
        <span>{detail}</span>
      </li>)}
    </ol>

    <section className="settings-section stream-start" aria-labelledby="stream-start-title">
      <div className="stream-start-head">
        <h2 id="stream-start-title">Start a stream</h2>
        <span className={`stream-ready${blocked ? "" : " is-ready"}`}>{checks.filter(c => c.ok).length} of {checks.length} requirements ready</span>
      </div>
      <ul className="stream-checks" aria-label="Requirements">
        {checks.map(c => <li key={c.text} className={c.ok ? "ok" : "missing"}>
          {c.ok ? <Check size={16} aria-hidden /> : <AlertCircle size={16} aria-hidden />}
          <span><strong>{c.text}</strong>{!c.ok && c.fix && <small>{c.fix}</small>}</span>
          {!c.ok && form.reviewer === "claude-code" && c.text.startsWith("Claude") &&
            <button type="button" className="text-link" onClick={() => void ai.refresh(true)}>Check again</button>}
        </li>)}
      </ul>
      <form onSubmit={start} className="stream-form">
        <label className="field-label stream-url">YouTube stream URL
          <input type="url" required inputMode="url" autoComplete="off" spellCheck={false} maxLength={2048} value={form.url}
            placeholder="https://www.youtube.com/watch?v=…" onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
        </label>
        <label className="field-label">Spoken language
          <Select value={form.language} onValueChange={v => setForm(f => ({ ...f, language: v as StreamRequest["language"] }))}>
            {streamLanguages.map(l => <SelectItem key={l} value={l}>{l === "auto" ? "Detect automatically" : languageName(l)}</SelectItem>)}
          </Select>
        </label>
        <label className="field-label">Clips to publish from this stream
          <Select value={String(form.topClips)} onValueChange={v => setForm(f => ({ ...f, topClips: Number(v) }))}>
            {[1, 2, 3, 4, 5, 6, 8, 10].map(n => <SelectItem key={n} value={String(n)}>{n} {n === 1 ? "clip" : "clips"}</SelectItem>)}
          </Select>
        </label>
        <label className="field-label">Find clips and write titles with
          <Select value={form.reviewer} onValueChange={v => setForm(f => ({ ...f, reviewer: v as StreamReviewer, cloudConsent: false }))}>
            <SelectItem value="local" hint="Stays on this computer">Local Qwen3-8B</SelectItem>
            <SelectItem value="claude-code" hint="Your Claude sign-in · transcript text goes to Anthropic">Claude Code</SelectItem>
          </Select>
        </label>
        {form.reviewer === "claude-code" && <div className="stream-reviewer-note">
          <p className="suggestion-note">Claude is faster than local Qwen and stronger in languages other than English. Each part makes up to about 20 requests, which count toward your Claude plan's usage limits. Transcription still runs locally with Whisper.</p>
          <label className="social-check">
            <input type="checkbox" checked={form.cloudConsent} onChange={e => setForm(f => ({ ...f, cloudConsent: e.target.checked }))} />
            <span>Send each part's transcript text and timestamps to Anthropic through Claude Code for this stream. The video stays on this computer.</span>
          </label>
        </div>}
        <fieldset className="social-fieldset stream-platforms">
          <legend className="field-label">Post automatically to</legend>
          <div className="platform-cards">
            {(["youtube", "tiktok"] as const).map(p => <div key={p}
              className={`platform-card${form.platforms.includes(p) ? " is-on" : ""}${connected(p) ? "" : " is-off"}`}>
              <label>
                <input type="checkbox" checked={form.platforms.includes(p)} disabled={!connected(p)} onChange={() => togglePlatform(p)} />
                <span><strong>{platformName[p]}</strong>
                  <small>{connected(p) ? `Connected${account(p) ? ` as ${account(p)}` : ""}` : "Not connected"}</small></span>
              </label>
              {!connected(p) && <button type="button" className="text-link" onClick={openSettings}>Connect in Settings</button>}
            </div>)}
          </div>
          {form.platforms.length > 0 && <>
            <label className="field-label">Visibility
              <Select value={form.visibility} onValueChange={v => setForm(f => ({ ...f, visibility: v as "public" | "private" }))}>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="private">Private (only you)</SelectItem>
              </Select>
            </label>
            {form.platforms.includes("tiktok") && <label className="field-label">TikTok
              <Select value={form.tiktokMode} onValueChange={v => setForm(f => ({ ...f, tiktokMode: v as TiktokMode }))}>
                <SelectItem value="draft" hint="You add the caption and post from TikTok">Send to my TikTok inbox as drafts</SelectItem>
                <SelectItem value="direct" hint="Private only until TikTok audits the app">Post directly</SelectItem>
              </Select>
            </label>}
            <p className="suggestion-note">
              {form.platforms.includes("youtube") && (source("youtube") === "cutroom"
                ? "YouTube uploads share Cutroom's daily quota; if it runs out, Retry failed steps continues the next day."
                : "Unverified Google API projects can only upload privately, and YouTube's default quota allows about 6 uploads a day.")}
              {form.platforms.includes("tiktok") && (form.tiktokMode === "draft"
                ? " TikTok drafts keep at most 5 waiting per day; open each one in TikTok, paste the caption and choose who can watch."
                : " Until TikTok audits the app, direct posts are private and the TikTok account itself must be private.")}</p>
            <label className="social-check">
              <input type="checkbox" checked={form.publishConsent} onChange={e => setForm(f => ({ ...f, publishConsent: e.target.checked }))} />
              <span>Publish the top {form.topClips} clip{form.topClips === 1 ? "" : "s"} to the selected accounts without asking again for this stream.</span>
            </label>
          </>}
        </fieldset>
        {error && <p role="alert" className="error-message">{error}</p>}
        <Button type="submit" disabled={busy || blocked || !form.url.trim() || (form.platforms.length > 0 && !form.publishConsent) ||
          (form.reviewer === "claude-code" && !form.cloudConsent)}>
          {busy ? <><LoaderCircle size={16} className="spin" />Queuing</> : form.platforms.length ? "Start and publish automatically" : "Start: prepare clips only"}
        </Button>
      </form>
    </section>

    <section className="stream-list" aria-labelledby="stream-list-title">
      <h2 id="stream-list-title">Streams</h2>
      {loadError && <p role="alert" className="error-message">{loadError}</p>}
      {!streams && !loadError && <p role="status" className="suggestion-note">Loading streams…</p>}
      {streams?.length === 0 && <div className="stream-empty">
        <Radio size={20} aria-hidden />
        <p><strong>No streams yet.</strong> Paste a finished YouTube VOD above. Its parts, picked clips and post links will show up here as they finish.</p>
      </div>}
      {streams?.map(stream => <article className="stream-card" key={stream.id}>
        <header>
          <div>
            <h3>{stream.title}</h3>
            <p>{stream.duration ? `${sourceTime(stream.duration)} · ` : ""}{stream.parts.length || "–"} part{stream.parts.length === 1 ? "" : "s"} · top {stream.settings.topClips}{stream.settings.reviewer === "claude-code" ? " · Claude review" : ""}{stream.settings.platforms.length ? ` · ${stream.settings.visibility} on ${stream.settings.platforms.map(p => p === "tiktok" && (stream.settings.tiktokMode ?? "draft") === "draft" ? "TikTok drafts" : platformName[p]).join(", ")}` : " · no auto-posting"}</p>
          </div>
          <span className={`stream-status status-${stream.status}`}>{running(stream) && <LoaderCircle size={14} className="spin" aria-hidden />}{stream.status}</span>
        </header>
        {stream.parts.length > 1 && <div className="stream-progress">
          <progress value={stream.parts.filter(p => p.stage === "ready").length} max={stream.parts.length}
            aria-label={`${stream.parts.filter(p => p.stage === "ready").length} of ${stream.parts.length} parts analyzed`} />
          <span>{stream.parts.filter(p => p.stage === "ready").length}/{stream.parts.length} parts analyzed</span>
        </div>}
        {stream.message && <p className="stream-message">{stream.message}</p>}
        {stream.parts.length > 0 && <ol className="stream-parts">
          {stream.parts.map(part => <li key={part.index} className={`part-${part.stage}`}>
            {part.stage === "ready" ? <Check size={15} aria-hidden /> : part.stage === "failed" ? <AlertCircle size={15} aria-hidden />
              : part.stage === "cancelled" ? <X size={15} aria-hidden /> : part.stage === "queued" ? <CircleDashed size={15} aria-hidden /> : <LoaderCircle size={15} className="spin" aria-hidden />}
            <span className="part-time">Part {part.index + 1} · {sourceTime(part.start)}–{sourceTime(part.end)}</span>
            <span>{stageText(part.stage, stream.settings.reviewer)}{part.stage === "ready" && part.candidates !== undefined ? ` · ${part.candidates} candidates` : ""}{part.message ? ` · ${part.message}` : ""}</span>
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
              {t.caption && <button type="button" className="text-link" onClick={() => void copyCaption(t.caption!)}>Copy caption</button>}
            </span>)}
          </div>)}
        </div>}
        <div className="stream-actions">
          {running(stream) && <Button variant="ghost" size="small" onClick={() => void act(stream, "cancel")}>Cancel stream</Button>}
          {["failed", "cancelled", "completed"].includes(stream.status) &&
            (stream.parts.some(p => p.stage !== "ready") || stream.clips.some(c => c.targets.some(t => t.state === "failed")) || !stream.parts.length) &&
            <Button variant="secondary" size="small" onClick={() => void act(stream, "retry")}><RotateCcw size={14} />Retry failed steps</Button>}
          {stream.status === "completed" && stream.settings.qualityBar !== "reviewed" && stream.settings.platforms.length > 0 &&
            stream.clips.length < stream.settings.topClips && stream.parts.some(p => p.candidates) &&
            <Button variant="secondary" size="small" onClick={() => void act(stream, "publish-reviewed")}><Send size={14} />Post reviewed clips anyway</Button>}
          {stream.clips.some(c => c.targets.some(t => t.state === "unknown")) && <p className="suggestion-note">Unconfirmed uploads are never resent automatically. Check the platform first.</p>}
        </div>
      </article>)}
    </section>
  </>;
}
