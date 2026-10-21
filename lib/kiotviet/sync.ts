import { prisma } from "@/lib/prisma";
import { fetchKiotVietList, fetchKiotVietPage } from "@/lib/kiotviet/client";
import { parseKiotVietDate } from "@/lib/kiotviet/datetime";
import {
  syncInvoiceSaleMovements,
  syncPurchaseMovements,
  syncReturnMovements,
  syncTransferMovements
} from "@/lib/kiotviet/inventory-movements";
import { syncInternalStocktakes } from "@/lib/kiotviet/internal-stocktakes";
import { syncInternalUses } from "@/lib/kiotviet/internal-uses";
import { buildInvoiceItemChanges } from "@/lib/invoice-item-change-audit";

export type SyncType =
  | "products"
  | "customers"
  | "branches"
  | "orders"
  | "invoices"
  | "invoiceHistory"
  | "purchases"
  | "returns"
  | "transfers"
  | "internalUses"
  | "stocktakes"
  | "stocktakeHistory"
  | "inventoryMovementHistory"
  | "inventory"
  | "all";

export type SyncResult = {
  syncType: SyncType;
  status: "success" | "error";
  totalRecords: number;
  savedRecords: number;
  message: string;
  warnings?: string[];
};

type ObjectRecord = Record<string, unknown>;
type SyncStats = {
  totalRecords: number;
  savedRecords: number;
  warnings?: string[];
};

type InvoiceMaps = {
  productIds: Map<number, number>;
  customerIds: Map<number, number>;
  branchIds: Map<number, number>;
};

const invoicePageSize = 50;
const sqliteWriteChunkSize = 100;
const staleRunningLogMinutes = 30;
const recentSyncLookbackDays = 7;
const incrementalBufferDays = 2;
// Re-read a short invoice window so recent cancellations/replacements are
// reflected in the ledger without adding unnecessary API/database load.
const invoiceIncrementalBufferDays = 5;
const syncGlobal = globalThis as typeof globalThis & {
  yagamiKiotVietSyncRunning?: boolean;
};

export async function syncKiotViet(type: SyncType): Promise<SyncResult[]> {
  return withSyncRunLock(() => syncKiotVietUnlocked(type));
}

export async function syncKiotVietBatch(types: Array<Exclude<SyncType, "all">>): Promise<SyncResult[]> {
  return withSyncRunLock(async () => {
    await closeInterruptedRunningLogs();

    const results: SyncResult[] = [];

    for (const syncType of types) {
      results.push(await syncOne(syncType));
    }

    return results;
  });
}

async function withSyncRunLock<T>(action: () => Promise<T>) {
  if (syncGlobal.yagamiKiotVietSyncRunning) {
    throw new Error("Đang có lượt đồng bộ khác chạy. Vui lòng đợi lượt hiện tại hoàn tất để tránh SQLite bị khóa.");
  }

  syncGlobal.yagamiKiotVietSyncRunning = true;

  try {
    return await action();
  } finally {
    syncGlobal.yagamiKiotVietSyncRunning = false;
  }
}

async function syncKiotVietUnlocked(type: SyncType): Promise<SyncResult[]> {
  await closeInterruptedRunningLogs();

  if (type === "all") {
    const results: SyncResult[] = [];

    for (const syncType of ["branches", "products", "customers", "orders", "invoices", "purchases", "returns", "transfers", "internalUses", "stocktakes", "inventory"] as const) {
      results.push(await syncOne(syncType));
    }

    return results;
  }

  return [await syncOne(type)];
}

async function syncOne(type: Exclude<SyncType, "all">): Promise<SyncResult> {
  const log = await withDatabaseRetry("Tạo log đồng bộ", () =>
    prisma.syncLog.create({
      data: {
        syncType: type,
        status: "running"
      }
    })
  );

  try {
    const result = await syncByType(type);
    const warnings = buildSyncWarnings(type, result);

    await withDatabaseRetry("Cập nhật log đồng bộ thành công", () =>
      prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: "success",
          finishedAt: new Date(),
          totalRecords: result.totalRecords,
          errorMessage: warnings.length > 0 ? warnings.join(" ") : null
        }
      })
    );

    return {
      syncType: type,
      status: "success",
      totalRecords: result.totalRecords,
      savedRecords: result.savedRecords,
      message: warnings.length > 0 ? `Đồng bộ hoàn tất. ${warnings.join(" ")}` : "Đồng bộ hoàn tất",
      warnings
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi đồng bộ không xác định";

    try {
      await withDatabaseRetry("Cập nhật log đồng bộ lỗi", () =>
        prisma.syncLog.update({
          where: { id: log.id },
          data: {
            status: "error",
            finishedAt: new Date(),
            errorMessage: message
          }
        })
      );
    } catch (logError) {
      console.error("Không thể cập nhật log đồng bộ lỗi", logError);
    }

    return {
      syncType: type,
      status: "error",
      totalRecords: 0,
      savedRecords: 0,
      message
    };
  }
}

