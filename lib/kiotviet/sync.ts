import { prisma } from "@/lib/prisma";
import { fetchKiotVietList, fetchKiotVietPage } from "@/lib/kiotviet/client";

export type SyncType = "products" | "customers" | "branches" | "invoices" | "invoiceHistory" | "inventory" | "all";

export type SyncResult = {
  syncType: SyncType;
  status: "success" | "error";
  totalRecords: number;
  savedRecords: number;
  message: string;
};

type ObjectRecord = Record<string, unknown>;

export async function syncKiotViet(type: SyncType): Promise<SyncResult[]> {
  if (type === "all") {
    const results: SyncResult[] = [];

    for (const syncType of ["branches", "products", "customers", "invoices", "inventory"] as const) {
      results.push(await syncOne(syncType));
    }

    return results;
  }

  return [await syncOne(type)];
}

async function syncOne(type: Exclude<SyncType, "all">): Promise<SyncResult> {
  const log = await prisma.syncLog.create({
    data: {
      syncType: type,
      status: "running"
    }
  });

  try {
    const result = await syncByType(type);

    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        totalRecords: result.totalRecords
      }
    });

    return {
      syncType: type,
      status: "success",
      totalRecords: result.totalRecords,
      savedRecords: result.savedRecords,
      message: "Đồng bộ hoàn tất"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi đồng bộ không xác định";

    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: "error",
        finishedAt: new Date(),
        errorMessage: message
      }
    });

    return {
      syncType: type,
      status: "error",
      totalRecords: 0,
      savedRecords: 0,
      message
    };
  }
}

async function syncByType(type: Exclude<SyncType, "all">) {
  switch (type) {
    case "products":
      return syncProducts();
    case "customers":
      return syncCustomers();
    case "branches":
      return syncBranches();
    case "invoices":
      return syncInvoices();
    case "invoiceHistory":
      return syncInvoiceHistory();
    case "inventory":
      return syncInventory();
  }
}

async function syncProducts() {
  const records = await fetchKiotVietList("/products");
  let savedRecords = 0;

  for (const record of records) {
    const item = asObject(record);
    const kvProductId = asNumber(item.id);

    if (!kvProductId) {
      continue;
    }

    await prisma.product.upsert({
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
    });
    savedRecords += 1;
  }

  return { totalRecords: records.length, savedRecords };
}

async function syncCustomers() {
  const records = await fetchKiotVietList("/customers");
  let savedRecords = 0;

  for (const record of records) {
    const item = asObject(record);
    const kvCustomerId = asNumber(item.id);

    if (!kvCustomerId) {
      continue;
    }

    await prisma.customer.upsert({
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
    });
    savedRecords += 1;
  }

  return { totalRecords: records.length, savedRecords };
}

async function syncBranches() {
  const records = await fetchKiotVietList("/branches");
  let savedRecords = 0;

  for (const record of records) {
    const item = asObject(record);
    const kvBranchId = asNumber(item.id);

    if (!kvBranchId) {
      continue;
    }

    await prisma.branch.upsert({
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
    });
    savedRecords += 1;
  }

  return { totalRecords: records.length, savedRecords };
}

async function syncInvoices() {
  const toDate = new Date();
  const fromDate = addDays(toDate, -30);
  const result = await syncInvoicesByDateRange(fromDate, toDate);

  await setAppSetting("invoiceRecentSyncedAt", toDate.toISOString());

  return result;
}

async function syncInvoiceHistory() {
  const recentBoundary = addDays(new Date(), -30);
  const cursorValue = await getAppSetting("invoiceHistoryBeforeDate");
  const toDate = cursorValue ? new Date(cursorValue) : recentBoundary;
  const safeToDate = Number.isNaN(toDate.getTime()) ? recentBoundary : toDate;
  const fromDate = addMonths(safeToDate, -1);
  const result = await syncInvoicesByDateRange(fromDate, safeToDate);

  await setAppSetting("invoiceHistoryBeforeDate", fromDate.toISOString());

  return result;
}

