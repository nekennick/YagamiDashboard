import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatabaseUnavailable, isDatabaseConnectionError } from "@/components/layout/database-unavailable";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const cancelledStatus = "Đã hủy";

export default async function DashboardPage() {
  const invoiceWhere = {
    status: {
      not: cancelledStatus
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Dashboard</h1>
          <p className="mt-2 text-sm text-slate-600">
            Dữ liệu thật từ SQLite local, cập nhật theo các lần đồng bộ KiotViet gần nhất.
          </p>
        </div>
        <div className="text-sm text-slate-500">
          Dữ liệu hóa đơn: {formatDate(invoiceStats._min.purchaseDate)} - {formatDate(invoiceStats._max.purchaseDate)}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader>
              <CardTitle className="text-sm text-slate-600">{kpi.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{kpi.value}</div>
              <p className="mt-1 text-sm text-slate-500">{kpi.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
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
                  {topProducts.map((item, index) => (
                    <tr key={`${item.product?.code ?? "unknown"}-${index}`} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{item.product?.name ?? "Chưa khớp sản phẩm"}</div>
                        <div className="text-xs text-slate-500">{item.product?.code ?? "Không có mã"}</div>
                      </td>
                      <td className="px-3 py-2 text-right">{formatNumber(item.quantity)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(item.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sản phẩm tồn kho thấp</CardTitle>
          </CardHeader>
          <CardContent>
            {lowInventoryItems.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                Chưa có dữ liệu tồn kho. Hãy chạy đồng bộ tồn kho trước.
              </div>
            ) : (
              <div className="space-y-3">
                {lowInventoryItems.map((item) => (
                  <div key={`${item.productId}-${item.branchId}`} className="border-b pb-3 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
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
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
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
                {recentSyncLogs.map((log) => (
                  <tr key={log.id} className="border-b last:border-0">
                    <td className="px-3 py-2">{syncTypeLabel(log.syncType)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          log.status === "success"
                            ? "rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"
                            : "rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700"
                        }
                      >
                        {log.status === "success" ? "Thành công" : "Lỗi"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{formatNumber(log.totalRecords)}</td>
                    <td className="px-3 py-2">{formatDateTime(log.startedAt)}</td>
                    <td className="px-3 py-2">{formatDateTime(log.finishedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
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
