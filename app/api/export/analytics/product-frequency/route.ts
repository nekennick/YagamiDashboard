import { Prisma } from "@prisma/client";
import { createWorkbookBuffer, excelResponse } from "@/lib/excel";
import { prisma } from "@/lib/prisma";
import { normalizeWarehouseFilter, warehouseBranchWhere } from "@/lib/warehouse-filter";

const cancelledStatus = "Đã hủy";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const category = searchParams.get("category")?.trim() ?? "";
  const sort = searchParams.get("sort")?.trim() ?? "revenue";
  const warehouse = normalizeWarehouseFilter(searchParams.get("warehouse"));
  const branchWhere = warehouseBranchWhere(warehouse);
  const productWhere: Prisma.ProductWhereInput = {
    ...(query
      ? {
          OR: [
            { name: { contains: query } },
            { code: { contains: query } },
            { fullName: { contains: query } }
          ]
        }
      : {}),
    ...(category ? { categoryName: category } : {})
  };
  const matchingProducts = await prisma.product.findMany({
    where: productWhere,
    select: { id: true, code: true, name: true, categoryName: true, unit: true }
  });
  const productIds = matchingProducts.map((product) => product.id);
  const productGroups = await prisma.invoiceItem.groupBy({
    by: ["productId"],
    where: {
      productId: { in: productIds.length > 0 ? productIds : [-1] },
      invoice: { status: { not: cancelledStatus }, ...(branchWhere ? { branch: branchWhere } : {}) }
    },
    _count: { _all: true },
    _sum: { quantity: true, subtotal: true }
  });
  const sortedProductGroups = productGroups.sort((a, b) => sortProductGroups(a, b, sort));
  const shownProductIds = sortedProductGroups.flatMap((item) => (item.productId ? [item.productId] : []));
  const [customerCounts, branchGroups] = await Promise.all([
    prisma.invoiceItem.findMany({
      where: {
        productId: { in: shownProductIds },
        invoice: { status: { not: cancelledStatus }, customerId: { not: null }, ...(branchWhere ? { branch: branchWhere } : {}) }
      },
      select: {
        productId: true,
        invoice: { select: { customerId: true } }
      }
    }),
    prisma.invoiceItem.groupBy({
      by: ["productId", "invoiceId"],
      where: {
        productId: { in: shownProductIds },
        invoice: { status: { not: cancelledStatus }, ...(branchWhere ? { branch: branchWhere } : {}) }
      },
      _sum: { subtotal: true }
    })
  ]);
  const invoicesForBranch = await prisma.invoice.findMany({
    where: {
      id: { in: branchGroups.map((item) => item.invoiceId) }
    },
    select: { id: true, branch: { select: { name: true } } }
  });
  const invoiceBranchById = new Map(invoicesForBranch.map((invoice) => [invoice.id, invoice.branch]));
  const customerSetByProduct = new Map<number, Set<number>>();

  for (const item of customerCounts) {
    if (!item.productId || !item.invoice.customerId) {
      continue;
    }

    const set = customerSetByProduct.get(item.productId) ?? new Set<number>();
    set.add(item.invoice.customerId);
    customerSetByProduct.set(item.productId, set);
  }

  const branchRevenueByProduct = new Map<number, Map<string, number>>();

  for (const item of branchGroups) {
    if (!item.productId) {
      continue;
    }

    const branchName = invoiceBranchById.get(item.invoiceId)?.name ?? "Không rõ chi nhánh";
    const branchMap = branchRevenueByProduct.get(item.productId) ?? new Map<string, number>();
    branchMap.set(branchName, (branchMap.get(branchName) ?? 0) + toNumber(item._sum.subtotal));
    branchRevenueByProduct.set(item.productId, branchMap);
  }

  const productById = new Map(matchingProducts.map((product) => [product.id, product]));
  const rows = sortedProductGroups.map((item) => {
    const productId = item.productId ?? 0;
    const branchMap = branchRevenueByProduct.get(productId);
    const bestBranch = branchMap ? [...branchMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] : undefined;
    const product = productById.get(productId);

    return {
      productCode: product?.code ?? "",
      productName: product?.name ?? "Không rõ sản phẩm",
      categoryName: product?.categoryName ?? "",
      unit: product?.unit ?? "",
      quantity: toNumber(item._sum.quantity),
      invoiceAppearances: item._count._all,
      revenue: toNumber(item._sum.subtotal),
      customerCount: customerSetByProduct.get(productId)?.size ?? 0,
      bestBranch: bestBranch ?? ""
    };
  });
  const buffer = await createWorkbookBuffer({
    sheetName: "Tan suat san pham",
    columns: [
      { header: "Mã sản phẩm", key: "productCode", width: 18 },
      { header: "Sản phẩm", key: "productName", width: 36 },
      { header: "Nhóm hàng", key: "categoryName", width: 24 },
      { header: "Đơn vị", key: "unit", width: 12 },
      { header: "Số lượng", key: "quantity", width: 14 },
      { header: "Lượt hóa đơn", key: "invoiceAppearances", width: 16 },
      { header: "Doanh thu", key: "revenue", width: 16 },
      { header: "Khách đã mua", key: "customerCount", width: 16 },
      { header: "Chi nhánh mạnh nhất", key: "bestBranch", width: 24 }
    ],
    rows
  });

  return excelResponse(buffer, `product-frequency-${formatDateForFilename(new Date())}.xlsx`);
}

function sortProductGroups(
  a: {
    _count: { _all: number };
    _sum: { quantity: Prisma.Decimal | null; subtotal: Prisma.Decimal | null };
  },
  b: {
    _count: { _all: number };
    _sum: { quantity: Prisma.Decimal | null; subtotal: Prisma.Decimal | null };
  },
  sort: string
) {
  if (sort === "quantity") {
    return toNumber(b._sum.quantity) - toNumber(a._sum.quantity);
  }

  if (sort === "appearances") {
    return b._count._all - a._count._all;
  }

  return toNumber(b._sum.subtotal) - toNumber(a._sum.subtotal);
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