async function syncByType(type: Exclude<SyncType, "all">): Promise<SyncStats> {
  switch (type) {
    case "products":
      return syncProducts();
    case "customers":
      return syncCustomers();
    case "branches":
      return syncBranches();
    case "orders":
      return syncOrders();
    case "invoices":
      return syncInvoices();
    case "invoiceHistory":
      return syncInvoiceHistory();
    case "purchases":
      return syncInventoryMovements("purchases");
    case "returns":
      return syncInventoryMovements("returns");
    case "transfers":
      return syncInventoryMovements("transfers");
    case "internalUses":
      return syncInternalUseDocuments(7);
    case "stocktakes":
      return syncStocktakes(7);
    case "stocktakeHistory":
      return syncStocktakes(90);
    case "inventoryMovementHistory":
      return syncInventoryMovementHistory();
    case "inventory":
      return syncInventory();
  }
}

async function syncStocktakes(lookbackDays: number): Promise<SyncStats> {
  const fromDate = addDays(new Date(), -lookbackDays);
  const result = await syncInternalStocktakes(fromDate);
  return {
    ...result,
    warnings: [
      ...(result.warnings ?? []),
      `Phiếu kiểm kho lấy từ API quản trị KiotViet trong ${lookbackDays} ngày gần nhất.`
    ]
  };
}

async function syncInternalUseDocuments(lookbackDays: number): Promise<SyncStats> {
  const fromDate = addDays(new Date(), -lookbackDays);
  const result = await syncInternalUses(fromDate);
  return {
    ...result,
    warnings: [
      ...(result.warnings ?? []),
      `Phiếu xuất dùng nội bộ lấy từ API quản trị KiotViet trong ${lookbackDays} ngày gần nhất.`
    ]
  };
}

async function syncProducts(): Promise<SyncStats> {
  const records = await fetchKiotVietList("/products");
  let savedRecords = 0;

  for (const record of records) {
    const item = asObject(record);
    const kvProductId = asNumber(item.id);

    if (!kvProductId) {
      continue;
    }

    await withDatabaseRetry(`Ghi sản phẩm ${kvProductId}`, () =>
      prisma.product.upsert({
        where: { kvProductId },
        create: {
          kvProductId,
          code: asString(item.code),
          name: asString(item.name) ?? asString(item.fullName) ?? `Product ${kvProductId}`,
          fullName: asString(item.fullName),
          categoryName: asString(item.categoryName) ?? asNestedString(item.category, "name"),
          basePrice: asNumber(item.basePrice) ?? 0,
          cost: asNumber(item.cost) ?? 0,
          unit: asString(item.unit),
          isActive: asBoolean(item.isActive) ?? true,
          rawJson: JSON.stringify(record)
        },
        update: {
          code: asString(item.code),
          name: asString(item.name) ?? asString(item.fullName) ?? `Product ${kvProductId}`,
          fullName: asString(item.fullName),
          categoryName: asString(item.categoryName) ?? asNestedString(item.category, "name"),
          basePrice: asNumber(item.basePrice) ?? 0,
          cost: asNumber(item.cost) ?? 0,
          unit: asString(item.unit),
          isActive: asBoolean(item.isActive) ?? true,
          rawJson: JSON.stringify(record)
        }
      })
    );
    savedRecords += 1;
  }

  return { totalRecords: records.length, savedRecords };
}

