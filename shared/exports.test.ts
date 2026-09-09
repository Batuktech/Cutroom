import { expect, it } from "vitest";
import { latestExports } from "./exports.js";
import type { ExportFile } from "./types.js";

it("keeps the newest render per clip without losing distinct clips or changing history", () => {
  const make = (id: string, clipId: string, createdAt: string): ExportFile => ({
    id,
    clipId,
    createdAt,
    title: id,
    filename: `${id}.mp4`,
    duration: 10,
    aspect: "9:16",
    size: 100,
  });
  const files = [
    make("old", "a", "2026-09-07T00:00:00Z"),
    make("other", "b", "2026-09-08T00:00:00Z"),
    make("new", "a", "2026-09-08T01:00:00Z"),
  ];
  expect(latestExports(files).map((file) => file.id)).toEqual(["new", "other"]);
  expect(files.map((file) => file.id)).toEqual(["old", "other", "new"]);
});
