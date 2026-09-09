import { describe, expect, it } from "vitest";
import { youtubeUrl } from "./youtube.js";

describe("YouTube import URL boundary", () => {
  it("normalizes video, short, mobile, and shared links to one video", () => {
    for (const url of [
      "https://youtu.be/jNQXAC9IVRw?si=shared",
      "https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PLignored&t=30",
      "https://m.youtube.com/shorts/jNQXAC9IVRw",
      "http://youtube.com/live/jNQXAC9IVRw",
      "https://www.youtube.com/embed/jNQXAC9IVRw",
    ]) expect(youtubeUrl(url)).toBe("https://www.youtube.com/watch?v=jNQXAC9IVRw");
  });
  it("rejects local addresses, deceptive domains, credentials, and non-video routes", () => {
    for (const url of [
      "http://127.0.0.1:4318/api/backup", "file:///etc/passwd", "javascript:alert(1)",
      "https://youtube.com.evil.example/watch?v=jNQXAC9IVRw",
      "https://youtube.com@evil.example/watch?v=jNQXAC9IVRw",
      "https://user:pass@youtube.com/watch?v=jNQXAC9IVRw",
      "https://youtube.com:444/watch?v=jNQXAC9IVRw",
      "https://youtube.com/playlist?list=PL123", "https://youtube.com/@channel",
      "https://youtu.be/../../private", "https://youtube.com/watch?v=bad-id",
    ]) expect(() => youtubeUrl(url), url).toThrow();
  });
});