async function syncCustomers(): Promise<SyncStats> {
  const records = await fetchKiotVietList("/customers");
  let savedRecords = 0;

  for (const record of records) {
    const item = asObject(record);
    const kvCustomerId = asNumber(item.id);

    if (!kvCustomerId) {
      continue;
    }

    await withDatabaseRetry(`Ghi khách hàng ${kvCustomerId}`, () =>
      prisma.customer.upsert({
        where: { kvCustomerId },
        create: {
          kvCustomerId,
          code: asString(item.code),
          name: asString(item.name) ?? `Customer ${kvCustomerId}`,
          contactNumber: asString(item.contactNumber),
          address: asString(item.address),
          rawJson: JSON.stringify(record)
        },
        update: {
          code: asString(item.code),
          name: asString(item.name) ?? `Customer ${kvCustomerId}`,
          contactNumber: asString(item.contactNumber),
          address: asString(item.address),
          rawJson: JSON.stringify(record)
        }
      })
    );
    savedRecords += 1;
  }

  return { totalRecords: records.length, savedRecords };
}

async function syncBranches(): Promise<SyncStats> {
  const records = await fetchKiotVietList("/branches");
  let savedRecords = 0;

  for (const record of records) {
    const item = asObject(record);
    const kvBranchId = asNumber(item.id);

    if (!kvBranchId) {
      continue;
    }

    await withDatabaseRetry(`Ghi chi nhánh ${kvBranchId}`, () =>
      prisma.branch.upsert({
        where: { kvBranchId },
        create: {
          kvBranchId,
          name: asString(item.name) ?? asString(item.branchName) ?? `Branch ${kvBranchId}`,
          address: asString(item.address),
          rawJson: JSON.stringify(record)
        },
        update: {
          name: asString(item.name) ?? asString(item.branchName) ?? `Branch ${kvBranchId}`,
          address: asString(item.address),
          rawJson: JSON.stringify(record)
        }
      })
    );
    savedRecords += 1;
  }

  return { totalRecords: records.length, savedRecords };
}

async function syncInvoices(): Promise<SyncStats> {
  const toDate = new Date();
  const fromDate = await getRecentInvoiceFromDate(toDate);
  const result = await syncInvoicesByDateRange(fromDate, toDate);
  const saleResult = await syncInvoiceSaleMovements(fromDate, toDate);
  result.totalRecords += saleResult.totalRecords;
  result.savedRecords += saleResult.savedRecords;

  await setAppSetting("invoiceRecentSyncedAt", toDate.toISOString());

  return {
    ...result,
    warnings: [
      ...(result.warnings ?? []),
      `Hóa đơn tự động chỉ lấy từ ${formatDateTime(fromDate)} đến ${formatDateTime(toDate)} để giảm tải SQLite.`
    ]
  };
}

async function syncInvoiceHistory(): Promise<SyncStats> {
  const recentBoundary = addDays(new Date(), -30);
  const cursorValue = await getAppSetting("invoiceHistoryBeforeDate");
  const toDate = cursorValue ? new Date(cursorValue) : recentBoundary;
  const safeToDate = Number.isNaN(toDate.getTime()) ? recentBoundary : toDate;
  const fromDate = addMonths(safeToDate, -1);
  const result = await syncInvoicesByDateRange(fromDate, safeToDate);

  await setAppSetting("invoiceHistoryBeforeDate", fromDate.toISOString());

  return {
    ...result,
    warnings: [
      ...(result.warnings ?? []),
      "Lịch sử hóa đơn là tác vụ nặng, nên chạy thủ công hoặc chạy thưa hơn lịch tự động."
    ]
  };
}

async function syncInventoryMovements(type: "purchases" | "returns" | "transfers"): Promise<SyncStats> {
  const toDate = new Date();
  const fromDate = await getRecentInventoryMovementFromDate(toDate);
  const result =
    type === "purchases"
      ? await syncPurchaseMovements(fromDate, toDate)
      : type === "returns"
        ? await syncReturnMovements(fromDate)
        : await syncTransferMovements(fromDate, toDate);

  await setAppSetting("inventoryMovementRecentSyncedAt", toDate.toISOString());
  return {
    ...result,
    warnings: [
      ...(result.warnings ?? []),
      `Sổ kho lấy tăng dần từ ${formatDateTime(fromDate)} đến ${formatDateTime(toDate)}, có lùi 3 ngày để bắt chứng từ chỉnh sửa.`
    ]
  };
}

