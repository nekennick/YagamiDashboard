import { Prisma } from "@prisma/client";
import { createWorkbookBuffer, excelResponse } from "@/lib/excel";
import { prisma } from "@/lib/prisma";

const cancelledStatus = "Đã hủy";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const segment = searchParams.get("segment")?.trim() ?? "all";
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
    select: { id: true, code: true, name: true, contactNumber: true }
  });
  const customerIds = customers.map((customer) => customer.id);
  const frequencyGroups = await prisma.invoice.groupBy({
    by: ["customerId"],
    where: {
      status: { not: cancelledStatus },
      customerId: { in: customerIds.length > 0 ? customerIds : [-1] }
    },
    _count: { _all: true },
    _sum: { total: true },
    _min: { purchaseDate: true },
    _max: { purchaseDate: true },
    orderBy: { _count: { customerId: "desc" } }
  });
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const rows = frequencyGroups
    .map((item) => {
      const customer = item.customerId ? customerById.get(item.customerId) : undefined;
      const invoiceCount = item._count._all;
      const activeDays = diffDays(item._min.purchaseDate, item._max.purchaseDate);
      const averageGapDays = invoiceCount > 1 ? activeDays / (invoiceCount - 1) : null;
      const currentSegment = frequencySegment(invoiceCount, averageGapDays);

      return {
        customerCode: customer?.code ?? "",
        customerName: customer?.name ?? "Không rõ khách hàng",
        contactNumber: customer?.contactNumber ?? "",
        invoiceCount,
        revenue: toNumber(item._sum.total),
        firstPurchaseDate: item._min.purchaseDate ? formatDate(item._min.purchaseDate) : "",
        lastPurchaseDate: item._max.purchaseDate ? formatDate(item._max.purchaseDate) : "",
        activeDays,
        averageGapDays: averageGapDays ?? "",
        segmentKey: currentSegment.key,
        segmentLabel: currentSegment.label,
        segmentRank: currentSegment.rank
      };
    })
    .filter((row) => segment === "all" || row.segmentKey === segment)
    .sort((a, b) => a.segmentRank - b.segmentRank || b.invoiceCount - a.invoiceCount || b.revenue - a.revenue);
  const buffer = await createWorkbookBuffer({
    sheetName: "Tan suat khach hang",
    columns: [
      { header: "Mã khách", key: "customerCode", width: 16 },
      { header: "Khách hàng", key: "customerName", width: 32 },
      { header: "Liên hệ", key: "contactNumber", width: 18 },
      { header: "Hóa đơn", key: "invoiceCount", width: 12 },
      { header: "Doanh thu", key: "revenue", width: 16 },
      { header: "Mua đầu", key: "firstPurchaseDate", width: 14 },
      { header: "Mua gần nhất", key: "lastPurchaseDate", width: 16 },
      { header: "Số ngày hoạt động", key: "activeDays", width: 18 },
      { header: "Khoảng cách TB", key: "averageGapDays", width: 18 },
      { header: "Phân nhóm", key: "segmentLabel", width: 20 }
    ],
    rows
  });

  return excelResponse(buffer, `customer-frequency-${formatDateForFilename(new Date())}.xlsx`);
}

function frequencySegment(invoiceCount: number, averageGapDays: number | null) {
  if (invoiceCount >= 20 || (averageGapDays !== null && averageGapDays <= 3)) {
    return { key: "veryFrequent", label: "Rất thường xuyên", rank: 1 };
  }

  if (invoiceCount >= 8 || (averageGapDays !== null && averageGapDays <= 10)) {
    return { key: "frequent", label: "Thường xuyên", rank: 2 };
  }

  if (invoiceCount >= 2) {
    return { key: "occasional", label: "Thỉnh thoảng", rank: 3 };
  }

  return { key: "new", label: "Mới / ít dữ liệu", rank: 4 };
}

function diffDays(from: Date | null, to: Date | null) {
  if (!from || !to) {
    return 0;
  }

  return Math.max(0, (to.getTime() - from.getTime()) / 86_400_000);
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
