import { z } from "zod";
import type { Clip, Segment } from "../shared/types.js";
import { captionCues, captionPopScale, usesCyrillic } from "../shared/captions.js";

export function downloadName(value: string, fallback = "cutroom-clip") {
  return (
    value
      .normalize("NFC")
      .replace(/[^\p{L}\p{N} _-]/gu, "")
      .trim()
      .slice(0, 70) || fallback
  );
}

export const segmentSchema = z
  .object({
    id: z.string().min(1).max(100),
    start: z.number().finite().min(0),
    end: z.number().finite().min(0),
    text: z.string().max(4000),
    words: z
      .array(
        z.object({
          start: z.number().finite().min(0),
          end: z.number().finite().min(0),
          word: z.string().max(200),
        }),
      )
      .max(2000)
      .optional(),
  })
  .refine((s) => s.end > s.start, "Caption end must follow its start.");
export const clipSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    start: z.number().finite().min(0),
    end: z.number().finite().min(0),
    aspect: z.enum(["9:16", "1:1", "16:9", "4:5"]),
    cropX: z.number().min(0).max(100),
    cropY: z.number().min(0).max(100),
    fit: z.enum(["cover", "contain"]),
    captionStyle: z.enum(["studio", "bold", "minimal", "highlight", "pop", "punch", "reveal"]),
    captionMode: z.enum(["auto", "word", "short"]).default("auto"),
    captionDuration: z.number().min(1).max(2).default(1.5),
    captions: z.boolean(),
    captionSize: z.number().min(24).max(96),
    captionPosition: z.number().min(10).max(45),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .refine(
    (c) => c.end - c.start >= 0.5,
    "A clip must be at least half a second.",
  )
  .refine((c) => c.end - c.start <= 1800, "Keep each clip under 30 minutes.");

export function validateBounds(start: number, end: number, duration: number) {
  if (start < 0 || end > duration + 0.05 || end <= start)
    throw new Error("Clip timing is outside the source video.");
}

export function suggestClips(
  segments: Segment[],
  duration: number,
  target = 35,
): Omit<Clip, "id" | "createdAt">[] {
  if (!segments.length) return [];
  const candidates = segments
    .map((s, index) => {
      const endSegment =
        segments.slice(index).find((next) => next.end - s.start >= target) ??
        segments.at(-1)!;
      const end = Math.min(endSegment.end, duration, s.start + target * 1.6);
      const text = segments
        .slice(index)
        .filter((next) => next.start < end)
        .map((next) => next.text)
        .join(" ")
        .trim();
      const hook =
        /\b(why|how|mistake|secret|never|stop|imagine|important|learned|instead|problem|actually)\b/i.test(
          s.text,
        );
      const question = s.text.includes("?");
      const boundary = index === 0 || s.start - segments[index - 1].end > 0.6;
      const score =
        (hook ? 3 : 0) +
        (question ? 2 : 0) +
        (boundary ? 2 : 0) +
        Math.min(text.length / 250, 2) -
        Math.abs(end - s.start - target) / 15;
      return {
        start: s.start,
        end,
        text,
        score,
        reason: question
          ? "Opens with a question"
          : hook
            ? "Clear opening statement"
            : boundary
              ? "Starts after a natural pause"
              : "Complete transcript passage",
      };
    })
    .filter((c) => c.end - c.start >= Math.min(10, duration * 0.5))
    .sort((a, b) => b.score - a.score);
  const chosen: typeof candidates = [];
  for (const c of candidates) {
    if (
      chosen.every(
        (other) =>
          Math.max(
            0,
            Math.min(other.end, c.end) - Math.max(other.start, c.start),
          ) <
          Math.min(other.end - other.start, c.end - c.start) * 0.25,
      )
    )
      chosen.push(c);
    if (chosen.length >= 6) break;
  }
  return chosen
    .sort((a, b) => a.start - b.start)
    .map((c) => ({
      title: c.text.split(/[.!?]/)[0].trim().slice(0, 75) || "New clip",
      start: c.start,
      end: c.end,
      aspect: "16:9",
      cropX: 50,
      cropY: 50,
      fit: "cover",
      captionStyle: "highlight",
      captions: true,
      captionSize: 52,
      captionPosition: 20,
      accent: "#d6f58a",
      reason: c.reason,
      status: "draft",
    }));
}