async function syncInventoryMovementHistory(): Promise<SyncStats> {
  const toDate = new Date();
  const fromDate = addDays(toDate, -90);
  const [purchases, returns, transfers, sales] = await Promise.all([
    syncPurchaseMovements(fromDate, toDate),
    syncReturnMovements(fromDate),
    syncTransferMovements(fromDate, toDate),
    syncInvoiceSaleMovements(fromDate, toDate)
  ]);

  return {
    totalRecords: purchases.totalRecords + returns.totalRecords + transfers.totalRecords + sales.totalRecords,
    savedRecords: purchases.savedRecords + returns.savedRecords + transfers.savedRecords + sales.savedRecords,
    warnings: ["Đã đồng bộ sổ kho lịch sử 90 ngày. Các giao dịch cũ hơn không được tự tải lại trong tác vụ này."]
  };
}

async function syncOrders(): Promise<SyncStats> {
  const toDate = new Date();
  const fromDate = await getRecentOrderFromDate(toDate);
  const maps: InvoiceMaps = {
    productIds: await loadProductIds(),
    customerIds: await loadCustomerIds(),
    branchIds: await loadBranchIds()
  };
  let currentItem = 0;
  let totalRecords = 0;
  let savedRecords = 0;
  const endpoint = "/orders?orderBy=createdDate&orderDirection=Desc";

  while (true) {
    const page = await fetchKiotVietPage(endpoint, currentItem, invoicePageSize);
    totalRecords = page.totalRecords;

    if (page.records.length === 0) {
      break;
    }

    let reachedOldRecords = false;

    for (const record of page.records) {
      const item = asObject(record);
      const orderDate = asDate(item.modifiedDate) ?? asDate(item.createdDate) ?? asDate(item.purchaseDate);

      if (orderDate && orderDate < fromDate) {
        reachedOldRecords = true;
        continue;
      }

      const saved = await saveOrder(record, maps);

      if (saved) {
        savedRecords += 1;
      }
    }

    if (reachedOldRecords || page.records.length < invoicePageSize || currentItem + page.records.length >= totalRecords) {
      break;
    }

    currentItem += invoicePageSize;
    await delay(80);
  }

  await setAppSetting("orderRecentSyncedAt", toDate.toISOString());

  return {
    totalRecords,
    savedRecords,
    warnings: [
      `Đơn đặt tự động chỉ lấy từ ${formatDateTime(fromDate)} đến ${formatDateTime(toDate)} để giảm tải SQLite.`,
      ...(totalRecords > savedRecords
        ? [`KiotViet có ${formatNumber(totalRecords)} đơn đặt; hệ thống chỉ cập nhật các đơn trong phạm vi gần đây để giữ SQLite nhẹ.`]
        : [])
    ]
  };
}

async function saveOrder(record: unknown, maps: InvoiceMaps) {
  const item = asObject(record);
  const kvOrderId = asNumber(item.id);

  if (!kvOrderId) {
    return false;
  }

  const customerId = getMappedId(maps.customerIds, asNumber(item.customerId) ?? asNestedNumber(item.customer, "id"));
  const branchId = getMappedId(maps.branchIds, asNumber(item.branchId) ?? asNestedNumber(item.branch, "id"));
  const orderDetails = getArray(item.orderDetails) ?? getArray(item.details) ?? [];

  await withDatabaseRetry(`Ghi đơn đặt ${kvOrderId}`, () =>
    prisma.$transaction(async (tx) => {
      const order = await tx.order.upsert({
        where: { kvOrderId },
        create: {
          kvOrderId,
          code: asString(item.code),
          customerId,
          branchId,
          purchaseDate: asDate(item.purchaseDate) ?? asDate(item.createdDate) ?? new Date(),
          createdDate: asDate(item.createdDate),
          modifiedDate: asDate(item.modifiedDate),
          total: asNumber(item.total) ?? 0,
          totalPayment: asNumber(item.totalPayment) ?? 0,
          discount: asNumber(item.discount) ?? 0,
          status: asNumber(item.status),
          statusValue: asString(item.statusValue),
          description: asString(item.description),
          rawJson: JSON.stringify(record)
        },
        update: {
          code: asString(item.code),
          customerId,
          branchId,
          purchaseDate: asDate(item.purchaseDate) ?? asDate(item.createdDate) ?? new Date(),
          createdDate: asDate(item.createdDate),
          modifiedDate: asDate(item.modifiedDate),
          total: asNumber(item.total) ?? 0,
          totalPayment: asNumber(item.totalPayment) ?? 0,
          discount: asNumber(item.discount) ?? 0,
          status: asNumber(item.status),
          statusValue: asString(item.statusValue),
          description: asString(item.description),
          rawJson: JSON.stringify(record)
        }
      });

      await tx.orderItem.deleteMany({
        where: { orderId: order.id }
      });

      const orderItems = orderDetails.map((detail) => {
        const detailRecord = asObject(detail);
        const quantity = asNumber(detailRecord.quantity) ?? 0;
        const price = asNumber(detailRecord.price) ?? 0;
        const discount = asNumber(detailRecord.discount) ?? 0;

        return {
          orderId: order.id,
          productId: getMappedId(maps.productIds, asNumber(detailRecord.productId) ?? asNestedNumber(detailRecord.product, "id")),
          productCode: asString(detailRecord.productCode),
          productName: asString(detailRecord.productName),
          quantity,
          price,
          discount,
          subtotal: asNumber(detailRecord.subTotal) ?? quantity * price - discount,
          rawJson: JSON.stringify(detail)
        };
      });

      for (const chunk of chunkArray(orderItems, sqliteWriteChunkSize)) {
        if (chunk.length > 0) {
          await tx.orderItem.createMany({
            data: chunk
          });
        }
      }
    })
  );

  return true;
}

