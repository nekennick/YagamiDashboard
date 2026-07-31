import { Prisma } from "@prisma/client";
import { createWorkbookBuffer, excelResponse } from "@/lib/excel";
import { prisma } from "@/lib/prisma";
import { normalizeWarehouseFilter, warehouseBranchWhere } from "@/lib/warehouse-filter";
import { normalizeInventoryStorage } from "@/lib/inventory-storage";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const warehouse = normalizeWarehouseFilter(searchParams.get("warehouse") ?? searchParams.get("branch"));
  const storage = normalizeInventoryStorage(searchParams.get("storage"));
  const stock = searchParams.get("stock")?.trim() ?? "all";
  const latestInventoryDate = await prisma.inventorySnapshot.aggregate({
    _max: { snapshotDate: true }
  });
  const snapshotDate = latestInventoryDate._max.snapshotDate;
  const branchWhere = warehouseBranchWhere(warehouse);
  const productWhere: Prisma.ProductWhereInput | undefined = query || storage
    ? {
        ...(storage ? { manualGroupAssignment: { is: { group: { storageArea: storage } } } } : {}),
        ...(query
          ? {
              OR: [
                { name: { contains: query } },
                { code: { contains: query } },
                { fullName: { contains: query } }
              ]
            }
          : {})
      }
    : undefined;
  const inventoryWhere: Prisma.InventorySnapshotWhereInput = {
    ...(snapshotDate ? { snapshotDate } : {}),
    ...(branchWhere ? { branch: branchWhere } : {}),
    ...(productWhere ? { product: productWhere } : {}),
    ...stockFilter(stock)
  };
  const items = await prisma.inventorySnapshot.findMany({
    where: inventoryWhere,
    include: {
      product: { select: { code: true, name: true, unit: true, isActive: true, manualGroupAssignment: { select: { group: { select: { name: true, storageArea: true } } } } } },
      branch: { select: { name: true } }
    },
    orderBy: [{ onHand: "asc" }, { product: { name: "asc" } }]
  });
  const rows = items.map((item) => {
    const onHand = toNumber(item.onHand);

    return {
      snapshotDate: snapshotDate ? formatDateTime(snapshotDate) : "",
      productCode: item.product.code ?? "",
      productName: item.product.name,
      groupName: item.product.manualGroupAssignment?.group.name ?? "Chưa phân nhóm",
      storageArea: item.product.manualGroupAssignment?.group.storageArea === "DRY" ? "Kho khô" : item.product.manualGroupAssignment?.group.storageArea === "COLD" ? "Kho đông" : "Chưa xác định",
      unit: item.product.unit ?? "",
      branchName: item.branch.name,
      onHand,
      reserved: toNumber(item.reserved),
      actualReserved: toNumber(item.actualReserved),
      stockStatus: stockStatusLabel(onHand),
      productStatus: item.product.isActive ? "Đang bán" : "Ngừng bán"
    };
  });
  const buffer = await createWorkbookBuffer({
    sheetName: "Ton kho",
    columns: [
      { header: "Snapshot", key: "snapshotDate", width: 20 },
      { header: "Mã sản phẩm", key: "productCode", width: 18 },
      { header: "Sản phẩm", key: "productName", width: 36 },
      { header: "Nhóm hàng", key: "groupName", width: 24 },
      { header: "Khu kho", key: "storageArea", width: 16 },
      { header: "Đơn vị", key: "unit", width: 12 },
      { header: "Chi nhánh", key: "branchName", width: 24 },
      { header: "Tồn", key: "onHand", width: 12 },
      { header: "Đặt giữ", key: "reserved", width: 12 },
      { header: "Giữ thực tế", key: "actualReserved", width: 14 },
      { header: "Tình trạng tồn", key: "stockStatus", width: 16 },
      { header: "Trạng thái SP", key: "productStatus", width: 16 }
    ],
    rows
  });

  return excelResponse(buffer, `inventory-${formatDateForFilename(new Date())}.xlsx`);
}

function stockFilter(stock: string): Prisma.InventorySnapshotWhereInput {
  if (stock === "negative") {
    return { onHand: { lt: 0 } };
  }

  if (stock === "zero") {
    return { onHand: 0 };
  }

  if (stock === "low") {
    return { onHand: { gt: 0, lte: 10 } };
  }

  if (stock === "available") {
    return { onHand: { gt: 0 } };
  }

  return {};
}

function stockStatusLabel(onHand: number) {
  if (onHand < 0) {
    return "Tồn âm";
  }

  if (onHand === 0) {
    return "Hết hàng";
  }

  if (onHand <= 10) {
    return "Tồn thấp";
  }

  return "Còn hàng";
}

function toNumber(value: unknown) {
  if (!value) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value);
  }

  if (typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    return value.toNumber();
  }

  return Number(value);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatDateForFilename(date: Date) {
  return date.toISOString().slice(0, 10);
}
