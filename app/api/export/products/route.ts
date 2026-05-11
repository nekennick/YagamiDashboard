import { Prisma } from "@prisma/client";
import { createWorkbookBuffer, excelResponse } from "@/lib/excel";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const category = searchParams.get("category")?.trim() ?? "";
  const status = searchParams.get("status")?.trim() ?? "all";
  const productWhere: Prisma.ProductWhereInput = {
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { fullName: { contains: query, mode: "insensitive" } },
            { code: { contains: query, mode: "insensitive" } }
          ]
        }
      : {}),
    ...(category ? { categoryName: category } : {}),
    ...(status === "active" ? { isActive: true } : {}),
    ...(status === "inactive" ? { isActive: false } : {})
  };
  const latestInventoryDate = await prisma.inventorySnapshot.aggregate({
    _max: { snapshotDate: true }
  });
  const [products, inventoryGroups] = await Promise.all([
    prisma.product.findMany({
      where: productWhere,
      orderBy: [{ isActive: "desc" }, { name: "asc" }]
    }),
    latestInventoryDate._max.snapshotDate
      ? prisma.inventorySnapshot.groupBy({
          by: ["productId"],
          where: { snapshotDate: latestInventoryDate._max.snapshotDate },
          _sum: { onHand: true, reserved: true }
        })
      : []
  ]);
  const inventoryByProduct = new Map(
    inventoryGroups.map((item) => [
      item.productId,
      {
        onHand: toNumber(item._sum.onHand),
        reserved: toNumber(item._sum.reserved)
      }
    ])
  );
  const rows = products.map((product) => {
    const inventory = inventoryByProduct.get(product.id);

    return {
      code: product.code ?? "",
      name: product.name,
      fullName: product.fullName ?? "",
      categoryName: product.categoryName ?? "",
      unit: product.unit ?? "",
      basePrice: toNumber(product.basePrice),
      onHand: inventory?.onHand ?? 0,
      reserved: inventory?.reserved ?? 0,
      status: product.isActive ? "Đang bán" : "Ngừng bán"
    };
  });
  const buffer = await createWorkbookBuffer({
    sheetName: "San pham",
    columns: [
      { header: "Mã", key: "code", width: 16 },
      { header: "Tên sản phẩm", key: "name", width: 36 },
      { header: "Tên đầy đủ", key: "fullName", width: 42 },
      { header: "Nhóm hàng", key: "categoryName", width: 24 },
      { header: "Đơn vị", key: "unit", width: 12 },
      { header: "Giá bán", key: "basePrice", width: 14 },
      { header: "Tồn", key: "onHand", width: 12 },
      { header: "Đặt giữ", key: "reserved", width: 12 },
      { header: "Trạng thái", key: "status", width: 14 }
    ],
    rows
  });

  return excelResponse(buffer, `products-${formatDateForFilename(new Date())}.xlsx`);
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

function formatDateForFilename(date: Date) {
  return date.toISOString().slice(0, 10);
}
