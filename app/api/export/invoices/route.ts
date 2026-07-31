import { Prisma } from "@prisma/client";
import { createWorkbookBuffer, excelResponse } from "@/lib/excel";
import { prisma } from "@/lib/prisma";
import { normalizeWarehouseFilter, warehouseBranchWhere } from "@/lib/warehouse-filter";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const status = searchParams.get("status")?.trim() ?? "all";
  const from = searchParams.get("from")?.trim() ?? "";
  const to = searchParams.get("to")?.trim() ?? "";
  const warehouse = normalizeWarehouseFilter(searchParams.get("warehouse"));
  const dateFilter = buildDateFilter(from, to);
  const branchWhere = warehouseBranchWhere(warehouse);
  const invoiceWhere: Prisma.InvoiceWhereInput = {
    ...(query
      ? {
          OR: [
            { code: { contains: query } },
            { customer: { name: { contains: query } } },
            { customer: { code: { contains: query } } }
          ]
        }
      : {}),
    ...(status !== "all" ? { status } : {}),
    ...(dateFilter ? { purchaseDate: dateFilter } : {}),
    ...(branchWhere ? { branch: branchWhere } : {})
  };

  const invoices = await prisma.invoice.findMany({
    where: invoiceWhere,
    orderBy: { purchaseDate: "desc" },
    include: {
      customer: { select: { code: true, name: true } },
      branch: { select: { name: true } },
      _count: { select: { items: true } }
    }
  });
  const rows = invoices.map((invoice) => ({
    code: invoice.code ?? "",
    purchaseDate: formatDateTime(invoice.purchaseDate),
    customerName: invoice.customer?.name ?? "Khách lẻ",
    customerCode: invoice.customer?.code ?? "",
    branchName: invoice.branch?.name ?? "",
    itemCount: invoice._count.items,
    total: toNumber(invoice.total),
    discount: toNumber(invoice.discount),
    status: invoice.status ?? ""
  }));
  const buffer = await createWorkbookBuffer({
    sheetName: "Hoa don",
    columns: [
      { header: "Mã hóa đơn", key: "code", width: 18 },
      { header: "Ngày mua", key: "purchaseDate", width: 20 },
      { header: "Khách hàng", key: "customerName", width: 32 },
      { header: "Mã khách", key: "customerCode", width: 16 },
      { header: "Chi nhánh", key: "branchName", width: 24 },
      { header: "Dòng", key: "itemCount", width: 10 },
      { header: "Tổng tiền", key: "total", width: 16 },
      { header: "Giảm giá", key: "discount", width: 16 },
      { header: "Trạng thái", key: "status", width: 16 }
    ],
    rows
  });

  return excelResponse(buffer, `invoices-${formatDateForFilename(new Date())}.xlsx`);
}

function buildDateFilter(from: string, to: string): Prisma.DateTimeFilter | undefined {
  const filter: Prisma.DateTimeFilter = {};

  if (from) {
    filter.gte = new Date(`${from}T00:00:00.000+07:00`);
  }

  if (to) {
    filter.lte = new Date(`${to}T23:59:59.999+07:00`);
  }

  return Object.keys(filter).length > 0 ? filter : undefined;
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
