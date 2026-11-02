import { useEffect, useState } from "react";
import type { ExportFile, Job, Project } from "../../shared/types";
import { postContent } from "../../shared/publishing";
import { tiktokPrivacyNames, type TiktokCreator, type TiktokPrivacy } from "../../shared/tiktok";
import { api, post } from "../lib/api";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";

const musicUsage = "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en";
const brandedPolicy = "https://www.tiktok.com/legal/page/global/bc-policy/en";

/**
 * TikTok's required posting screen (Content Sharing Guidelines): fresh creator info, a preview,
 * editable caption, privacy and interactions with no defaults, content disclosure and the consent line.
 */
export function TiktokPostDialog({ project, file, close }: { project: Project; file: ExportFile; close: () => void }) {
  const clip = project.clips.find(c => c.id === file.clipId);
  const saved = clip?.socialCopy?.copy.tiktok;
  const [creator, setCreator] = useState<TiktokCreator | null>(null);
  const [error, setError] = useState("");
  const [caption, setCaption] = useState(saved ? [saved.title, postContent(saved)].filter(Boolean).join("\n\n").slice(0, 2200) : file.title);
  const [privacy, setPrivacy] = useState<TiktokPrivacy | "">("");
  const [allow, setAllow] = useState({ comment: false, duet: false, stitch: false });
  const [disclose, setDisclose] = useState(false);
  const [brandOrganic, setBrandOrganic] = useState(false);
  const [brandedContent, setBrandedContent] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    api<TiktokCreator>("/social/tiktok/creator").then(c => { if (current) setCreator(c); }, (e: Error) => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [attempt]);
  const load = () => { setError(""); setCreator(null); setAttempt(a => a + 1); };

  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const timer = setInterval(() => void api<Job[]>("/jobs").then(list => {
      const next = list.find(j => j.id === job.id);
      if (next) setJob(next);
    }).catch(() => {}), 2000);
    return () => clearInterval(timer);
  }, [job]);

  const tooLong = !!creator && file.duration > creator.maxDuration;
  const disclosureMissing = disclose && !brandOrganic && !brandedContent;
  const posting = !!job && ["queued", "running"].includes(job.status);
  const receipt = job?.status === "completed" ? job.result as { url?: string; message?: string } | undefined : undefined;
  const canPost = !!creator && !tooLong && !!privacy && !disclosureMissing && !posting && !receipt && !busy;

  function chooseBranded(on: boolean) {
    setBrandedContent(on);
    // Branded content cannot be private, so Only me is switched off with a notice.
    if (on && privacy === "SELF_ONLY") { setPrivacy(""); setNotice("Branded content can't be private. Choose who can watch again."); }
    else setNotice("");
  }
  async function submit() {
    if (!privacy) return;
    setBusy(true); setError("");
    try {
      setJob(await post<Job>("/social/tiktok/post", {
        exportId: file.id, caption, privacy, allowComment: allow.comment, allowDuet: allow.duet, allowStitch: allow.stitch,
        brandOrganic: disclose && brandOrganic, brandedContent: disclose && brandedContent, consent: true,
      }));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  const label = disclose && brandedContent ? "Paid partnership" : disclose && brandOrganic ? "Promotional content" : "";
  return <Dialog open onOpenChange={value => { if (!value && !posting) close(); }} title="Post to TikTok" description="Choose how this video appears on TikTok. Nothing is sent until you select Post." wide>
    {!creator && !error && <p role="status">Checking your TikTok account…</p>}
    {error && <p role="alert" className="error-message">{error} <Button variant="secondary" onClick={load}>Try again</Button></p>}
    {creator && <div className="tiktok-post">
      <video className="tiktok-preview" src={`/api/exports/${file.id}/mp4`} controls playsInline preload="metadata" aria-label={`Preview of ${file.title}`} />
      <fieldset className="social-fieldset" disabled={posting || !!receipt}>
        <div className="tiktok-creator">
          {creator.avatarUrl && <img src={creator.avatarUrl} alt="" width={36} height={36} referrerPolicy="no-referrer" />}
          <span>Posting as <strong>{creator.nickname}</strong> (@{creator.username})</span>
        </div>
        {tooLong && <p role="alert" className="error-message">This video is {Math.round(file.duration)} seconds; TikTok allows up to {Math.floor(creator.maxDuration)} seconds for this account. Trim the clip and export again.</p>}
        <label className="field-label">Caption
          <textarea rows={4} value={caption} maxLength={2200} onChange={e => setCaption(e.target.value)} />
        </label>
        <label className="field-label">Who can watch this video
          <select value={privacy} onChange={e => { setPrivacy(e.target.value as TiktokPrivacy | ""); setNotice(""); }} required>
            <option value="" disabled>Select who can watch</option>
            {creator.privacyLevels.map(level => <option key={level} value={level} disabled={level === "SELF_ONLY" && disclose && brandedContent}>
              {tiktokPrivacyNames[level]}{level === "SELF_ONLY" && disclose && brandedContent ? " (not available for branded content)" : ""}
            </option>)}
          </select>
        </label>
        <fieldset className="social-fieldset">
          <legend className="field-label">Allow users to</legend>
          {([["comment", "Comment", creator.commentDisabled], ["duet", "Duet", creator.duetDisabled], ["stitch", "Stitch", creator.stitchDisabled]] as const).map(([key, name, off]) =>
            <label className="social-check" key={key} title={off ? `${name} is turned off in your TikTok settings.` : undefined}>
              <input type="checkbox" checked={allow[key] && !off} disabled={off} onChange={e => setAllow(a => ({ ...a, [key]: e.target.checked }))} />
              <span>{name}{off ? " · off in your TikTok settings" : ""}</span>
            </label>)}
        </fieldset>
        <label className="social-check">
          <input type="checkbox" role="switch" checked={disclose} onChange={e => { setDisclose(e.target.checked); setNotice(""); }} />
          <span>Disclose video content: this video promotes goods or services in exchange for something of value</span>
        </label>
        {disclose && <div className="tiktok-disclosure">
          <label className="social-check"><input type="checkbox" checked={brandOrganic} onChange={e => setBrandOrganic(e.target.checked)} />
            <span><strong>Your brand</strong> · You are promoting yourself or your own business.</span></label>
          <label className="social-check"><input type="checkbox" checked={brandedContent} onChange={e => chooseBranded(e.target.checked)} />
            <span><strong>Branded content</strong> · You are promoting another brand or a third party.</span></label>
          {label && <p className="suggestion-note">Your video will be labeled as "{label}".</p>}
          {disclosureMissing && <p className="suggestion-note">Choose Your brand, Branded content, or both to post with disclosure on.</p>}
        </div>}
        {notice && <p role="status" className="notice">{notice}</p>}
        <p className="suggestion-note tiktok-consent">
          By posting, you agree to TikTok's {disclose && brandedContent && <><a href={brandedPolicy} target="_blank" rel="noreferrer">Branded Content Policy</a> and </>}
          <a href={musicUsage} target="_blank" rel="noreferrer">Music Usage Confirmation</a>.
        </p>
      </fieldset>
      {posting && <div className="suggestion-progress" role="status"><p>{job!.message}</p><progress value={job!.progress} max={100} aria-label="TikTok upload progress" /></div>}
      {job?.status === "failed" && <p role="alert" className="error-message">{job.message}</p>}
      {receipt && <p role="status" className="notice">{receipt.message} {receipt.url && <a href={receipt.url} target="_blank" rel="noreferrer">Open on TikTok</a>}</p>}
      {(posting || receipt) && <p className="suggestion-note">After posting, TikTok can take a few minutes to process the video before it appears on your profile.</p>}
    </div>}
    <div className="dialog-actions">
      <Button variant="secondary" disabled={posting} onClick={close}>{receipt ? "Done" : "Cancel"}</Button>
      {creator && !receipt && <Button disabled={!canPost} onClick={() => void submit()}>{posting ? "Posting…" : "Post"}</Button>}
    </div>
  </Dialog>;
}
