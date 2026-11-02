import { openAsBlob } from "node:fs";
import { lstat } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { requestJson, SocialError, socialAccounts } from "./social-accounts.js";
import { tiktokPrivacyLevels, type TiktokCreator, type TiktokPost } from "../shared/tiktok.js";

export interface UploadMeta { title: string; description: string; tags: string[]; visibility: "public" | "private"; duration: number }
export interface UploadReceipt { remoteId: string; url?: string; message?: string }

async function videoFile(file: string) {
  const info = await lstat(file);
  if (!info.isFile() || info.size < 1 || info.size > 1024 ** 3) throw new SocialError("The rendered video must be a regular MP4 under 1 GB.", true);
  return { size: info.size, blob: await openAsBlob(file, { type: "video/mp4" }) };
}
// YouTube rejects angle brackets in titles and descriptions.
const plain = (text: string, max: number) => Array.from(text.replace(/[<>]/g, "").trim()).slice(0, max).join("");

function youtubeReason(body: unknown) {
  return z.object({ error: z.object({ errors: z.array(z.object({ reason: z.string() })).min(1) }) }).safeParse(body).data?.error.errors[0].reason;
}
export async function uploadYoutube(file: string, meta: UploadMeta, signal?: AbortSignal): Promise<UploadReceipt> {
  const { size, blob } = await videoFile(file);
  const token = await socialAccounts.accessToken("youtube", signal);
  const description = [meta.description, meta.tags.join(" "), meta.duration <= 180 ? "#Shorts" : ""].filter(Boolean).join("\n\n");
  const init = await requestJson("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST", signal,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": String(size) },
    body: JSON.stringify({
      snippet: { title: plain(meta.title, 100) || "Clip", description: plain(description, 4900), categoryId: "22",
        tags: meta.tags.map(tag => tag.replace(/^#/, "")).slice(0, 15) },
      status: { privacyStatus: meta.visibility, selfDeclaredMadeForKids: false },
    }),
  }, "YouTube");
  if (init.status >= 400) {
    const reason = youtubeReason(init.body);
    throw new SocialError(reason === "quotaExceeded" ? "YouTube's daily API quota is used up (about 6 uploads per day by default). Retry tomorrow or request more quota."
      : reason === "uploadLimitExceeded" ? "This YouTube channel reached its upload limit for now."
      : `YouTube refused the upload (HTTP ${init.status}${reason ? `, ${reason.slice(0, 60)}` : ""}).`, true, reason ?? "http");
  }
  const location = init.headers.get("location");
  if (!location || new URL(location).hostname !== "www.googleapis.com") throw new SocialError("YouTube returned an invalid upload session.", true);
  // From here a lost response may still have produced a video, so failures are not definite.
  const upload = await requestJson(location, { method: "PUT", body: blob, signal, timeout: 60 * 60_000,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "video/mp4" } }, "YouTube");
  const video = z.object({ id: z.string().regex(/^[\w-]{6,20}$/) }).safeParse(upload.body);
  if (upload.status >= 400 || !video.success) throw new SocialError(`YouTube did not confirm the upload (HTTP ${upload.status}). Check YouTube Studio before retrying.`, false);
  return { remoteId: video.data.id, url: `https://youtube.com/shorts/${video.data.id}` };
}

const tiktokEnvelope = z.object({ error: z.object({ code: z.string(), message: z.string().optional() }).optional(), data: z.unknown().optional() });
const tiktokMessages: Record<string, string> = {
  // Cutroom already retries as SELF_ONLY, so a repeat means TikTok also wants the account itself private.
  unaudited_client_can_only_post_to_private_accounts: "Your TikTok app is not audited yet, so it can only post to a private account. In TikTok, open Settings and privacy → Privacy and turn on Private account, or finish TikTok's app audit.",
  spam_risk_too_many_posts: "TikTok's daily post limit for this account was reached.",
  reached_active_user_cap: "Your TikTok app reached its daily posting quota.",
  scope_not_authorized: "The TikTok connection lacks this permission. Add video.upload and video.publish to the TikTok app, then connect TikTok again in Settings.",
  spam_risk_too_many_pending_share: "TikTok allows 5 drafts waiting in your inbox per day. Post or delete the drafts in TikTok, then retry.",
  access_token_invalid: "The TikTok sign-in expired. Connect TikTok again in Settings.",
  rate_limit_exceeded: "TikTok rate limit reached. Try again in a minute.",
  privacy_level_option_mismatch: "This TikTok account does not allow the chosen visibility.",
};
async function tiktok(route: string, token: string, body: unknown, signal?: AbortSignal) {
  const response = await requestJson("https://open.tiktokapis.com" + route, { method: "POST", signal, body: JSON.stringify(body),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" } }, "TikTok");
  const envelope = tiktokEnvelope.safeParse(response.body);
  const code = envelope.data?.error?.code;
  if (response.status >= 400 || !envelope.success || (code && code !== "ok"))
    throw new SocialError(tiktokMessages[code ?? ""] ?? `TikTok refused the request (HTTP ${response.status}${code ? `, ${code.slice(0, 60)}` : ""}).`, true, code);
  return envelope.data.data;
}
/** TikTok chunks are 5–64 MB; the final chunk absorbs the remainder and files under 5 MB go whole. */
export function tiktokChunks(size: number) {
  const chunk = 10 * 1024 * 1024;
  if (size < 5 * 1024 * 1024) return { chunkSize: size, count: 1 };
  const count = Math.max(1, Math.floor(size / chunk));
  return { chunkSize: count === 1 ? size : chunk, count };
}
/** The caption TikTok shows: title, description and hashtags. Drafts cannot carry it, so the user pastes it in the app. */
export function tiktokCaption(meta: UploadMeta) {
  return Array.from([meta.title, meta.description, meta.tags.join(" ")].filter(Boolean).join("\n\n")).slice(0, 2200).join("");
}
const tiktokSession = z.object({ publish_id: z.string().min(1).max(64), upload_url: z.string().url().max(2048) });
async function sendTiktokChunks(session: unknown, blob: Blob, size: number, signal?: AbortSignal) {
  const init = tiktokSession.safeParse(session);
  if (!init.success || new URL(init.data.upload_url).protocol !== "https:") throw new SocialError("TikTok returned an invalid upload session.", true);
  const { chunkSize, count } = tiktokChunks(size);
  try {
    for (let i = 0; i < count; i++) {
      const start = i * chunkSize, end = i === count - 1 ? size : start + chunkSize;
      const response = await requestJson(init.data.upload_url, { method: "PUT", body: blob.slice(start, end), signal, timeout: 20 * 60_000,
        headers: { "Content-Type": "video/mp4", "Content-Range": `bytes ${start}-${end - 1}/${size}` } }, "TikTok");
      if (response.status >= 400) throw new Error();
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new SocialError("TikTok did not confirm the upload. Check the TikTok app before retrying.", false);
  }
  return init.data.publish_id;
}
const tiktokStatus = z.object({ status: z.string(), fail_reason: z.string().optional(), publicaly_available_post_id: z.array(z.union([z.string(), z.number()])).optional() });
/** Processing continues on TikTok's side; poll for up to three minutes. Undefined means it is still processing. */
async function waitForTiktok(token: string, publishId: string, done: string[], signal?: AbortSignal) {
  for (let attempt = 0; attempt < 36; attempt++) {
    await delay(5000, undefined, { signal });
    let status;
    try { status = tiktokStatus.safeParse(await tiktok("/v2/post/publish/status/fetch/", token, { publish_id: publishId }, signal)).data; }
    catch (error) { if (signal?.aborted) throw error; continue; }
    if (status && done.includes(status.status)) return status;
    if (status?.status === "FAILED")
      throw new SocialError(`TikTok could not process the video${status.fail_reason ? ` (${status.fail_reason.slice(0, 60)})` : ""}.`, true);
  }
}
/** Sends the clip to the creator's TikTok inbox. They add the caption and choose who can watch in the TikTok app. */
export async function uploadTiktokDraft(file: string, _meta: UploadMeta, signal?: AbortSignal): Promise<UploadReceipt> {
  const { size, blob } = await videoFile(file);
  const token = await socialAccounts.accessToken("tiktok", signal);
  const { chunkSize, count } = tiktokChunks(size);
  const publishId = await sendTiktokChunks(await tiktok("/v2/post/publish/inbox/video/init/", token, {
    source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: chunkSize, total_chunk_count: count },
  }, signal), blob, size, signal);
  const status = await waitForTiktok(token, publishId, ["SEND_TO_USER_INBOX", "PUBLISH_COMPLETE"], signal);
  return { remoteId: publishId, message: status ? "Sent to your TikTok inbox. Open the TikTok notification, paste the caption and post."
    : "Uploaded. TikTok is still processing it; the draft will appear in your TikTok inbox." };
}
const creatorInfo = z.object({
  creator_username: z.string().max(200), creator_nickname: z.string().max(200).optional(), creator_avatar_url: z.string().max(2048).optional(),
  privacy_level_options: z.array(z.string()).max(10), max_video_post_duration_sec: z.number().positive(),
  comment_disabled: z.boolean().optional(), duet_disabled: z.boolean().optional(), stitch_disabled: z.boolean().optional(),
});
/** Reads the creator's current posting settings; TikTok refuses with a message when the creator cannot post right now. */
export async function tiktokCreator(signal?: AbortSignal): Promise<TiktokCreator> {
  const token = await socialAccounts.accessToken("tiktok", signal);
  const info = creatorInfo.safeParse(await tiktok("/v2/post/publish/creator_info/query/", token, {}, signal));
  if (!info.success) throw new SocialError("TikTok returned unreadable creator settings.", true);
  const d = info.data;
  return {
    nickname: d.creator_nickname || d.creator_username, username: d.creator_username,
    avatarUrl: d.creator_avatar_url?.startsWith("https://") ? d.creator_avatar_url : undefined,
    privacyLevels: tiktokPrivacyLevels.filter(level => d.privacy_level_options.includes(level)),
    commentDisabled: !!d.comment_disabled, duetDisabled: !!d.duet_disabled, stitchDisabled: !!d.stitch_disabled,
    maxDuration: d.max_video_post_duration_sec,
  };
}
/** Posts with exactly the settings the user picked on Cutroom's TikTok posting screen. */
export async function postTiktok(file: string, post: Omit<TiktokPost, "exportId" | "consent">, duration: number, signal?: AbortSignal): Promise<UploadReceipt> {
  const { size, blob } = await videoFile(file);
  const creator = await tiktokCreator(signal);
  if (!creator.privacyLevels.includes(post.privacy)) throw new SocialError(tiktokMessages.privacy_level_option_mismatch, true);
  if (duration > creator.maxDuration) throw new SocialError(`TikTok allows videos up to ${Math.floor(creator.maxDuration)} seconds for this account.`, true);
  const token = await socialAccounts.accessToken("tiktok", signal);
  const { chunkSize, count } = tiktokChunks(size);
  const publishId = await sendTiktokChunks(await tiktok("/v2/post/publish/video/init/", token, {
    post_info: {
      title: post.caption, privacy_level: post.privacy, video_cover_timestamp_ms: 1000,
      disable_comment: creator.commentDisabled || !post.allowComment,
      disable_duet: creator.duetDisabled || !post.allowDuet,
      disable_stitch: creator.stitchDisabled || !post.allowStitch,
      brand_organic_toggle: post.brandOrganic, brand_content_toggle: post.brandedContent,
    },
    source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: chunkSize, total_chunk_count: count },
  }, signal), blob, size, signal);
  const status = await waitForTiktok(token, publishId, ["PUBLISH_COMPLETE"], signal);
  const id = status?.publicaly_available_post_id?.[0];
  return { remoteId: publishId, url: id ? `https://www.tiktok.com/@${creator.username}/video/${id}` : undefined,
    message: status ? (id ? "Posted to TikTok." : "Posted. TikTok may still be reviewing it before it appears on your profile.")
      : "Uploaded. TikTok is still processing it; it can take a few minutes to appear on your profile." };
}
export async function uploadTiktok(file: string, meta: UploadMeta, signal?: AbortSignal): Promise<UploadReceipt> {
  const { size, blob } = await videoFile(file);
  const token = await socialAccounts.accessToken("tiktok", signal);
  const creator = z.object({ creator_username: z.string().max(200), privacy_level_options: z.array(z.string()).max(10), max_video_post_duration_sec: z.number().positive() })
    .safeParse(await tiktok("/v2/post/publish/creator_info/query/", token, {}, signal));
  if (!creator.success) throw new SocialError("TikTok returned unreadable creator settings.", true);
  let privacy = meta.visibility === "public" ? "PUBLIC_TO_EVERYONE" : "SELF_ONLY";
  if (!creator.data.privacy_level_options.includes(privacy)) throw new SocialError(tiktokMessages.privacy_level_option_mismatch, true);
  if (meta.duration > creator.data.max_video_post_duration_sec) throw new SocialError("This clip is longer than TikTok allows for the account.", true);
  const { chunkSize, count } = tiktokChunks(size);
  const title = tiktokCaption(meta);
  const initialise = () => tiktok("/v2/post/publish/video/init/", token, {
    post_info: { title, privacy_level: privacy, disable_duet: false, disable_stitch: false, disable_comment: false, video_cover_timestamp_ms: 1000 },
    source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: chunkSize, total_chunk_count: count },
  }, signal);
  let session;
  try { session = await initialise(); }
  catch (error) {
    // Unaudited apps may only post privately, just as Google locks unverified uploads to private.
    if (!(error instanceof SocialError && error.code === "unaudited_client_can_only_post_to_private_accounts") ||
      privacy === "SELF_ONLY" || !creator.data.privacy_level_options.includes("SELF_ONLY")) throw error;
    privacy = "SELF_ONLY";
    session = await initialise();
  }
  const privateNote = privacy !== (meta.visibility === "public" ? "PUBLIC_TO_EVERYONE" : "SELF_ONLY")
    ? "Posted as private (only you) because the TikTok app is not audited yet." : undefined;
  const publishId = await sendTiktokChunks(session, blob, size, signal);
  const status = await waitForTiktok(token, publishId, ["PUBLISH_COMPLETE"], signal);
  if (status) {
    const id = status.publicaly_available_post_id?.[0];
    return { remoteId: publishId, url: id ? `https://www.tiktok.com/@${creator.data.creator_username}/video/${id}` : undefined,
      message: privateNote ?? (id ? undefined : "Published. TikTok may still be reviewing it before it appears publicly.") };
  }
  return { remoteId: publishId, message: `Uploaded. TikTok is still processing it; check the TikTok app.${privateNote ? ` ${privateNote}` : ""}` };
}
