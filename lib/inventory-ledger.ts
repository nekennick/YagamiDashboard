import { prisma } from "@/lib/prisma";

const businessTimezoneSuffix = "+07:00";
const closingSnapshotHour = 17;
const businessTimezoneOffsetHours = 7;
const snapshotTargetToleranceMs = 2 * 60 * 60 * 1000;

export type DailyInventoryConfidence = "COMPLETE" | "RECONCILED" | "MISSING_SNAPSHOT";

export type DailyInventoryMovement = {
  id: number;
  sourceDocumentId: string;
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
  transfer: number;
  stocktake: number;
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
  const firstBoundary = operationalDayStart(fromDate);
  const endBoundary = operationalDayEnd(toDate);
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
      select: { id: true, sourceDocumentId: true, occurredAt: true, sourceType: true, documentCode: true, quantityDelta: true, partnerName: true }
    }),
    prisma.productDailyInventoryEntry.findMany({
      where: { productId, branchId, businessDate: { gte: firstDateOnly, lte: lastDateOnly } },
      orderBy: { businessDate: "asc" }
    }),
    prisma.inventorySnapshot.findMany({
      where: {
        productId,
        branchId,
        snapshotDate: {
          gte: new Date(firstBoundary.getTime() - snapshotTargetToleranceMs),
          lte: new Date(endBoundary.getTime() + snapshotTargetToleranceMs)
        }
      },
      orderBy: { snapshotDate: "asc" },
      select: { snapshotDate: true, onHand: true }
    })
  ]);

  if (!product || !branch) {
    return null;
  }

  const saleDocumentIds = [...new Set(movements.filter((movement) => movement.sourceType === "SALE").map((movement) => Number(movement.sourceDocumentId)).filter(Number.isInteger))];
  const invoices = saleDocumentIds.length === 0 ? [] : await prisma.invoice.findMany({
    where: { kvInvoiceId: { in: saleDocumentIds } },
    select: { kvInvoiceId: true, customer: { select: { code: true, name: true } } }
  });
  const invoiceById = new Map(invoices.map((invoice) => [invoice.kvInvoiceId, invoice.customer]));
  const enrichedMovements = movements.map((movement) => {
    if (movement.sourceType !== "SALE" || movement.partnerName) return movement;
    const customer = invoiceById.get(Number(movement.sourceDocumentId));
    const partnerName = customer ? [customer.code, customer.name].filter(Boolean).join(" ") : null;
    return { ...movement, partnerName };
  });

  const entriesByDate = new Map(entries.map((entry) => [formatDateOnly(entry.businessDate), entry]));
  const movementsByDate = groupMovementsByOperationalDate(enrichedMovements);
  const currentBusinessDate = formatBusinessDate(new Date());
  const rows: ProductDailyInventoryRow[] = [];
  let previousClosing: number | null = null;
  let previousVariance: number | null = null;

  for (const date of eachBusinessDate(fromDate, toDate)) {
    const start = operationalDayStart(date);
    const end = operationalDayEnd(date);
    const entry = entriesByDate.get(date);
    const dayMovements = movementsByDate.get(date) ?? [];
    const openingSnapshot = closestSnapshotTo(snapshots, start);
    const closingSnapshot = closestSnapshotTo(snapshots, end);
    const hasUsableSnapshots = Boolean(openingSnapshot && closingSnapshot);
    const transfer = sum(dayMovements.filter(isTransferMovement).map((movement) => movement.quantityDelta));
    const stocktake = sum(dayMovements.filter(isStocktakeMovement).map((movement) => movement.quantityDelta));
    const incoming = sum(dayMovements.filter((movement) => !isTransferMovement(movement) && !isStocktakeMovement(movement) && movement.quantityDelta > 0).map((movement) => movement.quantityDelta));
    const outgoing = Math.abs(sum(dayMovements.filter((movement) => !isTransferMovement(movement) && !isStocktakeMovement(movement) && movement.quantityDelta < 0).map((movement) => movement.quantityDelta)));
    const openingOnHand: number | null = entry?.openingOverride === null || entry?.openingOverride === undefined
      ? (openingSnapshot ? number(openingSnapshot.onHand) : previousClosing)
      : number(entry.openingOverride);
    const actualOnHand = entry?.actualOnHand === null || entry?.actualOnHand === undefined ? null : number(entry.actualOnHand);
    const calculation = calculateDailyInventoryDay({
      openingOnHand,
      incoming,
      outgoing,
      transfer,
      stocktake,
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
      transfer,
      stocktake,
      adjustment: calculation.adjustment,
      closingOnHand: calculation.closingOnHand,
      provisionalClosingOnHand: date === currentBusinessDate && calculation.closingOnHand === null
        ? calculateProvisionalClosing(openingOnHand, incoming, outgoing, transfer, stocktake)
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

export function operationalDayStart(date: string) {
  const [year, month, day] = parseDateParts(date);
  const previousDate = new Date(Date.UTC(year, month - 1, day - 1));
  return businessDayHour(formatUtcDate(previousDate), closingSnapshotHour);
}

export function operationalDayEnd(date: string) {
  return businessDayHour(date, closingSnapshotHour);
}

export function dateOnly(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

export function calculateDailyInventoryDay(input: {
  openingOnHand: number | null;
  incoming: number;
  outgoing: number;
  transfer?: number;
  stocktake?: number;
  snapshotOpening: number | null;
  snapshotClosing: number | null;
  actualOnHand: number | null;
  previousVariance: number | null;
}) {
  const documentedDelta = input.incoming - input.outgoing + (input.transfer ?? 0) + (input.stocktake ?? 0);
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

export function calculateProvisionalClosing(openingOnHand: number | null, incoming: number, outgoing: number, transfer = 0, stocktake = 0) {
  return openingOnHand === null ? null : openingOnHand + incoming - outgoing + transfer + stocktake;
}

function isTransferMovement(movement: DailyInventoryMovement) {
  return movement.sourceType === "TRANSFER_OUT" || movement.sourceType === "TRANSFER_IN";
}

function isStocktakeMovement(movement: DailyInventoryMovement) {
  return movement.sourceType === "STOCKTAKE";
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

function groupMovementsByOperationalDate(movements: Array<{ id: number; sourceDocumentId: string; occurredAt: Date; sourceType: string; documentCode: string | null; quantityDelta: unknown; partnerName: string | null }>) {
  const groups = new Map<string, DailyInventoryMovement[]>();
  for (const movement of movements) {
    const date = operationalDateForMovement(movement.occurredAt);
    const rows = groups.get(date) ?? [];
    rows.push({
      id: movement.id,
      sourceDocumentId: movement.sourceDocumentId,
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

export function operationalDateForMovement(value: Date) {
  const shifted = new Date(value.getTime() + (businessTimezoneOffsetHours - closingSnapshotHour) * 60 * 60 * 1000);
  shifted.setUTCDate(shifted.getUTCDate() + 1);
  return formatUtcDate(shifted);
}

export function closestSnapshotTo<T extends { snapshotDate: Date }>(snapshots: T[], target: Date, toleranceMs = snapshotTargetToleranceMs) {
  let closest: T | undefined;
  let distance = Number.POSITIVE_INFINITY;

  for (const snapshot of snapshots) {
    const nextDistance = Math.abs(snapshot.snapshotDate.getTime() - target.getTime());
    if (nextDistance <= toleranceMs && nextDistance < distance) {
      closest = snapshot;
      distance = nextDistance;
    }
  }

  return closest;
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

function businessDayHour(date: string, hour: number) {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00.000${businessTimezoneSuffix}`);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
