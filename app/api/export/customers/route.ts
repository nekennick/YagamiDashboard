import { Prisma } from "@prisma/client";
import { createWorkbookBuffer, excelResponse } from "@/lib/excel";
import { prisma } from "@/lib/prisma";
import { buildDateRange } from "@/lib/date";

const cancelledStatus = "Đã hủy";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const activity = searchParams.get("activity")?.trim() ?? "all";
  const range = searchParams.get("range")?.trim() ?? "30d";
  const from = searchParams.get("from")?.trim() ?? "";
  const to = searchParams.get("to")?.trim() ?? "";

  const dateRange = buildDateRange(range, from, to);

  const customerWhere: Prisma.CustomerWhereInput = query
    ? {
        OR: [
          { name: { contains: query } },
          { code: { contains: query } },
          { contactNumber: { contains: query } }
        ]
      }
    : {};

  const customers = await prisma.customer.findMany({
    where: customerWhere,
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      contactNumber: true,
      address: true
    }
  });
  const customerIds = customers.map((customer) => customer.id);

  const invoiceWhere: Prisma.InvoiceWhereInput = {
    status: { not: cancelledStatus },
    customerId: { in: customerIds.length > 0 ? customerIds : [-1] }
  };

  if (dateRange) {
    invoiceWhere.purchaseDate = {
      gte: dateRange.from,
      lte: dateRange.to
    };
  }

  const stats = await prisma.invoice.groupBy({
    by: ["customerId"],
    where: invoiceWhere,
    _count: { _all: true },
    _sum: { total: true },
    _max: { purchaseDate: true }
  });
  const statsByCustomer = new Map(stats.map((item) => [item.customerId, item]));
  const rows = customers
    .map((customer) => {
      const stat = statsByCustomer.get(customer.id);

      return {
        code: customer.code ?? "",
        name: customer.name,
        contactNumber: customer.contactNumber ?? "",
        address: customer.address ?? "",
        invoiceCount: stat?._count._all ?? 0,
        revenue: toNumber(stat?._sum.total),
        lastPurchaseDate: stat?._max.purchaseDate ? formatDate(stat._max.purchaseDate) : "",
        activity: stat?._count._all ? "Có mua hàng" : "Chưa có hóa đơn"
      };
    })
    .filter((customer) => {
      if (activity === "active") {
        return customer.invoiceCount > 0;
      }

      if (activity === "inactive") {
        return customer.invoiceCount === 0;
      }

      return true;
    })
    .sort((a, b) => b.revenue - a.revenue || b.invoiceCount - a.invoiceCount || a.name.localeCompare(b.name));

  const buffer = await createWorkbookBuffer({
    sheetName: "Khach hang",
    columns: [
      { header: "Mã", key: "code", width: 16 },
      { header: "Khách hàng", key: "name", width: 32 },
      { header: "Liên hệ", key: "contactNumber", width: 18 },
      { header: "Địa chỉ", key: "address", width: 42 },
      { header: "Hóa đơn", key: "invoiceCount", width: 12 },
      { header: "Doanh thu", key: "revenue", width: 16 },
      { header: "Lần mua gần nhất", key: "lastPurchaseDate", width: 18 },
      { header: "Tình trạng", key: "activity", width: 18 }
    ],
    rows
  });

  return excelResponse(buffer, `customers-${formatDateForFilename(new Date())}.xlsx`);
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

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function formatDateForFilename(date: Date) {
  return date.toISOString().slice(0, 10);
}
