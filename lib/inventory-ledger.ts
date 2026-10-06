import { prisma } from "@/lib/prisma";

const businessTimezoneSuffix = "+07:00";
const snapshotToleranceMs = 60 * 60 * 1000;

export type DailyInventoryConfidence = "COMPLETE" | "RECONCILED" | "MISSING_SNAPSHOT";

export type DailyInventoryMovement = {
  id: number;
  occurredAt: string;
  sourceType: string;
  documentCode: string | null;
  quantityDelta: number;
  partnerName: string | null;
};

export type ProductDailyInventoryRow = {
  date: string;
  openingOverride: number | null;
  openingOnHand: number | null;
  incoming: number;
  outgoing: number;
  adjustment: number | null;
  closingOnHand: number | null;
  provisionalClosingOnHand: number | null;
  actualOnHand: number | null;
  variance: number | null;
  dailyVariance: number | null;
  status: "CHƯA KIỂM" | "KHỚP" | "DƯ" | "THIẾU";
  note: string | null;
  confidence: DailyInventoryConfidence;
  updatedAt: string | null;
  movements: DailyInventoryMovement[];
};

export async function getProductDailyInventory(params: {
  productId: number;
  branchId: number;
  fromDate: string;
  toDate: string;
}) {
  const { productId, branchId, fromDate, toDate } = params;
  const firstBoundary = businessDayBoundary(fromDate);
  const endBoundary = nextBusinessDayBoundary(toDate);
  const firstDateOnly = dateOnly(fromDate);
  const lastDateOnly = dateOnly(toDate);

  const [product, branch, movements, entries, snapshots] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId }, select: { id: true, code: true, name: true, unit: true } }),
    prisma.branch.findUnique({ where: { id: branchId }, select: { id: true, name: true } }),
    prisma.inventoryMovement.findMany({
      where: {
        productId,
        branchId,
        isActive: true,
        occurredAt: { gte: firstBoundary, lt: endBoundary }
      },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      select: { id: true, occurredAt: true, sourceType: true, documentCode: true, quantityDelta: true, partnerName: true }
    }),
    prisma.productDailyInventoryEntry.findMany({
      where: { productId, branchId, businessDate: { gte: firstDateOnly, lte: lastDateOnly } },
      orderBy: { businessDate: "asc" }
    }),
    prisma.inventorySnapshot.findMany({
      where: {
        productId,
        branchId,
        snapshotDate: { gte: new Date(firstBoundary.getTime() - snapshotToleranceMs), lt: endBoundary }
      },
      orderBy: { snapshotDate: "asc" },
      select: { snapshotDate: true, onHand: true }
    })
  ]);

  if (!product || !branch) {
    return null;
  }

  const entriesByDate = new Map(entries.map((entry) => [formatDateOnly(entry.businessDate), entry]));
  const movementsByDate = groupMovementsByDate(movements);
  const currentBusinessDate = formatBusinessDate(new Date());
  const rows: ProductDailyInventoryRow[] = [];
  let previousClosing: number | null = null;
  let previousVariance: number | null = null;

  for (const date of eachBusinessDate(fromDate, toDate)) {
    const start = businessDayBoundary(date);
    const end = nextBusinessDayBoundary(date);
    const entry = entriesByDate.get(date);
    const dayMovements = movementsByDate.get(date) ?? [];
    const openingSnapshot = closestSnapshotBefore(snapshots, start);
    const closingSnapshot = closestSnapshotBefore(snapshots, end);
    const hasUsableSnapshots = isFreshSnapshot(openingSnapshot, start) && isFreshSnapshot(closingSnapshot, end);
    const incoming = sum(dayMovements.filter((movement) => movement.quantityDelta > 0).map((movement) => movement.quantityDelta));
    const outgoing = Math.abs(sum(dayMovements.filter((movement) => movement.quantityDelta < 0).map((movement) => movement.quantityDelta)));
    const openingOnHand: number | null = entry?.openingOverride === null || entry?.openingOverride === undefined
      ? previousClosing ?? (openingSnapshot ? number(openingSnapshot.onHand) : null)
      : number(entry.openingOverride);
    const actualOnHand = entry?.actualOnHand === null || entry?.actualOnHand === undefined ? null : number(entry.actualOnHand);
    const calculation = calculateDailyInventoryDay({
      openingOnHand,
      incoming,
      outgoing,
      snapshotOpening: hasUsableSnapshots && openingSnapshot ? number(openingSnapshot.onHand) : null,
      snapshotClosing: hasUsableSnapshots && closingSnapshot ? number(closingSnapshot.onHand) : null,
      actualOnHand,
      previousVariance
    });

    rows.push({
      date,
      openingOverride: entry?.openingOverride === null || entry?.openingOverride === undefined ? null : number(entry.openingOverride),
      openingOnHand,
      incoming,
      outgoing,
      adjustment: calculation.adjustment,
      closingOnHand: calculation.closingOnHand,
      provisionalClosingOnHand: date === currentBusinessDate && calculation.closingOnHand === null
        ? calculateProvisionalClosing(openingOnHand, incoming, outgoing)
        : null,
      actualOnHand,
      variance: calculation.variance,
      dailyVariance: calculation.dailyVariance,
      status: calculation.status,
      note: entry?.note ?? null,
      confidence: calculation.confidence,
      updatedAt: entry?.updatedAt.toISOString() ?? null,
      movements: dayMovements
    });

    previousClosing = calculation.closingOnHand;
    previousVariance = calculation.variance;
  }

  return { product, branch, rows };
}

