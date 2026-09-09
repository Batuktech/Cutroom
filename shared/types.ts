export type CaptionStyle = "studio" | "bold" | "minimal" | "highlight" | "pop" | "punch" | "reveal";
export type CaptionMode = "auto" | "word" | "short";
export type Aspect = "9:16" | "1:1" | "16:9" | "4:5";
export interface Segment {
  id: string;
  start: number;
  end: number;
  text: string;
  words?: { start: number; end: number; word: string }[];
}
export interface Clip {
  id: string;
  title: string;
  start: number;
  end: number;
  aspect: Aspect;
  cropX: number;
  cropY: number;
  fit: "cover" | "contain";
  captionStyle: CaptionStyle;
  captionMode?: CaptionMode;
  captionDuration?: number;
  captions: boolean;
  captionSize: number;
  captionPosition: number;
  accent: string;
  reason?: string;
  status: "draft" | "exported";
  createdAt: string;
}
export interface ExportFile {
  id: string;
  clipId: string;
  title: string;
  filename: string;
  createdAt: string;
  duration: number;
  aspect: Aspect;
  size: number;
  width?: number;
  height?: number;
}
export interface Project {
  suggestions?: import("./suggestions.js").SuggestionReview;
  id: string;
  name: string;
  originalName: string;
  filename: string;
  createdAt: string;
  updatedAt: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  size: number;
  thumbnail: boolean;
  waveform: number[];
  transcript: Segment[];
  language: string | null;
  clips: Clip[];
  exports: ExportFile[];
  demo: boolean;
  previewFile?: string;
}
export type JobKind =
  "import" | "download" | "transcribe" | "export" | "reframe" | "model" | "preview" | "suggest";
export interface Job {
  id: string;
  label?: string;
  projectId?: string;
  kind: JobKind;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  message: string;
  createdAt: string;
  finishedAt?: string;
  result?: unknown;
}
export interface ModelInfo {
  id: string;
  name: string;
  size: string;
  installed: boolean;
  description: string;
}
export interface Health {
  status: string;
  ffmpeg: boolean;
  python: boolean;
  ai: boolean;
  youtube: boolean;
  qwen: { ready: boolean; message: string };
  models: ModelInfo[];
  dataDirectory: string;
  version: string;
}

export interface RestoreSummary {
  restored: number;
  ready: string[];
  existing: string[];
  missingMedia: string[];
  missingExports: number;
}