async function syncInvoicesByDateRange(fromDate: Date, toDate: Date): Promise<SyncStats> {
  const maps: InvoiceMaps = {
    productIds: await loadProductIds(),
    customerIds: await loadCustomerIds(),
    branchIds: await loadBranchIds()
  };
  let currentItem = 0;
  let totalRecords = 0;
  let savedRecords = 0;
  const endpoint = `/invoices?fromPurchaseDate=${encodeURIComponent(formatKiotVietDate(fromDate))}&toPurchaseDate=${encodeURIComponent(
    formatKiotVietDate(toDate)
  )}&orderBy=purchaseDate&orderDirection=Desc`;

  while (true) {
    const page = await fetchKiotVietPage(endpoint, currentItem, invoicePageSize);
    totalRecords = page.totalRecords;

    for (const record of page.records) {
      const saved = await saveInvoice(record, maps);

      if (saved) {
        savedRecords += 1;
      }
    }

    if (page.records.length < invoicePageSize || currentItem + page.records.length >= totalRecords) {
      break;
    }

    currentItem += invoicePageSize;
    await delay(80);
  }

  return { totalRecords, savedRecords };
}

async function saveInvoice(record: unknown, maps: InvoiceMaps) {
  const item = asObject(record);
  const kvInvoiceId = asNumber(item.id);

  if (!kvInvoiceId) {
    return false;
  }

  const customerId = getMappedId(maps.customerIds, asNumber(item.customerId) ?? asNestedNumber(item.customer, "id"));
  const branchId = getMappedId(maps.branchIds, asNumber(item.branchId) ?? asNestedNumber(item.branch, "id"));
  const invoiceDetails = getArray(item.invoiceDetails) ?? getArray(item.details) ?? [];

  await withDatabaseRetry(`Ghi hóa đơn ${kvInvoiceId}`, () =>
    prisma.$transaction(async (tx) => {
      const previousInvoice = await tx.invoice.findUnique({
        where: { kvInvoiceId },
        include: { items: { select: { productId: true, quantity: true } } }
      });
      const currentStatus = asString(item.status) ?? asString(item.statusValue);
      const currentPurchaseDate = asDate(item.purchaseDate) ?? new Date();
      const invoice = await tx.invoice.upsert({
        where: { kvInvoiceId },
        create: {
          kvInvoiceId,
          code: asString(item.code),
          customerId,
          branchId,
          purchaseDate: currentPurchaseDate,
          total: asNumber(item.total) ?? 0,
          discount: asNumber(item.discount) ?? 0,
          status: currentStatus,
          rawJson: JSON.stringify(record)
        },
        update: {
          code: asString(item.code),
          customerId,
          branchId,
          purchaseDate: currentPurchaseDate,
          total: asNumber(item.total) ?? 0,
          discount: asNumber(item.discount) ?? 0,
          status: currentStatus,
          rawJson: JSON.stringify(record)
        }
      });

      await tx.invoiceItem.deleteMany({
        where: { invoiceId: invoice.id }
      });

      const invoiceItems = invoiceDetails.map((detail) => {
        const detailRecord = asObject(detail);
        const quantity = asNumber(detailRecord.quantity) ?? 0;
        const price = asNumber(detailRecord.price) ?? asNumber(detailRecord.salePrice) ?? 0;
        const discount = asNumber(detailRecord.discount) ?? 0;

        return {
          invoiceId: invoice.id,
          productId: getMappedId(maps.productIds, asNumber(detailRecord.productId) ?? asNestedNumber(detailRecord.product, "id")),
          quantity,
          price,
          discount,
          subtotal: asNumber(detailRecord.subTotal) ?? asNumber(detailRecord.subtotal) ?? quantity * price - discount,
          rawJson: JSON.stringify(detail)
        };
      });

      if (previousInvoice) {
        const changes = buildInvoiceItemChanges({
          previousItems: previousInvoice.items.map((line) => ({
            productId: line.productId,
            quantity: Number(line.quantity)
          })),
          currentItems: invoiceItems.map((line) => ({
            productId: line.productId ?? null,
            quantity: line.quantity
          })),
          previousStatus: previousInvoice.status,
          currentStatus
        });

        if (changes.length > 0) {
          const products = await tx.product.findMany({
            where: { id: { in: changes.map((change) => change.productId) } },
            select: { id: true, code: true, name: true }
          });
          const productById = new Map(products.map((product) => [product.id, product]));

          await tx.invoiceItemChange.createMany({
            data: changes.map((change) => {
              const product = productById.get(change.productId);
              return {
                kvInvoiceId,
                invoiceCode: invoice.code,
                branchId: invoice.branchId,
                purchaseDate: invoice.purchaseDate,
                productId: change.productId,
                productCode: product?.code ?? null,
                productName: product?.name ?? null,
                previousQuantity: change.previousQuantity,
                currentQuantity: change.currentQuantity,
                inventoryDelta: change.inventoryDelta,
                previousStatus: previousInvoice.status,
                currentStatus,
                changeType: change.changeType,
                sourceModifiedAt: asDate(item.modifiedDate),
                rawJson: JSON.stringify({
                  previousStatus: previousInvoice.status,
                  currentStatus,
                  previousQuantity: change.previousQuantity,
                  currentQuantity: change.currentQuantity,
                  inventoryDelta: change.inventoryDelta
                })
              };
            })
          });
        }
      }

      for (const chunk of chunkArray(invoiceItems, sqliteWriteChunkSize)) {
        if (chunk.length > 0) {
          await tx.invoiceItem.createMany({
            data: chunk
          });
        }
      }
    })
  );

  return true;
}

