import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function time(seconds: number, decimal = false) {
  if (!Number.isFinite(seconds)) return "0:00";
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}${decimal ? "." + Math.floor((s % 1) * 10) : ""}`;
}
export function size(bytes: number) {
  return bytes > 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
export function relativeDate(iso: string) {
  const date = new Date(iso),
    today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  return date.toDateString() === yesterday.toDateString()
    ? "Yesterday"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
