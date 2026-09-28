import { openAsBlob } from "node:fs";
import { lstat } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { requestJson, SocialError, socialAccounts } from "./social-accounts.js";

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
  unaudited_client_can_only_post_to_private_accounts: "Your TikTok app is not audited yet, so it can only post privately. Choose Private visibility or finish TikTok's app audit.",
  spam_risk_too_many_posts: "TikTok's daily post limit for this account was reached.",
  reached_active_user_cap: "Your TikTok app reached its daily posting quota.",
  scope_not_authorized: "The TikTok connection lacks video.publish. Connect TikTok again in Settings.",
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
export async function uploadTiktok(file: string, meta: UploadMeta, signal?: AbortSignal): Promise<UploadReceipt> {
  const { size, blob } = await videoFile(file);
  const token = await socialAccounts.accessToken("tiktok", signal);
  const creator = z.object({ creator_username: z.string().max(200), privacy_level_options: z.array(z.string()).max(10), max_video_post_duration_sec: z.number().positive() })
    .safeParse(await tiktok("/v2/post/publish/creator_info/query/", token, {}, signal));
  if (!creator.success) throw new SocialError("TikTok returned unreadable creator settings.", true);
  const privacy = meta.visibility === "public" ? "PUBLIC_TO_EVERYONE" : "SELF_ONLY";
  if (!creator.data.privacy_level_options.includes(privacy)) throw new SocialError(tiktokMessages.privacy_level_option_mismatch, true);
  if (meta.duration > creator.data.max_video_post_duration_sec) throw new SocialError("This clip is longer than TikTok allows for the account.", true);
  const { chunkSize, count } = tiktokChunks(size);
  const title = Array.from([meta.title, meta.description, meta.tags.join(" ")].filter(Boolean).join("\n\n")).slice(0, 2200).join("");
  const init = z.object({ publish_id: z.string().min(1).max(64), upload_url: z.string().url().max(2048) }).safeParse(
    await tiktok("/v2/post/publish/video/init/", token, {
      post_info: { title, privacy_level: privacy, disable_duet: false, disable_stitch: false, disable_comment: false, video_cover_timestamp_ms: 1000 },
      source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: chunkSize, total_chunk_count: count },
    }, signal));
  if (!init.success || new URL(init.data.upload_url).protocol !== "https:") throw new SocialError("TikTok returned an invalid upload session.", true);
  const publishId = init.data.publish_id;
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
  // Publishing continues on TikTok's side; poll briefly for a final state.
  for (let attempt = 0; attempt < 36; attempt++) {
    await delay(5000, undefined, { signal });
    let status;
    try {
      status = z.object({ status: z.string(), fail_reason: z.string().optional(), publicaly_available_post_id: z.array(z.union([z.string(), z.number()])).optional() })
        .safeParse(await tiktok("/v2/post/publish/status/fetch/", token, { publish_id: publishId }, signal)).data;
    } catch (error) { if (signal?.aborted) throw error; continue; }
    if (status?.status === "PUBLISH_COMPLETE") {
      const id = status.publicaly_available_post_id?.[0];
      return { remoteId: publishId, url: id ? `https://www.tiktok.com/@${creator.data.creator_username}/video/${id}` : undefined,
        message: id ? undefined : "Published. TikTok may still be reviewing it before it appears publicly." };
    }
    if (status?.status === "FAILED")
      throw new SocialError(`TikTok could not publish the video${status.fail_reason ? ` (${status.fail_reason.slice(0, 60)})` : ""}.`, true);
  }
  return { remoteId: publishId, message: "Uploaded. TikTok is still processing it; check the TikTok app." };
}