async function syncInventory(): Promise<SyncStats> {
  const records = await fetchKiotVietList("/products?includeInventory=true");
  const snapshotDate = new Date();
  const productIds = await loadProductIds();
  const branchIds = await loadBranchIds();
  const rows = [];

  for (const record of records) {
    const item = asObject(record);
    const kvProductId = asNumber(item.productId) ?? asNumber(item.id);
    const productId = kvProductId ? productIds.get(kvProductId) : undefined;
    const inventories = getArray(item.inventories) ?? getArray(item.inventory) ?? [];

    if (!productId || inventories.length === 0) {
      continue;
    }

    for (const inventory of inventories) {
      const inventoryRecord = asObject(inventory);
      const kvBranchId = asNumber(inventoryRecord.branchId) ?? asNestedNumber(inventoryRecord.branch, "id");
      const branchId = kvBranchId ? branchIds.get(kvBranchId) : undefined;

      if (!branchId) {
        continue;
      }

      rows.push({
        snapshotDate,
        productId,
        branchId,
        onHand: asNumber(inventoryRecord.onHand) ?? 0,
        reserved: asNumber(inventoryRecord.reserved) ?? 0,
        actualReserved: asNumber(inventoryRecord.actualReserved) ?? 0,
        rawJson: JSON.stringify(inventory)
      });
    }
  }

  // Lưu phiên bản vị trí tồn để luồng Kiểm kho có thể phát hiện chính xác
  // sản phẩm đã biến động kể từ lúc nhân viên gửi số kiểm.
  const latestSnapshots = rows.length > 0
    ? await prisma.inventorySnapshot.findMany({
        where: {
          productId: { in: [...new Set(rows.map((row) => row.productId))] },
          branchId: { in: [...new Set(rows.map((row) => row.branchId))] }
        },
        distinct: ["productId", "branchId"],
        orderBy: { snapshotDate: "desc" },
        select: { productId: true, branchId: true, onHand: true }
      })
    : [];
  const previousByPosition = new Map(latestSnapshots.map((row) => [`${row.productId}:${row.branchId}`, Number(row.onHand)]));
  const changedPositions = rows.filter((row) => {
    const previous = previousByPosition.get(`${row.productId}:${row.branchId}`);
    return previous === undefined || Math.abs(previous - Number(row.onHand)) > 0.000001;
  });

  let savedRecords = 0;

  for (const chunk of chunkArray(rows, sqliteWriteChunkSize)) {
    await withDatabaseRetry(`Ghi tồn kho ${savedRecords + 1}-${savedRecords + chunk.length}`, () =>
      prisma.inventorySnapshot.createMany({
        data: chunk
      })
    );
    savedRecords += chunk.length;
    await delay(50);
  }

  for (const row of changedPositions) {
    await prisma.inventoryPositionVersion.upsert({
      where: { productId_branchId: { productId: row.productId, branchId: row.branchId } },
      create: { productId: row.productId, branchId: row.branchId, version: 1, changedAt: snapshotDate },
      update: { version: { increment: 1 }, changedAt: snapshotDate }
    });
  }

  return { totalRecords: records.length, savedRecords };
}

