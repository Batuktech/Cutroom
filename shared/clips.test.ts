import { expect, it } from "vitest";
import type { Clip } from "./types.js";
import { sameClipEdits } from "./clips.js";

const clip: Clip = {
  id: "clip",
  title: "Original cut",
  start: 0,
  end: 10,
  aspect: "9:16",
  cropX: 50,
  cropY: 50,
  fit: "cover",
  captionStyle: "studio",
  captions: true,
  captionSize: 52,
  captionPosition: 20,
  accent: "#d6f58a",
  status: "exported",
  createdAt: "2026-09-08",
};
it("does not leave a saved exported clip dirty when its status changes to draft", () => {
  expect(sameClipEdits(clip, { ...clip, status: "draft" })).toBe(true);
  expect(sameClipEdits(clip, { ...clip, title: "A newer edit" })).toBe(false);
  expect(sameClipEdits(clip, { ...clip, start: 0.001 })).toBe(false);
  expect(sameClipEdits(clip, { ...clip, captionPosition: 25 })).toBe(false);
  expect(sameClipEdits(clip, null)).toBe(false);
});
