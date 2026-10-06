import { describe, expect, it } from "vitest";
import { calculateDailyInventoryDay, calculateProvisionalClosing, eachBusinessDate } from "./inventory-ledger";

describe("calculateDailyInventoryDay", () => {
  it("reconciles a completed sale day with the stock snapshot", () => {
    const result = calculateDailyInventoryDay({
      openingOnHand: 50,
      incoming: 0,
      outgoing: 38,
      snapshotOpening: 50,
      snapshotClosing: 12,
      actualOnHand: 15,
      previousVariance: null
    });

    expect(result).toMatchObject({ adjustment: 0, closingOnHand: 12, variance: 3, dailyVariance: null, status: "DƯ", confidence: "COMPLETE" });
  });

  it("calculates the variance movement from the previous day", () => {
    const result = calculateDailyInventoryDay({
      openingOnHand: 12,
      incoming: 200,
      outgoing: 122,
      snapshotOpening: 12,
      snapshotClosing: 90,
      actualOnHand: 85,
      previousVariance: 3
    });

    expect(result).toMatchObject({ adjustment: 0, closingOnHand: 90, variance: -5, dailyVariance: -8, status: "THIẾU", confidence: "COMPLETE" });
  });

  it("marks an unexplained stock delta as reconciled instead of a stocktake", () => {
    const result = calculateDailyInventoryDay({
      openingOnHand: 20,
      incoming: 10,
      outgoing: 4,
      snapshotOpening: 20,
      snapshotClosing: 31,
      actualOnHand: null,
      previousVariance: null
    });

    expect(result).toMatchObject({ adjustment: 5, closingOnHand: 31, status: "CHƯA KIỂM", confidence: "RECONCILED" });
  });

  it("does not invent an adjustment when an end-of-day snapshot is missing", () => {
    const result = calculateDailyInventoryDay({
      openingOnHand: 20,
      incoming: 10,
      outgoing: 4,
      snapshotOpening: 20,
      snapshotClosing: null,
      actualOnHand: 26,
      previousVariance: 0
    });

    expect(result).toMatchObject({ adjustment: null, closingOnHand: null, variance: null, dailyVariance: null, confidence: "MISSING_SNAPSHOT" });
  });

  it("shows a provisional closing balance without inventing an adjustment", () => {
    expect(calculateProvisionalClosing(1409, 0, 253)).toBe(1156);
    expect(calculateProvisionalClosing(null, 0, 253)).toBeNull();
  });
});

describe("eachBusinessDate", () => {
  it("includes both endpoints across a month boundary", () => {
    expect(eachBusinessDate("2026-09-30", "2026-10-02")).toEqual(["2026-09-30", "2026-10-01", "2026-10-02"]);
  });
});
