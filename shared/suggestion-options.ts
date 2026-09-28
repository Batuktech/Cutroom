import type { AIProvider } from "./ai-providers.js";
export const suggestionInterests = [
  { id: "interesting", label: "Interesting conversations" },
  { id: "funny", label: "Humor & banter" },
  { id: "educational", label: "Advice & explanations" },
  { id: "story", label: "Stories & anecdotes" },
  { id: "surprising", label: "Surprises & reveals" },
  { id: "debate", label: "Disagreements & opinions" },
  { id: "emotional", label: "Emotional moments" },
  { id: "reactions", label: "Reactions & comebacks" },
  { id: "quotes", label: "Quotable lines" },
] as const;
export type SuggestionInterest = typeof suggestionInterests[number]["id"];
export interface SuggestionOptions {
  provider?: AIProvider;
  outputFormat?: "auto" | "json_schema" | "json_object";
  model?: string;
  maxRequests?: number;
  maxDuration: number;
  minDuration: number;
  maxPause: number;
  interests: SuggestionInterest[];
  guidance: string;
  strictness: "discovery" | "reviewed" | "strict";
  count: number;
}
export const defaultSuggestionOptions: SuggestionOptions = {
  outputFormat: "auto", provider: "local", model: "", maxRequests: 20,
  maxDuration: 60, minDuration: 5, maxPause: 15,
  interests: ["interesting", "funny", "story", "reactions"], guidance: "",
  strictness: "discovery", count: 25,
};
