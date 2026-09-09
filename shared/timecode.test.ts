import { describe, expect, it } from "vitest";
import { formatTimecode, parseTimecode } from "./timecode.js";

describe("precise trim timecodes", () => {
  it("accepts seconds, minutes, and hours without losing milliseconds", () => {
    expect(parseTimecode("18.764")).toBe(18.764);
    expect(parseTimecode("01:18.764")).toBe(78.764);
    expect(parseTimecode("1:01:18.764")).toBe(3678.764);
    expect(formatTimecode(59.9998)).toBe("01:00.000");
  });
  it("rejects ambiguous or malformed values", () => {
    for (const value of [
      "",
      "-1",
      "1:99",
      "1:60:00",
      "1.2.3",
      "1e3",
      "NaN",
      "1:01.0001",
    ])
      expect(parseTimecode(value)).toBeNull();
  });
});
