import type { CaptionStyle, CaptionMode, Segment } from "./types.js";

// libass scales this bundled font by its 2,732-unit ascender/descender span;
// browsers use its 2,000-unit em. Keep preview sizing in the same coordinate space.
export const CAPTION_EM_SCALE = 2000 / 2732;

export function usesCyrillic(text: string) {
  return /\p{Script=Cyrillic}/u.test(text);
}
export function captionEmScale(text: string) {
  return usesCyrillic(text) ? 1000 / 1362 : CAPTION_EM_SCALE;
}

export interface CaptionCue {
  start: number;
  end: number;
  text: string;
  words: { start: number; end: number; word: string }[];
}
export interface CaptionOptions { captionMode?: CaptionMode; captionDuration?: number }
export function hasMeasuredWords(segment: Segment): boolean {
  return !!segment.words?.length && segment.words.map((w) => w.word).join("").replace(/\s/gu, "") === segment.text.replace(/\s/gu, "");
}

export function captionPopScale(elapsed: number) {
  const ms = Math.max(0, elapsed * 1000);
  if (ms < 70) return .88 + .18 * ms / 70;
  if (ms < 140) return 1.06 - .06 * (ms-70) / 70;
  return 1;
}

export function captionCues(
  segment: Segment,
  style: CaptionStyle,
  options: CaptionOptions = {},
): CaptionCue[] {
  const mode = options.captionMode && options.captionMode !== "auto" ? options.captionMode
    : style === "pop" ? "word" : ["punch", "reveal"].includes(style) ? "short" : "auto";
  const duration = Math.min(2, Math.max(1, options.captionDuration ?? 1.5));
  const limit = mode === "word" ? 1 : mode === "short" ? 6 : style === "bold" || style === "highlight" ? 5 : 8;
  const textWords = segment.text.trim().split(/\s+/).filter(Boolean);
  if (!textWords.length) return [];
  const measured = hasMeasuredWords(segment);
  const words = measured
    ? segment.words!.map((w) => ({ ...w, word: w.word.trim() }))
    : textWords.map((word, i) => ({
        word,
        start:
          segment.start +
          ((segment.end - segment.start) * i) / textWords.length,
        end:
          segment.start +
          ((segment.end - segment.start) * (i + 1)) / textWords.length,
      }));
  const result: CaptionCue[] = [];
  const groups: typeof words[] = [];
  for (const word of words) {
    const group = groups.at(-1);
    if (
      !group ||
      group.length >= limit ||
      (mode === "short" && word.end - group[0].start > duration) ||
      (measured &&
        (word.start - group.at(-1)!.end > 0.65 ||
          word.end - group[0].start > 3.5))
    ) {
      groups.push([word]);
    } else {
      group.push(word);
    }
  }
  for (const [index, group] of groups.entries()) {
    const start = Math.max(segment.start, group[0].start);
    const end = Math.min(
      segment.end,
      mode === "short" ? start + duration : Infinity,
      group.at(-1)!.end + (measured ? 0.08 : 0),
      groups[index + 1]?.[0].start ?? Infinity,
    );
    if (end > start)
      result.push({
        start,
        end,
        text: group.map((w) => w.word).join(" "),
        words: group,
      });
  }
  return result;
}
export function captionSegments(
  segments: Segment[],
  style: CaptionStyle,
  options: CaptionOptions = {},
): Segment[] {
  return segments.flatMap((s) =>
    captionCues(s, style, options).map((cue, i) => ({ id: `${s.id}-${i}`, ...cue })),
  );
}
