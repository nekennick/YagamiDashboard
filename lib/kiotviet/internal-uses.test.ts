import { describe, expect, it } from "vitest";
import { isCompletedInternalUseStatus } from "./internal-uses";

describe("isCompletedInternalUseStatus", () => {
  it("includes completed internal-use documents only", () => {
    expect(isCompletedInternalUseStatus(2)).toBe(true);
    expect(isCompletedInternalUseStatus(0)).toBe(false);
    expect(isCompletedInternalUseStatus(1)).toBe(false);
  });
});
