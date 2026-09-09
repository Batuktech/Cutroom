import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Play, Scissors } from "lucide-react";
import type { Health, Job, Project } from "../../shared/types";
import type { ClipSuggestion } from "../../shared/suggestions";
import { defaultSuggestionOptions, suggestionInterests, type SuggestionOptions } from "../../shared/suggestion-options";
import { post } from "../lib/api";
import { time } from "../lib/utils";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { useVideoClock } from "../lib/useVideoClock";

function PassagePreview({ project, candidate }: { project: Project; candidate: ClipSuggestion }) {
  const player = useRef<HTMLVideoElement>(null);
  const clock = useVideoClock(player);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const video = player.current;
    if (video && clock !== null && clock >= candidate.end && !video.paused) {
      video.pause();
      video.currentTime = candidate.end;
    }
  }, [clock, candidate.end]);
  return <div className="suggestion-preview"><strong>Preview: {candidate.title}</strong>
    <video ref={player} className="export-preview-video" src={`/api/projects/${project.id}/media`} controls playsInline autoPlay
      onLoadedMetadata={(e) => { e.currentTarget.currentTime = candidate.start; }}
      onPlay={(e) => { if (e.currentTarget.currentTime < candidate.start || e.currentTarget.currentTime >= candidate.end) e.currentTarget.currentTime = candidate.start; }}
      onError={() => setFailed(true)} />
    {failed && <p role="alert" className="error-message">This source could not play. Close this dialog and create a browser preview in the editor, then try again.</p>}
    <p className="suggestion-note">Source preview · {time(candidate.start)}–{time(candidate.end)}. Playback pauses at the end of this passage.</p>
  </div>;
}

