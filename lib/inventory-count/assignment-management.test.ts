import { describe, expect, it } from "vitest";
import { parsePositiveInt, uniquePositiveInts } from "@/lib/inventory-count/assignment-management";

describe("assignment management identifiers", () => {
  it("accepts positive integer ids sent by HTML controls", () => {
    expect(parsePositiveInt("12")).toBe(12);
    expect(parsePositiveInt(8)).toBe(8);
  });

  it("rejects invalid identifiers and removes duplicates", () => {
    expect(parsePositiveInt("0")).toBeNull();
    expect(parsePositiveInt("1.5")).toBeNull();
    expect(parsePositiveInt("abc")).toBeNull();
    expect(uniquePositiveInts(["3", 3, 4, 0, "bad"])).toEqual([3, 4]);
  });
});
