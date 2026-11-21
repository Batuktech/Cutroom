import { Select, SelectItem } from "./ui/select";
import type { ChannelSettings } from "../../shared/publishing";

export function PublishingChannel({ settings, change }: { settings: ChannelSettings; change: (value: ChannelSettings) => void }) {
  if (settings.__type === "youtube") return <div className="social-fields">
    <label className="field-label">YouTube visibility<Select value={settings.type} onValueChange={v => change({ ...settings, type: v as typeof settings.type })}><SelectItem value="private">Private</SelectItem><SelectItem value="unlisted">Unlisted</SelectItem><SelectItem value="public">Public</SelectItem></Select></label>
    <label className="field-label">Made for kids<Select value={settings.selfDeclaredMadeForKids} onValueChange={v => change({ ...settings, selfDeclaredMadeForKids: v as "yes" | "no" })}><SelectItem value="no">No</SelectItem><SelectItem value="yes">Yes</SelectItem></Select></label>
  </div>;
  if (settings.__type === "tiktok") return <>
    <label className="field-label">TikTok visibility<Select value={settings.privacy_level} onValueChange={v => change({ ...settings, privacy_level: v as typeof settings.privacy_level })}>
      <SelectItem value="SELF_ONLY">Only me</SelectItem><SelectItem value="PUBLIC_TO_EVERYONE">Everyone</SelectItem><SelectItem value="MUTUAL_FOLLOW_FRIENDS">Mutual friends</SelectItem><SelectItem value="FOLLOWER_OF_CREATOR">Followers</SelectItem>
    </Select></label>
    <div className="social-fields">{([
      ["comment", "Allow comments"], ["duet", "Allow duets"], ["stitch", "Allow stitch"], ["brand_organic_toggle", "Promotes my own brand"], ["brand_content_toggle", "Paid partnership"], ["video_made_with_ai", "Video contains AI-generated content"],
    ] as const).map(([key, label]) => <label className="social-check" key={key}><input type="checkbox" checked={settings[key]} onChange={e => change({ ...settings, [key]: e.target.checked })} />{label}</label>)}</div>
    <p className="suggestion-note">Your TikTok account determines which options it allows. Original audio is kept.</p>
  </>;
  return <p className="suggestion-note">Publish the single video as an Instagram Reel, with its original audio.</p>;
}
