import type { ChannelSettings } from "../../shared/publishing";

export function PublishingChannel({ settings, change }: { settings: ChannelSettings; change: (value: ChannelSettings) => void }) {
  if (settings.__type === "youtube") return <div className="social-fields">
    <label className="field-label">YouTube visibility<select value={settings.type} onChange={e => change({ ...settings, type: e.target.value as typeof settings.type })}><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label>
    <label className="field-label">Made for kids<select value={settings.selfDeclaredMadeForKids} onChange={e => change({ ...settings, selfDeclaredMadeForKids: e.target.value as "yes" | "no" })}><option value="no">No</option><option value="yes">Yes</option></select></label>
  </div>;
  if (settings.__type === "tiktok") return <>
    <label className="field-label">TikTok visibility<select value={settings.privacy_level} onChange={e => change({ ...settings, privacy_level: e.target.value as typeof settings.privacy_level })}>
      <option value="SELF_ONLY">Only me</option><option value="PUBLIC_TO_EVERYONE">Everyone</option><option value="MUTUAL_FOLLOW_FRIENDS">Mutual friends</option><option value="FOLLOWER_OF_CREATOR">Followers</option>
    </select></label>
    <div className="social-fields">{([
      ["comment", "Allow comments"], ["duet", "Allow duets"], ["stitch", "Allow stitch"], ["brand_organic_toggle", "Promotes my own brand"], ["brand_content_toggle", "Paid partnership"], ["video_made_with_ai", "Video contains AI-generated content"],
    ] as const).map(([key, label]) => <label className="social-check" key={key}><input type="checkbox" checked={settings[key]} onChange={e => change({ ...settings, [key]: e.target.checked })} />{label}</label>)}</div>
    <p className="suggestion-note">Your TikTok account determines which options it allows. Original audio is kept.</p>
  </>;
  return <p className="suggestion-note">Publish the single video as an Instagram Reel, with its original audio.</p>;
}
