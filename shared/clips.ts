import type { Clip } from "./types.js";

export function clipEdits(clip: Clip | null) {
  if (!clip) return null;
  const {
    title,
    start,
    end,
    aspect,
    cropX,
    cropY,
    fit,
    captionStyle,
    captionMode = "auto",
    captionDuration = 1.5,
    captions,
    captionSize,
    captionPosition,
    accent,
  } = clip;
  return {
    title,
    start,
    end,
    aspect,
    cropX,
    cropY,
    fit,
    captionStyle,
    captionMode,
    captionDuration,
    captions,
    captionSize,
    captionPosition,
    accent,
  };
}

export function sameClipEdits(a: Clip | null, b: Clip | null) {
  return JSON.stringify(clipEdits(a)) === JSON.stringify(clipEdits(b));
}