async function syncInvoicesByDateRange(fromDate: Date, toDate: Date) {
  const productIds = await loadProductIds();
  const customerIds = await loadCustomerIds();
  const branchIds = await loadBranchIds();
  const pageSize = 50;
  let currentItem = 0;
  let totalRecords = 0;
  let savedRecords = 0;
  const endpoint = `/invoices?fromPurchaseDate=${encodeURIComponent(formatKiotVietDate(fromDate))}&toPurchaseDate=${encodeURIComponent(
    formatKiotVietDate(toDate)
  )}&orderBy=purchaseDate&orderDirection=Desc`;

  while (true) {
    const page = await fetchKiotVietPage(endpoint, currentItem, pageSize);
    totalRecords = page.totalRecords;

    for (const record of page.records) {
      const item = asObject(record);
      const kvInvoiceId = asNumber(item.id);

      if (!kvInvoiceId) {
        continue;
      }

      const customerId = getMappedId(customerIds, asNumber(item.customerId) ?? asNestedNumber(item.customer, "id"));
      const branchId = getMappedId(branchIds, asNumber(item.branchId) ?? asNestedNumber(item.branch, "id"));
      const invoice = await prisma.invoice.upsert({
        where: { kvInvoiceId },
        create: {
          kvInvoiceId,
          code: asString(item.code),
          customerId,
          branchId,
          purchaseDate: asDate(item.purchaseDate) ?? new Date(),
          total: asNumber(item.total) ?? 0,
          discount: asNumber(item.discount) ?? 0,
          status: asString(item.status) ?? asString(item.statusValue),
          rawJson: JSON.stringify(record)
        },
        update: {
          code: asString(item.code),
          customerId,
          branchId,
          purchaseDate: asDate(item.purchaseDate) ?? new Date(),
          total: asNumber(item.total) ?? 0,
          discount: asNumber(item.discount) ?? 0,
          status: asString(item.status) ?? asString(item.statusValue),
          rawJson: JSON.stringify(record)
        }
      });

      await prisma.invoiceItem.deleteMany({
        where: { invoiceId: invoice.id }
      });

      const details = getArray(item.invoiceDetails) ?? getArray(item.details) ?? [];
      const invoiceItems = details.map((detail) => {
        const detailRecord = asObject(detail);
        const quantity = asNumber(detailRecord.quantity) ?? 0;
        const price = asNumber(detailRecord.price) ?? asNumber(detailRecord.salePrice) ?? 0;
        const discount = asNumber(detailRecord.discount) ?? 0;

        return {
          invoiceId: invoice.id,
          productId: getMappedId(productIds, asNumber(detailRecord.productId) ?? asNestedNumber(detailRecord.product, "id")),
          quantity,
          price,
          discount,
          subtotal: asNumber(detailRecord.subTotal) ?? asNumber(detailRecord.subtotal) ?? quantity * price - discount,
          rawJson: JSON.stringify(detail)
        };
      });

      if (invoiceItems.length > 0) {
        await prisma.invoiceItem.createMany({
          data: invoiceItems
        });
      }

      savedRecords += 1;
    }

    if (page.records.length < pageSize || currentItem + page.records.length >= totalRecords) {
      break;
    }

    currentItem += pageSize;
  }

  return { totalRecords, savedRecords };
}

async function syncInventory() {
  const records = await fetchKiotVietList("/products?includeInventory=true");
  const snapshotDate = new Date();
  let savedRecords = 0;

  for (const record of records) {
    const item = asObject(record);
    const product = await findProduct(item);
    const inventories = getArray(item.inventories) ?? getArray(item.inventory) ?? [];

    if (!product || inventories.length === 0) {
      continue;
    }

    for (const inventory of inventories) {
      const inventoryRecord = asObject(inventory);
      const branch = await findBranch(inventoryRecord);

      if (!branch) {
        continue;
      }

      await prisma.inventorySnapshot.create({
        data: {
          snapshotDate,
          productId: product.id,
          branchId: branch.id,
          onHand: asNumber(inventoryRecord.onHand) ?? 0,
          reserved: asNumber(inventoryRecord.reserved) ?? 0,
          actualReserved: asNumber(inventoryRecord.actualReserved) ?? 0,
          rawJson: JSON.stringify(inventory)
        }
      });
      savedRecords += 1;
    }
  }

  return { totalRecords: records.length, savedRecords };
}

async function findProduct(item: ObjectRecord) {
  const kvProductId = asNumber(item.productId) ?? asNumber(item.id);
  return kvProductId ? prisma.product.findUnique({ where: { kvProductId } }) : null;
}

async function findBranch(item: ObjectRecord) {
  const kvBranchId = asNumber(item.branchId) ?? asNestedNumber(item.branch, "id");
  return kvBranchId ? prisma.branch.findUnique({ where: { kvBranchId } }) : null;
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
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value }
  });
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
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
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