async function loadProductIds() {
  const products = await prisma.product.findMany({ select: { id: true, kvProductId: true } });
  return new Map(products.map((product) => [product.kvProductId, product.id]));
}

async function loadCustomerIds() {
  const customers = await prisma.customer.findMany({ select: { id: true, kvCustomerId: true } });
  return new Map(customers.map((customer) => [customer.kvCustomerId, customer.id]));
}

async function loadBranchIds() {
  const branches = await prisma.branch.findMany({ select: { id: true, kvBranchId: true } });
  return new Map(branches.map((branch) => [branch.kvBranchId, branch.id]));
}

function getMappedId(map: Map<number, number>, externalId: number | undefined) {
  return externalId ? map.get(externalId) : undefined;
}

async function getAppSetting(key: string) {
  const setting = await prisma.appSetting.findUnique({ where: { key } });
  return setting?.value;
}

async function setAppSetting(key: string, value: string) {
  await withDatabaseRetry(`Lưu cấu hình ${key}`, () =>
    prisma.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value }
    })
  );
}

async function getRecentInvoiceFromDate(toDate: Date) {
  const settingDate = parseSettingDate(await getAppSetting("invoiceRecentSyncedAt"));

  if (settingDate) {
    return addDays(settingDate, -invoiceIncrementalBufferDays);
  }

  const latestInvoice = await prisma.invoice.aggregate({
    _max: { purchaseDate: true }
  });

  if (latestInvoice._max.purchaseDate) {
    return addDays(latestInvoice._max.purchaseDate, -invoiceIncrementalBufferDays);
  }

  return addDays(toDate, -recentSyncLookbackDays);
}

async function getRecentOrderFromDate(toDate: Date) {
  const settingDate = parseSettingDate(await getAppSetting("orderRecentSyncedAt"));

  if (settingDate) {
    return addDays(settingDate, -incrementalBufferDays);
  }

  const latestOrder = await prisma.order.aggregate({
    _max: {
      modifiedDate: true,
      createdDate: true,
      purchaseDate: true
    }
  });
  const latestDate = maxDate([
    latestOrder._max.modifiedDate,
    latestOrder._max.createdDate,
    latestOrder._max.purchaseDate
  ]);

  if (latestDate) {
    return addDays(latestDate, -incrementalBufferDays);
  }

  return addDays(toDate, -recentSyncLookbackDays);
}

async function getRecentInventoryMovementFromDate(toDate: Date) {
  const settingDate = parseSettingDate(await getAppSetting("inventoryMovementRecentSyncedAt"));

  if (settingDate) {
    return addDays(settingDate, -3);
  }

  const latestMovement = await prisma.inventoryMovement.aggregate({
    _max: { occurredAt: true }
  });

  if (latestMovement._max.occurredAt) {
    return addDays(latestMovement._max.occurredAt, -3);
  }

  return addDays(toDate, -7);
}

