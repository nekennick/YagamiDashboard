import { prisma } from "@/lib/prisma";
import { fetchKiotVietPage } from "@/lib/kiotviet/client";
import { parseKiotVietDate } from "@/lib/kiotviet/datetime";

type ObjectRecord = Record<string, unknown>;

export type InventoryMovementSyncStats = {
  totalRecords: number;
  savedRecords: number;
  warnings?: string[];
};

type IdMaps = {
  productIds: Map<number, number>;
  branchIds: Map<number, number>;
  branchNames: Map<number, string>;
};

const pageSize = 100;

export async function syncPurchaseMovements(fromDate: Date, toDate: Date): Promise<InventoryMovementSyncStats> {
  const records = await fetchPagedRecords(
    `/purchaseorders?fromPurchaseDate=${encodeURIComponent(fromDate.toISOString())}&toPurchaseDate=${encodeURIComponent(toDate.toISOString())}`
  );
  const maps = await loadIdMaps();
  let savedRecords = 0;

  for (const record of records) {
    savedRecords += await savePurchaseMovements(record, maps);
  }

  return { totalRecords: records.length, savedRecords };
}

export async function syncReturnMovements(fromDate: Date): Promise<InventoryMovementSyncStats> {
  const records = await fetchPagedRecords(
    `/returns?lastModifiedFrom=${encodeURIComponent(fromDate.toISOString())}&orderBy=modifiedDate&orderDirection=Desc`
  );
  const maps = await loadIdMaps();
  let savedRecords = 0;

  for (const record of records) {
    savedRecords += await saveReturnMovements(record, maps);
  }

  return { totalRecords: records.length, savedRecords };
}

export async function syncTransferMovements(fromDate: Date, toDate: Date): Promise<InventoryMovementSyncStats> {
  const [sentEndpoint, receivedEndpoint] = transferMovementEndpoints(fromDate, toDate);
  const [sentRecords, receivedRecords] = await Promise.all([
    fetchPagedRecords(sentEndpoint),
    fetchPagedRecords(receivedEndpoint)
  ]);
  const records = uniqueRecords([...sentRecords, ...receivedRecords]);
  const maps = await loadIdMaps();
  let savedRecords = 0;

  for (const record of records) {
    savedRecords += await saveTransferMovements(record, maps);
  }

  return { totalRecords: records.length, savedRecords };
}

export function transferMovementEndpoints(fromDate: Date, toDate: Date) {
  const from = encodeURIComponent(fromDate.toISOString());
  const to = encodeURIComponent(toDate.toISOString());
  return [
    `/transfers?fromTransferDate=${from}&toTransferDate=${to}`,
    `/transfers?fromReceivedDate=${from}&toReceivedDate=${to}`
  ] as const;
}

export async function syncInvoiceSaleMovements(fromDate: Date, toDate: Date): Promise<InventoryMovementSyncStats> {
  const invoices = await prisma.invoice.findMany({
    where: {
      purchaseDate: { gte: fromDate, lte: toDate }
    },
    include: { items: true }
  });
  let savedRecords = 0;

  for (const invoice of invoices) {
    const sourceDocumentId = String(invoice.kvInvoiceId);
    const isActive = invoice.status === "Hoàn thành" && Boolean(invoice.branchId);

    await prisma.inventoryMovement.updateMany({
      where: { sourceType: "SALE", sourceDocumentId },
      data: { isActive: false }
    });

    if (!invoice.branchId) {
      continue;
    }

    for (const item of invoice.items) {
      if (!item.productId) {
        continue;
      }

      await prisma.inventoryMovement.upsert({
        where: { movementKey: `SALE:${sourceDocumentId}:${item.id}:${invoice.branchId}` },
        create: {
          movementKey: `SALE:${sourceDocumentId}:${item.id}:${invoice.branchId}`,
          sourceType: "SALE",
          sourceDocumentId,
          sourceLineKey: String(item.id),
          documentCode: invoice.code,
          occurredAt: invoice.purchaseDate,
          productId: item.productId,
          branchId: invoice.branchId,
          quantityDelta: -number(item.quantity),
          status: invoice.status,
          isActive,
          rawJson: item.rawJson
        },
        update: {
          documentCode: invoice.code,
          occurredAt: invoice.purchaseDate,
          productId: item.productId,
          branchId: invoice.branchId,
          quantityDelta: -number(item.quantity),
          status: invoice.status,
          isActive,
          rawJson: item.rawJson
        }
      });
      savedRecords += 1;
    }
  }

  return { totalRecords: invoices.length, savedRecords };
}

