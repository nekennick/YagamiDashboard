import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatabaseUnavailable, isDatabaseConnectionError } from "@/components/layout/database-unavailable";
import { AnimatedPanel, AnimatedTableRow, FadeIn, StaggerContainer, StaggerItem } from "@/components/ui/motion-primitives";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const cancelledStatus = "Đã hủy";

type DashboardPageProps = {
  searchParams?: Promise<{
    range?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = (await searchParams) ?? {};
  const range = params.range?.trim() ?? "30d";
  const from = params.from?.trim() ?? "";
  const to = params.to?.trim() ?? "";
  const dateRange = buildDashboardDateRange(range, from, to);
  const invoiceWhere = {
    status: {
      not: cancelledStatus
    },
    purchaseDate: {
      gte: dateRange.from,
      lte: dateRange.to
    }
  };

  let dashboardData;

  try {
    dashboardData = await Promise.all([
      prisma.invoice.aggregate({
        where: invoiceWhere,
        _count: { _all: true },
        _sum: { total: true },
        _min: { purchaseDate: true },
        _max: { purchaseDate: true }
      }),
      prisma.invoiceItem.aggregate({
        where: {
          invoice: invoiceWhere
        },
        _sum: { quantity: true }
      }),
      prisma.invoice.groupBy({
        by: ["customerId"],
        where: {
          ...invoiceWhere,
          customerId: { not: null }
        }
      }),
      prisma.invoiceItem.groupBy({
        by: ["productId"],
        where: {
          productId: { not: null },
          invoice: invoiceWhere
        },
        _sum: {
          quantity: true,
          subtotal: true
        },
        orderBy: {
          _sum: {
            subtotal: "desc"
          }
        },
        take: 8
      }),
      prisma.inventorySnapshot.aggregate({
        _max: { snapshotDate: true }
      }),
      prisma.syncLog.findMany({
        orderBy: { startedAt: "desc" },
        take: 6
      })
    ]);
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return <DatabaseUnavailable error={error} />;
    }

    throw error;
  }

  const [invoiceStats, soldQuantity, customerGroups, topProductGroups, latestInventoryDate, recentSyncLogs] =
    dashboardData;

  const topProductIds = topProductGroups.flatMap((item) => (item.productId ? [item.productId] : []));
  const [products, lowInventoryItems] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: topProductIds } },
      select: { id: true, code: true, name: true }
    }),
    latestInventoryDate._max.snapshotDate
      ? prisma.inventorySnapshot.findMany({
          where: { snapshotDate: latestInventoryDate._max.snapshotDate },
          include: {
            product: { select: { code: true, name: true } },
            branch: { select: { name: true } }
          },
          orderBy: { onHand: "asc" },
          take: 8
        })
      : []
  ]);

  const productById = new Map(products.map((product) => [product.id, product]));
  const topProducts = topProductGroups.map((item) => ({
    product: item.productId ? productById.get(item.productId) : undefined,
    quantity: toNumber(item._sum.quantity),
    revenue: toNumber(item._sum.subtotal)
  }));

  const kpis = [
    {
      label: "Doanh thu",
      value: formatCurrency(toNumber(invoiceStats._sum.total)),
      hint: "Không tính hóa đơn đã hủy"
    },
    {
      label: "Hóa đơn",
      value: formatNumber(invoiceStats._count._all),
      hint: "Hóa đơn hoàn thành và đang xử lý"
    },
    {
      label: "Khách có mua",
      value: formatNumber(customerGroups.length),
      hint: "Khách hàng có hóa đơn hợp lệ"
    },
    {
      label: "Sản phẩm đã bán",
      value: formatNumber(toNumber(soldQuantity._sum.quantity)),
      hint: "Tổng số lượng trong dòng hóa đơn"
    }
  ];

  return (
    <div className="space-y-6">
      <FadeIn className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Dashboard</h1>
          <p className="mt-2 text-sm text-slate-600">
            Dữ liệu thật từ PostgreSQL local, cập nhật theo các lần đồng bộ KiotViet gần nhất.
          </p>
        </div>
        <div className="text-sm text-slate-500">
          Kỳ đang xem: {formatDate(dateRange.from)} - {formatDate(dateRange.to)}
        </div>
      </FadeIn>

      <AnimatedPanel delay={0.04}>
        <Card className="shadow-sm transition-shadow duration-200 hover:shadow-md">
          <CardHeader>
            <CardTitle>Bộ lọc thời gian</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 xl:grid-cols-[220px_180px_180px_auto]">
              <select
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition-colors focus:border-slate-400"
                defaultValue={range}
                name="range"
              >
                <option value="today">Hôm nay</option>
                <option value="7d">7 ngày</option>
                <option value="30d">30 ngày</option>
                <option value="thisMonth">Tháng này</option>
                <option value="lastMonth">Tháng trước</option>
                <option value="3m">3 tháng</option>
                <option value="6m">6 tháng</option>
                <option value="year">Năm nay</option>
                <option value="custom">Tùy chọn</option>
              </select>
              <input
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition-colors focus:border-slate-400"
                defaultValue={from}
                name="from"
                type="date"
              />
              <input
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition-colors focus:border-slate-400"
                defaultValue={to}
                name="to"
                type="date"
              />
              <button className="h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800">
                Lọc
              </button>
            </form>
            <div className="mt-3 text-xs text-slate-500">
              Dữ liệu hóa đơn hiện có trong kỳ: {formatDate(invoiceStats._min.purchaseDate)} -{" "}
              {formatDate(invoiceStats._max.purchaseDate)}
            </div>
          </CardContent>
        </Card>
      </AnimatedPanel>

      <StaggerContainer className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <StaggerItem key={kpi.label}>
            <Card className="h-full shadow-sm transition-shadow duration-200 hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-sm text-slate-600">{kpi.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{kpi.value}</div>
                <p className="mt-1 text-sm text-slate-500">{kpi.hint}</p>
              </CardContent>
            </Card>
          </StaggerItem>
        ))}
      </StaggerContainer>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <AnimatedPanel delay={0.08}>
          <Card className="h-full shadow-sm transition-shadow duration-200 hover:shadow-md">
            <CardHeader>
              <CardTitle>Top sản phẩm bán chạy</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left">
                      <th className="px-3 py-2 font-medium">Sản phẩm</th>
                      <th className="px-3 py-2 text-right font-medium">Số lượng</th>
                      <th className="px-3 py-2 text-right font-medium">Doanh thu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.length === 0 ? (
                      <tr>
                        <td className="px-3 py-8 text-center text-slate-500" colSpan={3}>
                          Không có sản phẩm bán trong kỳ này.
                        </td>
                      </tr>
                    ) : (
                      topProducts.map((item, index) => (
                        <AnimatedTableRow
                          key={`${item.product?.code ?? "unknown"}-${index}`}
                          className="border-b transition-colors hover:bg-slate-50 last:border-0"
                          delay={index * 0.025}
                        >
                          <td className="px-3 py-2">
                            <div className="font-medium text-slate-900">{item.product?.name ?? "Chưa khớp sản phẩm"}</div>
                            <div className="text-xs text-slate-500">{item.product?.code ?? "Không có mã"}</div>
                          </td>
                          <td className="px-3 py-2 text-right">{formatNumber(item.quantity)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(item.revenue)}</td>
                        </AnimatedTableRow>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </AnimatedPanel>

        <AnimatedPanel delay={0.12}>
          <Card className="h-full shadow-sm transition-shadow duration-200 hover:shadow-md">
            <CardHeader>
              <CardTitle>Sản phẩm tồn kho thấp</CardTitle>
            </CardHeader>
            <CardContent>
              {lowInventoryItems.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                  Chưa có dữ liệu tồn kho. Hãy chạy đồng bộ tồn kho trước.
                </div>
              ) : (
                <StaggerContainer className="space-y-3">
                  {lowInventoryItems.map((item) => (
                    <StaggerItem key={`${item.productId}-${item.branchId}`} className="border-b pb-3 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3 rounded-md transition-colors hover:bg-slate-50">
                        <div>
                          <div className="font-medium text-slate-900">{item.product.name}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {item.product.code ?? "Không có mã"} · {item.branch.name}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-base font-semibold">{formatNumber(toNumber(item.onHand))}</div>
                          <div className="text-xs text-slate-500">tồn</div>
                        </div>
                      </div>
                    </StaggerItem>
                  ))}
                </StaggerContainer>
              )}
            </CardContent>
          </Card>
        </AnimatedPanel>
      </div>

      <AnimatedPanel delay={0.16}>
        <Card className="shadow-sm transition-shadow duration-200 hover:shadow-md">
          <CardHeader>
            <CardTitle>Đồng bộ gần nhất</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left">
                    <th className="px-3 py-2 font-medium">Loại</th>
                    <th className="px-3 py-2 font-medium">Trạng thái</th>
                    <th className="px-3 py-2 text-right font-medium">Bản ghi</th>
                    <th className="px-3 py-2 font-medium">Bắt đầu</th>
                    <th className="px-3 py-2 font-medium">Kết thúc</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSyncLogs.length === 0 ? (
                    <tr>
                      <td className="px-3 py-8 text-center text-slate-500" colSpan={5}>
                        Chưa có log đồng bộ.
                      </td>
                    </tr>
                  ) : (
                    recentSyncLogs.map((log, index) => (
                      <AnimatedTableRow
                        key={log.id}
                        className="border-b transition-colors hover:bg-slate-50 last:border-0"
                        delay={index * 0.025}
                      >
                        <td className="px-3 py-2">{syncTypeLabel(log.syncType)}</td>
                        <td className="px-3 py-2">
                          <span className={syncStatusClassName(log.status)}>{syncStatusLabel(log.status)}</span>
                        </td>
                        <td className="px-3 py-2 text-right">{formatNumber(log.totalRecords)}</td>
                        <td className="px-3 py-2">{formatDateTime(log.startedAt)}</td>
                        <td className="px-3 py-2">{formatDateTime(log.finishedAt)}</td>
                      </AnimatedTableRow>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </AnimatedPanel>
    </div>
  );
}

function buildDashboardDateRange(range: string, from: string, to: string) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  if (range === "custom") {
    return {
      from: from ? startOfDay(new Date(`${from}T00:00:00.000+07:00`)) : addDays(todayStart, -30),
      to: to ? endOfDay(new Date(`${to}T00:00:00.000+07:00`)) : todayEnd
    };
  }

  if (range === "today") {
    return { from: todayStart, to: todayEnd };
  }

  if (range === "7d") {
    return { from: addDays(todayStart, -6), to: todayEnd };
  }

  if (range === "thisMonth") {
    return { from: startOfMonth(now), to: todayEnd };
  }

  if (range === "lastMonth") {
    const lastMonth = addMonths(startOfMonth(now), -1);
    return { from: lastMonth, to: endOfDay(addDays(startOfMonth(now), -1)) };
  }

  if (range === "3m") {
    return { from: addMonths(todayStart, -3), to: todayEnd };
  }

  if (range === "6m") {
    return { from: addMonths(todayStart, -6), to: todayEnd };
  }

  if (range === "year") {
    return { from: new Date(now.getFullYear(), 0, 1), to: todayEnd };
  }

  return { from: addDays(todayStart, -29), to: todayEnd };
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
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

function syncStatusLabel(status: string) {
  if (status === "success") {
    return "Thành công";
  }

  if (status === "running") {
    return "Đang chạy";
  }

  return "Lỗi";
}

function syncStatusClassName(status: string) {
  if (status === "success") {
    return "rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700";
  }

  if (status === "running") {
    return "rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700";
  }

  return "rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value);
}

function formatDate(date: Date | null) {
  if (!date) {
    return "Chưa có dữ liệu";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function formatDateTime(date: Date | null) {
  if (!date) {
    return "Đang chạy";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function syncTypeLabel(syncType: string) {
  const labels: Record<string, string> = {
    branches: "Chi nhánh",
    products: "Sản phẩm",
    customers: "Khách hàng",
    invoices: "Hóa đơn 30 ngày",
    invoiceHistory: "Lịch sử hóa đơn",
    inventory: "Tồn kho"
  };

  return labels[syncType] ?? syncType;
}
