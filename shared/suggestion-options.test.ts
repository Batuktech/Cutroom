import { describe, expect, it } from "vitest";
import { suggestionOptionsSchema, suggestionReviewSchema } from "./suggestions.js";
import { defaultSuggestionOptions, suggestionInterests } from "./suggestion-options.js";

describe("local review filter contract", () => {
  it("accepts multiple interests together and all maximum-length choices", () => {
    for (const maxDuration of [20, 30, 40, 50, 60, 70, 80, 90, 100]) {
      const options = suggestionOptionsSchema.parse({ maxDuration, interests: ["funny", "story", "debate"] });
      expect(options.maxDuration).toBe(maxDuration);
      expect(options.minDuration).toBe(5);
      expect(options.interests).toEqual(["funny", "story", "debate"]);
    }
    expect(suggestionInterests).toHaveLength(9);
    expect(suggestionOptionsSchema.parse({})).toEqual(defaultSuggestionOptions);
  });
  it("rejects invalid filters before a costly worker starts", () => {
    for (const patch of [{ maxDuration: 101 }, { maxDuration: 19 }, { minDuration: 0 }, { maxPause: 31 }, { interests: [] }, { interests: ["unsupported"] }, { strictness: "anything" }, { guidance: "a".repeat(601) }])
      expect(suggestionOptionsSchema.safeParse(patch).success).toBe(false);
  });
  it("keeps old reviews readable without pretending they used maximum-length semantics", () => {
    const review = suggestionReviewSchema.parse({ id: "00000000-0000-4000-8000-000000000000", sourceHash: "0".repeat(64), createdAt: "2026-09-09T00:00:00Z", target: 35, focus: "funny", sections: 65, reviewed: 3, candidates: [] });
    expect(review.options).toBeUndefined();
    expect(review.target).toBe(35);
  });
});