async function savePurchaseMovements(record: unknown, maps: IdMaps) {
  const item = asObject(record);
  const documentId = positiveId(item.id);
  const branchId = maps.branchIds.get(positiveId(item.branchId));
  const occurredAt = asDate(item.purchaseDate);
  const details = array(item.purchaseOrderDetails);

  if (!documentId || !branchId || !occurredAt) {
    return 0;
  }

  const sourceDocumentId = String(documentId);
  const isActive = number(item.status) === 3;
  await prisma.inventoryMovement.updateMany({
    where: { sourceType: "PURCHASE", sourceDocumentId },
    data: { isActive: false }
  });

  let saved = 0;
  for (const [index, detail] of details.entries()) {
    const row = asObject(detail);
    const productId = maps.productIds.get(positiveId(row.productId));
    if (!productId) continue;
    const lineKey = String(positiveId(row.id) || `${positiveId(row.productId)}:${index}`);
    const movementKey = `PURCHASE:${sourceDocumentId}:${lineKey}:${branchId}`;

    await upsertMovement({
      movementKey,
      sourceType: "PURCHASE",
      sourceDocumentId,
      sourceLineKey: lineKey,
      documentCode: string(item.code),
      occurredAt,
      productId,
      branchId,
      quantityDelta: number(row.quantity),
      status: string(item.status),
      partnerName: string(item.supplierName) ?? string(item.purchaseName),
      isActive,
      rawJson: JSON.stringify(detail)
    });
    saved += 1;
  }
  return saved;
}

async function saveReturnMovements(record: unknown, maps: IdMaps) {
  const item = asObject(record);
  const documentId = positiveId(item.id);
  const branchId = maps.branchIds.get(positiveId(item.branchId));
  const occurredAt = asDate(item.returnDate);
  const details = array(item.returnDetails);

  if (!documentId || !branchId || !occurredAt) {
    return 0;
  }

  const sourceDocumentId = String(documentId);
  const isActive = number(item.status) === 1;
  await prisma.inventoryMovement.updateMany({
    where: { sourceType: "CUSTOMER_RETURN", sourceDocumentId },
    data: { isActive: false }
  });

  let saved = 0;
  for (const [index, detail] of details.entries()) {
    const row = asObject(detail);
    const productId = maps.productIds.get(positiveId(row.productId));
    if (!productId) continue;
    const lineKey = String(positiveId(row.id) || `${positiveId(row.productId)}:${index}`);
    const movementKey = `CUSTOMER_RETURN:${sourceDocumentId}:${lineKey}:${branchId}`;

    await upsertMovement({
      movementKey,
      sourceType: "CUSTOMER_RETURN",
      sourceDocumentId,
      sourceLineKey: lineKey,
      documentCode: string(item.code),
      occurredAt,
      productId,
      branchId,
      quantityDelta: number(row.quantity),
      status: string(item.statusValue) ?? string(item.status),
      partnerName: string(item.customerName),
      isActive,
      rawJson: JSON.stringify(detail)
    });
    saved += 1;
  }
  return saved;
}

