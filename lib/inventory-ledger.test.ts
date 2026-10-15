import { describe, expect, it } from "vitest";
import { calculateDailyInventoryDay, calculateProvisionalClosing, closestSnapshotTo, eachBusinessDate, operationalDateForMovement, operationalDayEnd, operationalDayStart } from "./inventory-ledger";

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

  it("accounts for a warehouse transfer separately instead of treating it as an adjustment", () => {
    const result = calculateDailyInventoryDay({ openingOnHand: 342, incoming: 400, outgoing: 1, transfer: -150, snapshotOpening: 342, snapshotClosing: 591, actualOnHand: null, previousVariance: null });
    expect(result).toMatchObject({ adjustment: 0, closingOnHand: 591, confidence: "COMPLETE" });
  });

  it("accounts for a KiotViet stocktake separately from unexplained variance", () => {
    const result = calculateDailyInventoryDay({ openingOnHand: 949, incoming: 500, outgoing: 200, transfer: 0, stocktake: 38, snapshotOpening: 949, snapshotClosing: 1287, actualOnHand: null, previousVariance: null });
    expect(result).toMatchObject({ adjustment: 0, closingOnHand: 1287, confidence: "COMPLETE" });
  });

  it("shows a provisional closing balance without inventing an adjustment", () => {
    expect(calculateProvisionalClosing(1409, 0, 253)).toBe(1156);
    expect(calculateProvisionalClosing(342, 400, 1, -150)).toBe(591);
    expect(calculateProvisionalClosing(null, 0, 253)).toBeNull();
  });
});

describe("eachBusinessDate", () => {
  it("includes both endpoints across a month boundary", () => {
    expect(eachBusinessDate("2026-09-30", "2026-10-02")).toEqual(["2026-09-30", "2026-10-01", "2026-10-02"]);
  });
});

describe("operational inventory snapshots", () => {
  it("uses the previous 17:00 as opening and the current 17:00 as closing in Vietnam time", () => {
    expect(operationalDayStart("2026-10-07").toISOString()).toBe("2026-10-06T10:00:00.000Z");
    expect(operationalDayEnd("2026-10-07").toISOString()).toBe("2026-10-07T10:00:00.000Z");
  });

  it("uses the same 17:00 boundary for the previous close and the next opening", () => {
    const snapshots = [
      { snapshotDate: new Date("2026-10-07T09:55:00.000Z"), onHand: 752 },
      { snapshotDate: new Date("2026-10-07T10:05:00.000Z"), onHand: 750 },
      { snapshotDate: new Date("2026-10-08T10:01:00.000Z"), onHand: 700 }
    ];

    expect(closestSnapshotTo(snapshots, operationalDayEnd("2026-10-07"))?.onHand).toBe(752);
    expect(closestSnapshotTo(snapshots, operationalDayStart("2026-10-08"))?.onHand).toBe(752);
    expect(closestSnapshotTo(snapshots, operationalDayEnd("2026-10-08"))?.onHand).toBe(700);
  });

  it("assigns movements after 17:00 to the following operational day", () => {
    expect(operationalDateForMovement(new Date("2026-10-13T04:19:00.000Z"))).toBe("2026-10-13");
    expect(operationalDateForMovement(new Date("2026-10-12T11:00:00.000Z"))).toBe("2026-10-13");
    expect(operationalDateForMovement(new Date("2026-10-13T10:00:00.000Z"))).toBe("2026-10-14");
  });
});