export function SuggestionDialog({ open, close, project, health, jobs, refresh, notify }: {
  open: boolean; close: () => void; project: Project; health: Health | null; jobs: Job[];
  refresh: () => Promise<void>; notify: (message: string, error?: boolean) => void;
}) {
  const review = project.suggestions;
  const [method, setMethod] = useState<"ai" | "fast">("ai");
  const [target, setTarget] = useState(35);
  const [options, setOptions] = useState<SuggestionOptions>(review?.options ?? defaultSuggestionOptions);
  const changeOptions = (patch: Partial<SuggestionOptions>) => setOptions(current => ({ ...current, ...patch }));
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<ClipSuggestion | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fingerprint, setFingerprint] = useState<{ input: string; hash: string } | null>(null);
  const sourceInput = JSON.stringify({ duration: project.duration, segments: project.transcript });
  const stale = !review || fingerprint?.input !== sourceInput ? null : fingerprint.hash !== review.sourceHash;
  const active = jobs.find((j) => j.projectId === project.id && ["queued", "running"].includes(j.status));
  const lastAnalysis = jobs.find((j) => j.projectId === project.id && j.kind === "suggest");
  const analysisRunning = active?.kind === "suggest";
  useEffect(() => {
    let alive = true;
    if (review) {
      const input = new TextEncoder().encode(sourceInput);
      void crypto.subtle.digest("SHA-256", input).then((hash) => {
        const value = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
        if (alive) setFingerprint({ input: sourceInput, hash: value });
      }).catch(() => { if (alive) setFingerprint({ input: sourceInput, hash: "unavailable" }); });
    }
    return () => { alive = false; };
  }, [sourceInput, review]);

  async function run() {
    setPending(true); setError("");
    try {
      if (method === "ai") {
        await post(`/projects/${project.id}/suggestions/analyze`, options);
        notify("Qwen analysis queued. You can keep working while it runs.");
      } else {
        await post(`/projects/${project.id}/suggestions`, { target });
        notify("Fast suggestions added. These use transcript rules, not Qwen.");
      }
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setPending(false); }
  }
  async function add() {
    if (!review || !selected.length) return;
    setPending(true); setError("");
    try {
      const result = await post<{ added: number }>(`/projects/${project.id}/suggestions/accept`, { reviewId: review.id, ids: selected });
      await refresh();
      notify(result.added ? `${result.added} reviewed ${result.added === 1 ? "clip" : "clips"} added.` : "Those clips are already saved.");
      close();
    } catch (e) { setError((e as Error).message); }
    finally { setPending(false); }
  }
  const alreadyAdded = (candidate: ClipSuggestion) => project.clips.some((c) => Math.abs(c.start-candidate.start) < .1 && Math.abs(c.end-candidate.end) < .1);

  return <Dialog open={open} onOpenChange={(value) => { if (!value && !pending) close(); }} title="Find the clips worth keeping"
    description="Choose what interests you, set a maximum length, and preview the passages Qwen finds. You make the final selection." wide>
    <div className="import-method suggestion-method" role="group" aria-label="Suggestion method">
      <Button variant={method === "ai" ? "default" : "secondary"} aria-pressed={method === "ai"} disabled={pending} onClick={() => { setMethod("ai"); setError(""); }}>Local AI review</Button>
      <Button variant={method === "fast" ? "default" : "secondary"} aria-pressed={method === "fast"} disabled={pending} onClick={() => { setMethod("fast"); setError(""); }}>Fast transcript rules</Button>
    </div>
    {method === "ai" ? <>
      <div className="suggestion-controls">
        <label className="field-label">Maximum clip length
          <select value={options.maxDuration} disabled={pending || !!active} onChange={e => changeOptions({ maxDuration: Number(e.target.value) })}>
            {[20, 30, 40, 50, 60, 70, 80, 90, 100].map(n => <option key={n} value={n}>Up to {n} seconds</option>)}
          </select>
        </label>
        <label className="field-label">Candidates to review
          <select value={options.count} disabled={pending || !!active} onChange={e => changeOptions({ count: Number(e.target.value) })}>
            {[5, 10, 20, 25, 30].map(n => <option key={n} value={n}>Up to {n} candidates</option>)}
          </select>
        </label>
        <label className="field-label">Review strictness
          <select value={options.strictness} disabled={pending || !!active} onChange={e => changeOptions({ strictness: e.target.value as SuggestionOptions["strictness"] })}>
            <option value="discovery">Discovery</option><option value="reviewed">Reviewed</option><option value="strict">Strict</option>
          </select>
        </label>
      </div>
      <p className="suggestion-note">{options.strictness === "discovery"
        ? "One AI pass finds passages worth previewing. Missing context or uncertain appeal becomes a note for you to check."
        : options.strictness === "reviewed" ? "A second AI pass checks context and endings, while keeping uncertain choices with clear warnings. This takes longer."
        : "A second AI pass rejects passages unless context, ending, appeal, and speech clarity all pass. This can return no candidates."}</p>
      <fieldset className="suggestion-interests" disabled={pending || !!active}>
        <legend>Interests · choose any combination</legend>
        <p>A passage can match any one of your selected interests.</p>
        <div>{suggestionInterests.map(interest => <label key={interest.id}>
          <input type="checkbox" checked={options.interests.includes(interest.id)} onChange={e => changeOptions({ interests: e.target.checked ? [...options.interests, interest.id] : options.interests.filter(i => i !== interest.id) })} />
          <span>{interest.label}</span>
        </label>)}</div>
      </fieldset>
      {!options.interests.length && <p role="status" className="error-message">Choose at least one interest before starting.</p>}
      <details className="suggestion-extra"><summary>Timing limits & custom guidance</summary>
        <div className="suggestion-controls">
          <label className="field-label">Minimum clip length<select value={options.minDuration} disabled={pending || !!active} onChange={e => changeOptions({ minDuration: Number(e.target.value) })}>
            {[3, 5, 10, 15, 20].map(n => <option key={n} value={n}>{n} seconds</option>)}
          </select></label>
          <label className="field-label">Maximum pause within a clip<select value={options.maxPause} disabled={pending || !!active} onChange={e => changeOptions({ maxPause: Number(e.target.value) })}>
            {[2, 4, 8, 15, 30].map(n => <option key={n} value={n}>{n} seconds</option>)}
          </select></label>
        </div>
        <label className="field-label">What else should Qwen look for?
          <textarea rows={3} maxLength={600} value={options.guidance} disabled={pending || !!active} onChange={e => changeOptions({ guidance: e.target.value })} placeholder="For example: prioritize gambling stories and awkward comebacks; avoid routine introductions." />
        </label>
        <p className="suggestion-note">Guidance steers the AI. It is not an exact keyword filter.</p>
      </details>
      <p className="suggestion-note">Eligible clips are {options.minDuration}–{options.maxDuration} seconds. A 20-second moment can qualify when the maximum is 100 seconds. Qwen scans the whole transcript locally and saves findings as sections finish. Long scans can still take many minutes.</p>
    </> : <>
      <label className="field-label">Aim for this length<select value={target} disabled={pending || !!active} onChange={e => setTarget(Number(e.target.value))}>
        {[15, 20, 25, 30, 35, 60, 90].map(n => <option key={n} value={n}>{n} seconds</option>)}
      </select></label>
      <p className="suggestion-note">Finds keywords, questions, and pauses. Adds up to six editable clips immediately, without an AI content review.</p>
    </>}
    {method === "ai" && !health?.qwen?.ready && <p role="status" className="error-message">{health?.qwen?.message || "Checking local Qwen availability…"} Fast transcript rules remain available.</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
    {lastAnalysis?.status === "failed" && method === "ai" && <p role="alert" className="error-message">Last analysis: {lastAnalysis.message}</p>}
    {active && <div className="suggestion-progress" role="status">
      <span><LoaderCircle size={16} className="spin" />{active.message}</span>
      <progress max={100} value={active.progress} aria-label="Clip analysis progress" />
      <Button variant="secondary" size="small" onClick={() => void post(`/jobs/${active.id}/cancel`).then(refresh).catch((e) => setError(e.message))}>{analysisRunning ? "Stop analysis, keep findings" : "Cancel processing"}</Button>
    </div>}
    <div className="dialog-actions">
      <Button variant="secondary" disabled={pending} onClick={close}>{active ? "Keep working" : "Close"}</Button>
      <Button disabled={pending || !!active || !project.transcript.length || (method === "ai" && (!health?.qwen?.ready || !options.interests.length))} onClick={run}>
        {pending && <LoaderCircle size={16} className="spin" />}
        {method === "ai" ? (review ? "Analyze again" : "Analyze transcript") : "Add fast suggestions"}
      </Button>
    </div>
    {method === "ai" && review && <section className="suggestion-results" aria-label="Reviewed suggestions">
      <div className="section-heading"><h3>{review.candidates.length} {review.candidates.length === 1 ? "candidate" : "candidates"} to review</h3><span>{review.scanned ?? review.sections}/{review.sections} sections read · {review.options?.strictness === "discovery" ? "Discovery scan" : `${review.reviewed} ${review.options ? "second reviews" : "candidates checked"}`}</span></div>
      <p className="suggestion-note">{review.options
        ? `${review.options.interests.map(id => suggestionInterests.find(i => i.id === id)?.label).join(", ")} · up to ${review.options.maxDuration}s · ${review.options.strictness}`
        : `Legacy review · ${review.focus} · old target ${review.target}s`} · {new Date(review.createdAt).toLocaleString()}. These are possibilities to review, not predictions of views.</p>
      {review.complete === false && <p role="status" className="notice">{analysisRunning ? "Live findings: preview now, or stop analysis to select from the saved candidates." : "Partial scan. These saved findings are available to preview and add; the whole transcript was not completed."}</p>}
      {review.diagnostics && <details className="suggestion-diagnostics"><summary>How this result was selected</summary>
        <p>{review.diagnostics.proposed} proposed · {review.diagnostics.invalid} outside source/timing rules · {review.diagnostics.duplicates} {review.diagnostics.duplicates === 1 ? "duplicate" : "duplicates"} · {review.diagnostics.rejected} rejected by Strict review</p>
        <p>{review.diagnostics.emptySections} {review.diagnostics.emptySections === 1 ? "section contained" : "sections contained"} no AI proposals. The saved list is capped at {review.requested ?? 25} candidates.</p>
        {Object.entries(review.diagnostics.reasons).length > 0 && <ul>{Object.entries(review.diagnostics.reasons).map(([reason, n]) => <li key={reason}>{reason}: {n}</li>)}</ul>}
      </details>}
      {stale && <p role="status" className="error-message">The transcript has changed. Analyze it again before adding these clips.</p>}
      {!review.candidates.length && <p className="small-empty">No candidates were saved for these settings. Try Discovery with several interests, allow shorter clips or longer pauses, and check the selection details above when available.</p>}
      <ol className="suggestion-list">{review.candidates.map((candidate, index) => <li key={candidate.id}>
        <label className="suggestion-choice"><input type="checkbox" checked={selected.includes(candidate.id)} disabled={pending || !!active || stale !== false || alreadyAdded(candidate)}
          onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, candidate.id] : ids.filter((id) => id !== candidate.id))} />
          <span><strong><span className="suggestion-number">{String(index + 1).padStart(2, "0")}.</span> {candidate.title}</strong><small>{time(candidate.start)}–{time(candidate.end)} · {Math.round(candidate.end-candidate.start)}s{alreadyAdded(candidate) ? " · Already added" : ""}</small></span>
        </label>
        {candidate.verdict && <span className="suggestion-verdict">{candidate.verdict === "suggested" ? "AI suggestion · manual review" : candidate.verdict === "reviewed" ? "Passed second review" : "Needs a closer look"}</span>}
        <blockquote>{candidate.quote}</blockquote><p>{candidate.reason}</p>
        {candidate.weakness && <p className="suggestion-weakness">Check before using: {candidate.weakness}</p>}
        <Button variant="secondary" size="small" aria-expanded={preview?.id === candidate.id} onClick={() => setPreview(preview?.id === candidate.id ? null : candidate)}><Play size={15} />{preview?.id === candidate.id ? "Close preview" : "Preview passage"}</Button>
        {preview?.id === candidate.id && <PassagePreview key={preview.id} project={project} candidate={preview} />}
      </li>)}</ol>
      {review.candidates.length > 0 && <div className="dialog-actions"><Button disabled={pending || stale !== false || !selected.length || !!active} onClick={add}><Scissors size={16} />Add selected clips{selected.length > 0 ? ` (${selected.length})` : ""}</Button></div>}
    </section>}
  </Dialog>;
}