async function saveTransferMovements(record: unknown, maps: IdMaps) {
  const item = asObject(record);
  const documentId = positiveId(item.id);
  const sourceBranchId = maps.branchIds.get(positiveId(item.fromBranchId));
  const destinationBranchId = maps.branchIds.get(positiveId(item.toBranchId));
  const dispatchedAt = asDate(item.dispatchedDate);
  const receivedAt = asDate(item.receivedDate);
  const details = array(item.transferDetails);

  if (!documentId) {
    return 0;
  }

  const sourceDocumentId = String(documentId);
  await prisma.inventoryMovement.updateMany({
    where: { sourceType: { in: ["TRANSFER_OUT", "TRANSFER_IN"] }, sourceDocumentId },
    data: { isActive: false }
  });

  const active = !isCancelledTransfer(item);
  let saved = 0;
  for (const [index, detail] of details.entries()) {
    const row = asObject(detail);
    const productId = maps.productIds.get(positiveId(row.productId));
    if (!productId) continue;
    const lineKey = `${positiveId(row.transferId) || documentId}:${positiveId(row.productId)}:${index}`;

    if (sourceBranchId && dispatchedAt) {
      await upsertMovement({
        movementKey: `TRANSFER_OUT:${sourceDocumentId}:${lineKey}:${sourceBranchId}`,
        sourceType: "TRANSFER_OUT",
        sourceDocumentId,
        sourceLineKey: lineKey,
        documentCode: string(item.code),
        occurredAt: dispatchedAt,
        productId,
        branchId: sourceBranchId,
        quantityDelta: -number(row.sendQuantity),
        status: string(item.status),
        partnerName: destinationBranchId ? `Đến: ${maps.branchNames.get(destinationBranchId) ?? "Kho chưa xác định"}` : undefined,
        isActive: active,
        rawJson: JSON.stringify(detail)
      });
      saved += 1;
    }

    if (destinationBranchId && receivedAt) {
      await upsertMovement({
        movementKey: `TRANSFER_IN:${sourceDocumentId}:${lineKey}:${destinationBranchId}`,
        sourceType: "TRANSFER_IN",
        sourceDocumentId,
        sourceLineKey: lineKey,
        documentCode: string(item.code),
        occurredAt: receivedAt,
        productId,
        branchId: destinationBranchId,
        quantityDelta: number(row.receiveQuantity),
        status: string(item.status),
        partnerName: sourceBranchId ? `Từ: ${maps.branchNames.get(sourceBranchId) ?? "Kho chưa xác định"}` : undefined,
        isActive: active,
        rawJson: JSON.stringify(detail)
      });
      saved += 1;
    }
  }
  return saved;
}

type MovementInput = {
  movementKey: string;
  sourceType: string;
  sourceDocumentId: string;
  sourceLineKey: string;
  documentCode?: string;
  occurredAt: Date;
  productId: number;
  branchId: number;
  quantityDelta: number;
  status?: string;
  partnerName?: string;
  isActive: boolean;
  rawJson: string;
};

async function upsertMovement(input: MovementInput) {
  const { movementKey, ...data } = input;
  await prisma.inventoryMovement.upsert({ where: { movementKey }, create: { movementKey, ...data }, update: data });
}

async function fetchPagedRecords(endpoint: string) {
  const records: unknown[] = [];
  let currentItem = 0;

  while (true) {
    const page = await fetchKiotVietPage(endpoint, currentItem, pageSize);
    records.push(...page.records);
    if (page.records.length < pageSize || currentItem + page.records.length >= page.totalRecords) break;
    currentItem += pageSize;
  }

  return records;
}

async function loadIdMaps(): Promise<IdMaps> {
  const [products, branches] = await Promise.all([
    prisma.product.findMany({ select: { id: true, kvProductId: true } }),
    prisma.branch.findMany({ select: { id: true, kvBranchId: true, name: true } })
  ]);
  return {
    productIds: new Map(products.map((item) => [item.kvProductId, item.id])),
    branchIds: new Map(branches.map((item) => [item.kvBranchId, item.id])),
    branchNames: new Map(branches.map((item) => [item.id, item.name]))
  };
}

export function isCancelledTransfer(item: ObjectRecord) {
  // KiotViet Public API trả `status` dạng số cho phiếu chuyển kho: 4 = đã hủy.
  if (number(item.status) === 4) {
    return true;
  }
  const status = string(item.status)?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() ?? "";
  return status.includes("huy") || status.includes("cancel");
}

function uniqueRecords(records: unknown[]) {
  const byId = new Map<string, unknown>();
  for (const record of records) {
    const id = positiveId(asObject(record).id);
    if (id) byId.set(String(id), record);
  }
  return [...byId.values()];
}

function asObject(value: unknown): ObjectRecord {
  return value && typeof value === "object" ? (value as ObjectRecord) : {};
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function positiveId(value: unknown) {
  const parsed = number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function string(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asDate(value: unknown) {
  return parseKiotVietDate(value);
}
