export interface YoutubeRange { start: number; end: number }
export type YoutubeQuality = 720 | 1080;

export function youtubeParts(range?: YoutubeRange, partMinutes?: number): (YoutubeRange | undefined)[] {
  if (!range) {
    if (partMinutes) throw new Error("Choose a time range before splitting into projects.");
    return [undefined];
  }
  const { start, end } = range;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 86400 || end-start < 1)
    throw new Error("Enter a valid start and end within 24 hours, at least one second apart.");
  if (partMinutes !== undefined && ![15, 30, 60].includes(partMinutes))
    throw new Error("Split projects into 15, 30, or 60 minutes.");
  if (!partMinutes) {
    if (end-start > 10800) throw new Error("Keep each project under 3 hours, or split the range into parts.");
    return [range];
  }
  const count = Math.ceil((end-start)/(partMinutes*60));
  const parts = Array.from({ length: count }, (_, i) => ({ start: start+i*partMinutes*60, end: Math.min(end, start+(i+1)*partMinutes*60) }));
  if (parts.length > 1 && parts.at(-1)!.end - parts.at(-1)!.start < 1) {
    parts[parts.length-2].end = end;
    parts.pop();
  }
  if (parts.length > 24) throw new Error("Queue up to 24 parts at once. Choose a shorter range or larger parts.");
  return parts;
}

export function sourceTime(seconds: number) {
  const whole = Math.floor(seconds);
  return [Math.floor(whole/3600), Math.floor(whole/60)%60, whole%60].map((v) => String(v).padStart(2, "0")).join(":");
}