export function businessDayBoundary(date: string) {
  return new Date(`${date}T00:00:00.000${businessTimezoneSuffix}`);
}

export function nextBusinessDayBoundary(date: string) {
  const [year, month, day] = parseDateParts(date);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return new Date(`${formatUtcDate(next)}T00:00:00.000${businessTimezoneSuffix}`);
}

export function dateOnly(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

export function calculateDailyInventoryDay(input: {
  openingOnHand: number | null;
  incoming: number;
  outgoing: number;
  snapshotOpening: number | null;
  snapshotClosing: number | null;
  actualOnHand: number | null;
  previousVariance: number | null;
}) {
  const documentedDelta = input.incoming - input.outgoing;
  const adjustment = input.snapshotOpening === null || input.snapshotClosing === null
    ? null
    : input.snapshotClosing - input.snapshotOpening - documentedDelta;
  const closingOnHand = input.openingOnHand === null || adjustment === null
    ? null
    : input.openingOnHand + documentedDelta + adjustment;
  const variance = input.actualOnHand === null || closingOnHand === null ? null : input.actualOnHand - closingOnHand;
  const dailyVariance = variance === null || input.previousVariance === null ? null : variance - input.previousVariance;

  return {
    adjustment,
    closingOnHand,
    variance,
    dailyVariance,
    status: inventoryStatus(variance),
    confidence: adjustment === null ? "MISSING_SNAPSHOT" as const : adjustment === 0 ? "COMPLETE" as const : "RECONCILED" as const
  };
}

export function calculateProvisionalClosing(openingOnHand: number | null, incoming: number, outgoing: number) {
  return openingOnHand === null ? null : openingOnHand + incoming - outgoing;
}

export function eachBusinessDate(fromDate: string, toDate: string) {
  const [fromYear, fromMonth, fromDay] = parseDateParts(fromDate);
  const [toYear, toMonth, toDay] = parseDateParts(toDate);
  const current = new Date(Date.UTC(fromYear, fromMonth - 1, fromDay));
  const end = Date.UTC(toYear, toMonth - 1, toDay);
  const dates: string[] = [];

  while (current.getTime() <= end) {
    dates.push(formatUtcDate(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

function groupMovementsByDate(movements: Array<{ id: number; occurredAt: Date; sourceType: string; documentCode: string | null; quantityDelta: unknown; partnerName: string | null }>) {
  const groups = new Map<string, DailyInventoryMovement[]>();
  for (const movement of movements) {
    const date = formatBusinessDate(movement.occurredAt);
    const rows = groups.get(date) ?? [];
    rows.push({
      id: movement.id,
      occurredAt: movement.occurredAt.toISOString(),
      sourceType: movement.sourceType,
      documentCode: movement.documentCode,
      quantityDelta: number(movement.quantityDelta),
      partnerName: movement.partnerName
    });
    groups.set(date, rows);
  }
  return groups;
}

function closestSnapshotBefore(snapshots: Array<{ snapshotDate: Date; onHand: unknown }>, boundary: Date) {
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    if (snapshots[index].snapshotDate.getTime() <= boundary.getTime()) {
      return snapshots[index];
    }
  }
  return undefined;
}

function isFreshSnapshot(snapshot: { snapshotDate: Date } | undefined, boundary: Date) {
  return Boolean(snapshot && boundary.getTime() - snapshot.snapshotDate.getTime() <= snapshotToleranceMs);
}

function inventoryStatus(variance: number | null): ProductDailyInventoryRow["status"] {
  if (variance === null) return "CHƯA KIỂM";
  if (variance === 0) return "KHỚP";
  return variance > 0 ? "DƯ" : "THIẾU";
}

function formatBusinessDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return `${map.get("year")}-${map.get("month")}-${map.get("day")}`;
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function parseDateParts(value: string): [number, number, number] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Ngày không hợp lệ.");
  const [year, month, day] = value.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new Error("Ngày không hợp lệ.");
  }
  return [year, month, day];
}

function formatUtcDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