function parseSettingDate(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function maxDate(values: Array<Date | null>) {
  const timestamps = values
    .filter((value): value is Date => value instanceof Date)
    .map((value) => value.getTime());

  if (timestamps.length === 0) {
    return undefined;
  }

  return new Date(Math.max(...timestamps));
}

export async function closeInterruptedRunningLogs() {
  await closeSupersededRunningLogs();
  await closeStaleRunningLogs();
}

async function closeSupersededRunningLogs() {
  const runningLogs = await withDatabaseRetry("Tìm log đồng bộ đang chạy bị thay thế", () =>
    prisma.syncLog.findMany({
      where: { status: "running" },
      select: { id: true, syncType: true, startedAt: true }
    })
  );

  for (const log of runningLogs) {
    const newerFinishedLog = await withDatabaseRetry("Tìm log đồng bộ mới hơn", () =>
      prisma.syncLog.findFirst({
        where: {
          syncType: log.syncType,
          status: { not: "running" },
          startedAt: { gt: log.startedAt },
          finishedAt: { not: null }
        },
        orderBy: { startedAt: "desc" },
        select: { startedAt: true }
      })
    );

    if (!newerFinishedLog) {
      continue;
    }

    await withDatabaseRetry("Đóng log đồng bộ bị thay thế", () =>
      prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: "error",
          finishedAt: newerFinishedLog.startedAt,
          errorMessage: "Lượt đồng bộ này bị ngắt giữa chừng và đã được thay thế bởi một lượt đồng bộ mới hơn."
        }
      })
    );
  }
}

async function closeStaleRunningLogs() {
  const staleStartedBefore = new Date(Date.now() - staleRunningLogMinutes * 60 * 1000);

  await withDatabaseRetry("Đóng log đồng bộ bị kẹt", () =>
    prisma.syncLog.updateMany({
      where: {
        status: "running",
        startedAt: { lt: staleStartedBefore }
      },
      data: {
        status: "error",
        finishedAt: new Date(),
        errorMessage: `Tự động đóng log bị kẹt quá ${staleRunningLogMinutes} phút trước khi chạy lượt đồng bộ mới.`
      }
    })
  );
}

async function withDatabaseRetry<T>(label: string, action: () => Promise<T>, retries = 4): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;

      if (!isRetryableDatabaseError(error) || attempt === retries) {
        break;
      }

      await delay(250 * attempt * attempt);
    }
  }

  const detail = lastError instanceof Error ? lastError.message : "Lỗi database không xác định";
  throw new Error(`${label}: ${detail}`);
}

function isRetryableDatabaseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /socket timeout|database failed to respond|SQLITE_BUSY|database is locked|Timed out/i.test(message);
}

function buildSyncWarnings(type: Exclude<SyncType, "all">, result: SyncStats) {
  const warnings = [...(result.warnings ?? [])];

  if ((type === "invoices" || type === "invoiceHistory") && result.totalRecords >= 1000) {
    warnings.push(
      `Cảnh báo: lượt hóa đơn này có ${formatNumber(result.totalRecords)} bản ghi, SQLite có thể chậm hơn khi webapp đang mở nhiều tab.`
    );
  }

  if (type === "orders" && result.savedRecords >= 100) {
    warnings.push(
      `Cảnh báo: đơn đặt đã cập nhật ${formatNumber(result.savedRecords)} phiếu trong phạm vi gần đây.`
    );
  }

  if (type === "inventory" && result.savedRecords >= 500) {
    warnings.push(
      `Cảnh báo: tồn kho đã ghi ${formatNumber(result.savedRecords)} dòng snapshot, nên để tác vụ này chạy sau cùng.`
    );
  }

  if (type === "products" && result.totalRecords >= 500) {
    warnings.push(`Cảnh báo: danh mục sản phẩm có ${formatNumber(result.totalRecords)} bản ghi, lượt sync có thể mất thêm thời gian.`);
  }

  return warnings;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function formatKiotVietDate(date: Date) {
  return date.toISOString();
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function asObject(value: unknown): ObjectRecord {
  return value && typeof value === "object" ? (value as ObjectRecord) : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }

  return undefined;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function asDate(value: unknown) {
  return parseKiotVietDate(value);
}

function asNestedString(value: unknown, key: string) {
  return asString(asObject(value)[key]);
}

function asNestedNumber(value: unknown, key: string) {
  return asNumber(asObject(value)[key]);
}

function getArray(value: unknown) {
  return Array.isArray(value) ? value : undefined;
}