function timestamp(seconds: number, ass = false) {
  const factor = ass ? 100 : 1000;
  const ticks = Math.round(Math.max(0, seconds) * factor);
  const s = Math.floor(ticks / factor);
  return `${ass ? Math.floor(s / 3600) : String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}${ass ? "." : ","}${String(ticks % factor).padStart(ass ? 2 : 3, "0")}`;
}
export function toSrt(segments: Segment[], start = 0, end = Infinity) {
  return segments
    .filter((s) => s.end > start && s.start < end)
    .map(
      (s, i) =>
        `${i + 1}\n${timestamp(Math.max(s.start, start) - start)} --> ${timestamp(Math.min(s.end, end) - start)}\n${s.text.trim()}\n`,
    )
    .join("\n");
}
export function parseSrt(input: string): Segment[] {
  const normalized = input
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .replace(/^WEBVTT[^\n]*\n/, "")
    .trim();
  const result: Segment[] = [];
  for (const block of normalized.split(/\n\s*\n/)) {
    const lines = block.split("\n");
    const at = lines.findIndex((l) => l.includes("-->"));
    if (at < 0) continue;
    const match = lines[at].match(
      /(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})/,
    );
    if (!match)
      throw new Error(
        "A subtitle timestamp could not be read. Use SRT or WebVTT timestamps.",
      );
    const [, h, m, s, ms, eh, em, es, ems] = match;
    const start =
      Number(h || 0) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
    const end =
      Number(eh || 0) * 3600 +
      Number(em) * 60 +
      Number(es) +
      Number(ems) / 1000;
    const text = lines
      .slice(at + 1)
      .join(" ")
      .replace(/<[^>]*>/g, "")
      .trim();
    if (text && end > start)
      result.push({ id: crypto.randomUUID(), start, end, text });
  }
  if (!result.length)
    throw new Error("No captions found. Import an SRT or VTT subtitle file.");
  return result.sort((a, b) => a.start - b.start);
}
export function outputSize(
  aspect: Clip["aspect"],
  quality: "720" | "1080" = "1080",
) {
  const base = quality === "720" ? 720 : 1080;
  return aspect === "9:16"
    ? [base, (base * 16) / 9]
    : aspect === "16:9"
      ? [(base * 16) / 9, base]
      : aspect === "4:5"
        ? [base, (base * 5) / 4]
        : [base, base];
}
export function buildAss(
  segments: Segment[],
  clip: Clip,
  width: number,
  height: number,
) {
  const size = Math.round((clip.captionSize * width) / 1080);
  const color =
    "&H00" +
    clip.accent.slice(5, 7) +
    clip.accent.slice(3, 5) +
    clip.accent.slice(1, 3);
  const primary = "&H00FFFFFF";
  const outline = clip.captionStyle === "minimal" ? 1 : 3;
  const box = clip.captionStyle === "studio" ? 3 : 1;
  // The bundled 700-weight static instance retains this original internal family name.
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Manrope ExtraLight,${size},${primary},&H00FFFFFF,&H00131313,&H80000000,-1,0,0,0,100,100,0,0,${box},${outline},0,2,${Math.round(width * 0.07)},${Math.round(width * 0.07)},${Math.round((height * clip.captionPosition) / 100)},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  const events = segments
    .filter((s) => s.end > clip.start && s.start < clip.end)
    .flatMap((s) => captionCues(s, clip.captionStyle, clip))
    .flatMap((cue) => {
      const escape = (text: string) =>
        text.replace(/[\\{}]/g, "").replace(/[\r\n]/g, " ");
      const event = (start: number, end: number, text: string) => {
        const a = Math.max(clip.start, start),
          b = Math.min(clip.end, end);
        return b <= a
          ? ""
          : `Dialogue: 0,${timestamp(a - clip.start, true)},${timestamp(b - clip.start, true)},Default,,0,0,0,,${usesCyrillic(cue.text) ? "{\\fnNoto Sans}" : ""}${text}`;
      };
      if (clip.captionStyle === "highlight" || clip.captionStyle === "reveal") {
        return cue.words.map((word, index) => {
          const text = (clip.captionStyle === "reveal" ? cue.words.slice(0, index + 1) : cue.words)
            .map((w, i) =>
              i === index
                ? `{\\c${color}&}${escape(w.word)}{\\c&HFFFFFF&}`
                : escape(w.word),
            )
            .join(" ");
          return event(
            index === 0 ? cue.start : word.start,
            cue.words[index + 1]?.start ?? cue.end,
            text,
          );
        });
      }
      const popping = clip.captionStyle === "pop" || clip.captionStyle === "punch";
      let motion = "";
      if (popping) {
        const offset = Math.max(0, clip.start - cue.start) * 1000;
        const scale = (captionPopScale(offset/1000)*100).toFixed(3);
        motion = `{\\fscx${scale}\\fscy${scale}`;
        if (offset < 70) motion += `\\t(0,${Math.round(70-offset)},\\fscx106\\fscy106)`;
        if (offset < 140) motion += `\\t(${Math.max(0, Math.round(70-offset))},${Math.round(140-offset)},\\fscx100\\fscy100)`;
        motion += "}";
      }
      const text = ["bold", "pop", "punch"].includes(clip.captionStyle) ? escape(cue.text).toUpperCase() : escape(cue.text);
      return [event(cue.start, cue.end, motion + (clip.captionStyle === "pop" ? `{\\c${color}&}` : "") + text)];
    })
    .filter(Boolean)
    .join("\n");
  return header + events + "\n";
}
