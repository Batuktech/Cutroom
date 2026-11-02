import { z } from "zod";

/** TikTok's privacy levels, in the order its posting screen lists them. */
export const tiktokPrivacyLevels = ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"] as const;
export type TiktokPrivacy = typeof tiktokPrivacyLevels[number];
export const tiktokPrivacyNames: Record<TiktokPrivacy, string> = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me",
};

/** Fresh creator settings, fetched each time the posting screen opens as TikTok requires. */
export interface TiktokCreator {
  nickname: string;
  username: string;
  avatarUrl?: string;
  privacyLevels: TiktokPrivacy[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxDuration: number;
}

// Every choice comes from the user on the posting screen; nothing here has a default.
export const tiktokPostSchema = z.object({
  exportId: z.string().uuid(),
  caption: z.string().max(2200),
  privacy: z.enum(tiktokPrivacyLevels),
  allowComment: z.boolean(),
  allowDuet: z.boolean(),
  allowStitch: z.boolean(),
  brandOrganic: z.boolean(),
  brandedContent: z.boolean(),
  consent: z.literal(true),
}).refine(p => !(p.brandedContent && p.privacy === "SELF_ONLY"), "Branded content cannot be private on TikTok.");
export type TiktokPost = z.infer<typeof tiktokPostSchema>;
