import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  PackageCheck,
  ReceiptText,
  Search,
  TrendingUp,
  UsersRound
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatabaseUnavailable, isDatabaseConnectionError } from "@/components/layout/database-unavailable";
import { AnimatedPanel, AnimatedTableRow, FadeIn, StaggerContainer, StaggerItem } from "@/components/ui/motion-primitives";
import { prisma } from "@/lib/prisma";
import { LowStockTrigger } from "@/components/dashboard/low-stock-trigger";
import { buildDateRange } from "@/lib/date";

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
  const dateRange = buildDateRange(range, from, to) || buildDateRange("30d")!;
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
      hint: "Không tính hóa đơn đã hủy",
      icon: TrendingUp,
      tone: "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20"
    },
    {
      label: "Hóa đơn",
      value: formatNumber(invoiceStats._count._all),
      hint: "Hóa đơn hoàn thành và đang xử lý",
      icon: ReceiptText,
      tone: "bg-indigo-50 text-indigo-600 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:ring-indigo-500/20"
    },
    {
      label: "Khách có mua",
      value: formatNumber(customerGroups.length),
      hint: "Khách hàng có hóa đơn hợp lệ",
      icon: UsersRound,
      tone: "bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20"
    },
    {
      label: "Sản phẩm đã bán",
      value: formatNumber(toNumber(soldQuantity._sum.quantity)),
      hint: "Tổng số lượng trong dòng hóa đơn",
      icon: PackageCheck,
      tone: "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20"
    }
  ];

  return (
    <div className="space-y-6">
      <FadeIn className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-400">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                {formatDate(dateRange.from)} - {formatDate(dateRange.to)}
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-normal text-slate-950 dark:text-white sm:text-4xl">Dashboard</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">
                Dữ liệu thật từ PostgreSQL local, cập nhật theo các lần đồng bộ KiotViet gần nhất.
          </p>
        </div>
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 sm:min-w-[300px]">
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400">Dữ liệu hóa đơn</span>
            <span className="font-medium">{formatDate(invoiceStats._min.purchaseDate)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400">Cập nhật đến</span>
            <span className="font-medium">{formatDate(invoiceStats._max.purchaseDate)}</span>
          </div>
        </div>
      </FadeIn>

      <StaggerContainer className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;

          return (
          <StaggerItem key={kpi.label}>
            <Card className="h-full transition-shadow duration-200 hover:shadow-md">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-500 dark:text-slate-400">{kpi.label}</div>
                    <div className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">{kpi.value}</div>
                  </div>
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ring-1 ${kpi.tone}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                </div>
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{kpi.hint}</p>
              </CardContent>
            </Card>
          </StaggerItem>
          );
        })}
      </StaggerContainer>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <AnimatedPanel delay={0.08}>
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Top sản phẩm bán chạy</CardTitle>
              <div className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">Top 8</div>
            </CardHeader>
            <CardContent className="px-0 pt-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                      <th className="px-3 py-3 font-semibold">STT</th>
                      <th className="px-3 py-3 font-semibold">Sản phẩm</th>
                      <th className="px-3 py-3 text-right font-semibold">Số lượng</th>
                      <th className="px-3 py-3 text-right font-semibold">Doanh thu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.length === 0 ? (
                      <tr>
                        <td className="px-3 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={4}>
                          Không có sản phẩm bán trong kỳ này.
                        </td>
                      </tr>
                    ) : (
                      topProducts.map((item, index) => (
                        <AnimatedTableRow
                          key={`${item.product?.code ?? "unknown"}-${index}`}
                          className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                          delay={index * 0.025}
                        >
                          <td className="px-3 py-3 text-slate-500 dark:text-slate-400">{index + 1}</td>
                          <td className="px-3 py-3">
                            {item.product ? (
                              <Link className="font-medium text-slate-900 underline-offset-2 hover:underline dark:text-white" href={`/products/${item.product.id}`}>
                                {item.product.name}
                              </Link>
                            ) : (
                              <div className="font-medium text-slate-900 dark:text-white">Chưa khớp sản phẩm</div>
                            )}
                            <div className="text-xs text-slate-500 dark:text-slate-400">{item.product?.code ?? "Không có mã"}</div>
                          </td>
                          <td className="px-3 py-3 text-right">{formatNumber(item.quantity)}</td>
                          <td className="px-3 py-3 text-right font-medium text-slate-950 dark:text-white">{formatCurrency(item.revenue)}</td>
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
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Sản phẩm tồn kho thấp</CardTitle>
              <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
            </CardHeader>
            <CardContent className="flex flex-col justify-between h-[calc(100%-72px)]">
              <div className="flex-1">
                {lowInventoryItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    Chưa có dữ liệu tồn kho. Hãy chạy đồng bộ tồn kho trước.
                  </div>
                ) : (
                  <StaggerContainer className="space-y-3">
                    {lowInventoryItems.map((item, index) => (
                      <StaggerItem key={`${item.productId}-${item.branchId}`} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-800">
                        <div className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-950">
                          <div className="flex min-w-0 gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-xs font-semibold text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800">
                              {index + 1}
                            </div>
                            <div className="min-w-0">
                            <div className="font-medium text-slate-900 dark:text-white">{item.product.name}</div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {item.product.code ?? "Không có mã"} · {item.branch.name}
                            </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-base font-semibold">{formatNumber(toNumber(item.onHand))}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">tồn</div>
                          </div>
                        </div>
                      </StaggerItem>
                    ))}
                  </StaggerContainer>
                )}
              </div>
              {lowInventoryItems.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <LowStockTrigger />
                </div>
              )}
            </CardContent>
          </Card>
        </AnimatedPanel>
      </div>

      <AnimatedPanel delay={0.16}>
        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Đồng bộ gần nhất</CardTitle>
            <div className="flex h-11 w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-950 sm:w-[300px]">
              <Search className="h-4 w-4" aria-hidden="true" />
              <span>Search...</span>
            </div>
          </CardHeader>
          <CardContent className="px-0 pt-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                    <th className="px-3 py-3 font-semibold">STT</th>
                    <th className="px-3 py-3 font-semibold">Loại</th>
                    <th className="px-3 py-3 font-semibold">Trạng thái</th>
                    <th className="px-3 py-3 text-right font-semibold">Bản ghi</th>
                    <th className="px-3 py-3 font-semibold">Bắt đầu</th>
                    <th className="px-3 py-3 font-semibold">Kết thúc</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSyncLogs.length === 0 ? (
                    <tr>
                      <td className="px-3 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={6}>
                        Chưa có log đồng bộ.
                      </td>
                    </tr>
                  ) : (
                    recentSyncLogs.map((log, index) => (
                      <AnimatedTableRow
                        key={log.id}
                        className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                        delay={index * 0.025}
                      >
                        <td className="px-3 py-3 text-slate-500 dark:text-slate-400">{index + 1}</td>
                        <td className="px-3 py-3 font-medium text-slate-900 dark:text-white">{syncTypeLabel(log.syncType)}</td>
                        <td className="px-3 py-3">
                          <span className={syncStatusClassName(log.status)}>{syncStatusLabel(log.status)}</span>
                        </td>
                        <td className="px-3 py-3 text-right">{formatNumber(log.totalRecords)}</td>
                        <td className="px-3 py-3">{formatDateTime(log.startedAt)}</td>
                        <td className="px-3 py-3">{formatDateTime(log.finishedAt)}</td>
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
    orders: "Đơn đặt hàng",
    invoices: "Hóa đơn gần đây",
    invoiceHistory: "Lịch sử hóa đơn",
    inventory: "Tồn kho"
  };

  return labels[syncType] ?? syncType;
}
