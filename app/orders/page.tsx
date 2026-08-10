import { Prisma } from "@prisma/client";
import { DatabaseUnavailable, isDatabaseConnectionError } from "@/components/layout/database-unavailable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedPanel, AnimatedTableRow, FadeIn, MotionMetricCard, MotionMetricGrid } from "@/components/ui/motion-primitives";
import { TableSearch } from "@/components/ui/table-search";
import { prisma } from "@/lib/prisma";
import { normalizeWarehouseFilter, warehouseBranchWhere, warehouseFilterOptions, warehouseSelectClassName } from "@/lib/warehouse-filter";

type OrdersPageProps = {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    from?: string;
    to?: string;
    warehouse?: string;
  }>;
};

type UnifiedOrderRow = {
  id: string;
  kind: "temporary" | "completed";
  code: string;
  date: Date;
  customerName: string;
  customerCode: string;
  branchName: string;
  itemCount: number;
  total: number;
  status: string;
};

const temporaryOrderStatus = "Phiếu tạm";
const completedInvoiceStatus = "Hoàn thành";
const ordersPageSize = 50;

export const dynamic = "force-dynamic";

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const params = (await searchParams) ?? {};
  const query = params.q?.trim() ?? "";
  const status = params.status?.trim() ?? "all";
  const from = params.from?.trim() ?? "";
  const to = params.to?.trim() ?? "";
  const warehouse = normalizeWarehouseFilter(params.warehouse);
  const dateFilter = buildDateFilter(from, to);
  const branchWhere = warehouseBranchWhere(warehouse);

  const orderWhere: Prisma.OrderWhereInput = {
    statusValue: temporaryOrderStatus,
    ...(query
      ? {
          OR: [
            { code: { contains: query } },
            { customer: { name: { contains: query } } },
            { customer: { code: { contains: query } } }
          ]
        }
      : {}),
    ...(dateFilter ? { purchaseDate: dateFilter } : {}),
    ...(branchWhere ? { branch: branchWhere } : {})
  };
  const invoiceWhere: Prisma.InvoiceWhereInput = {
    status: completedInvoiceStatus,
    ...(query
      ? {
          OR: [
            { code: { contains: query } },
            { customer: { name: { contains: query } } },
            { customer: { code: { contains: query } } }
          ]
        }
      : {}),
    ...(dateFilter ? { purchaseDate: dateFilter } : {}),
    ...(branchWhere ? { branch: branchWhere } : {})
  };

  try {
    const includeTemporary = status === "all" || status === "temporary";
    const includeCompleted = status === "all" || status === "completed";

    const [orders, invoices, orderStats, invoiceStats, orderItemStats, invoiceItemStats, latestOrderSync] =
      await Promise.all([
        includeTemporary
          ? prisma.order.findMany({
              where: orderWhere,
              orderBy: { purchaseDate: "desc" },
              take: ordersPageSize,
              include: {
                customer: { select: { code: true, name: true } },
                branch: { select: { name: true } },
                _count: { select: { items: true } }
              }
            })
          : Promise.resolve([]),
        includeCompleted
          ? prisma.invoice.findMany({
              where: invoiceWhere,
              orderBy: { purchaseDate: "desc" },
              take: ordersPageSize,
              include: {
                customer: { select: { code: true, name: true } },
                branch: { select: { name: true } },
                _count: { select: { items: true } }
              }
            })
          : Promise.resolve([]),
        includeTemporary
          ? prisma.order.aggregate({
              where: orderWhere,
              _count: { _all: true },
              _sum: { total: true }
            })
          : Promise.resolve({ _count: { _all: 0 }, _sum: { total: null } }),
        includeCompleted
          ? prisma.invoice.aggregate({
              where: invoiceWhere,
              _count: { _all: true },
              _sum: { total: true }
            })
          : Promise.resolve({ _count: { _all: 0 }, _sum: { total: null } }),
        includeTemporary
          ? prisma.orderItem.aggregate({
              where: { order: orderWhere },
              _sum: { quantity: true }
            })
          : Promise.resolve({ _sum: { quantity: null } }),
        includeCompleted
          ? prisma.invoiceItem.aggregate({
              where: { invoice: invoiceWhere },
              _sum: { quantity: true }
            })
          : Promise.resolve({ _sum: { quantity: null } }),
        prisma.appSetting.findUnique({ where: { key: "orderRecentSyncedAt" } })
      ]);

    const rows: UnifiedOrderRow[] = [
      ...orders.map((order) => ({
        id: `order-${order.id}`,
        kind: "temporary" as const,
        code: order.code ?? "-",
        date: order.purchaseDate,
        customerName: order.customer?.name ?? "Khách lẻ",
        customerCode: order.customer?.code ?? "Không có mã",
        branchName: order.branch?.name ?? "-",
        itemCount: order._count.items,
        total: toNumber(order.total),
        status: order.statusValue ?? temporaryOrderStatus
      })),
      ...invoices.map((invoice) => ({
        id: `invoice-${invoice.id}`,
        kind: "completed" as const,
        code: invoice.code ?? "-",
        date: invoice.purchaseDate,
        customerName: invoice.customer?.name ?? "Khách lẻ",
        customerCode: invoice.customer?.code ?? "Không có mã",
        branchName: invoice.branch?.name ?? "-",
        itemCount: invoice._count.items,
        total: toNumber(invoice.total),
        status: invoice.status ?? completedInvoiceStatus
      }))
    ]
      .sort((left, right) => right.date.getTime() - left.date.getTime())
      .slice(0, ordersPageSize);

    const searchSuggestions = rows.map((row) => ({
      label: row.code,
      value: row.code,
      meta: `${row.customerName} · ${row.customerCode}`
    }));

    return (
      <div className="space-y-6">
        <FadeIn className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              Local-first
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 dark:text-white">Đơn hàng</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
              Theo dõi Phiếu tạm từ đơn đặt hàng và Hóa đơn Hoàn thành đã đồng bộ về SQLite local.
            </p>
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Đơn đặt cập nhật: {latestOrderSync?.value ? formatDateTime(new Date(latestOrderSync.value)) : "Chưa đồng bộ"}
          </div>
        </FadeIn>

        <MotionMetricGrid className="md:grid-cols-4">
          <MetricCard label="Phiếu tạm" value={formatNumber(orderStats._count._all)} />
          <MetricCard label="Giá trị phiếu tạm" value={formatCurrency(toNumber(orderStats._sum.total))} />
          <MetricCard label="Hóa đơn hoàn thành" value={formatNumber(invoiceStats._count._all)} />
          <MetricCard
            label="Tổng số lượng"
            value={formatNumber(toNumber(orderItemStats._sum.quantity) + toNumber(invoiceItemStats._sum.quantity))}
          />
        </MotionMetricGrid>

        <AnimatedPanel className="relative z-20" delay={0.04}>
          <Card>
            <CardHeader>
              <CardTitle>Bộ lọc</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3 xl:grid-cols-[1fr_190px_190px_170px_170px_auto]">
                <TableSearch
                  baseParams={{
                    ...(status !== "all" ? { status } : {}),
                    ...(from ? { from } : {}),
                    ...(to ? { to } : {}),
                    ...(warehouse ? { warehouse } : {})
                  }}
                  placeholder="Tìm theo mã phiếu, mã hóa đơn hoặc khách hàng"
                  suggestions={searchSuggestions}
                  value={query}
                />
                <select
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                  defaultValue={status}
                  name="status"
                >
                  <option value="all">Tất cả</option>
                  <option value="temporary">Phiếu tạm</option>
                  <option value="completed">Hoàn thành</option>
                </select>
                <select className={warehouseSelectClassName()} defaultValue={warehouse} name="warehouse">
                  <option value="">Tất cả kho</option>
                  {warehouseFilterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                  defaultValue={from}
                  name="from"
                  type="date"
                />
                <input
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                  defaultValue={to}
                  name="to"
                  type="date"
                />
                <button className="h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800">
                  Lọc
                </button>
              </form>
            </CardContent>
          </Card>
        </AnimatedPanel>

        <AnimatedPanel className="relative z-10" delay={0.08}>
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Bảng đơn hàng</CardTitle>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Hiển thị tối đa 50 dòng mới nhất sau khi gộp Phiếu tạm và Hóa đơn Hoàn thành.
              </p>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1060px] border-collapse text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="px-5 py-4 font-semibold">STT</th>
                      <th className="px-5 py-4 font-semibold">Loại</th>
                      <th className="px-5 py-4 font-semibold">Mã phiếu</th>
                      <th className="px-5 py-4 font-semibold">Ngày</th>
                      <th className="px-5 py-4 font-semibold">Khách hàng</th>
                      <th className="px-5 py-4 font-semibold">Chi nhánh</th>
                      <th className="px-5 py-4 text-right font-semibold">Dòng</th>
                      <th className="px-5 py-4 text-right font-semibold">Tổng tiền</th>
                      <th className="px-5 py-4 font-semibold">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td className="px-5 py-10 text-center text-slate-500 dark:text-slate-400" colSpan={9}>
                          Chưa có đơn hàng phù hợp. Hãy chạy đồng bộ đơn đặt hàng nếu cần xem Phiếu tạm.
                        </td>
                      </tr>
                    ) : (
                      rows.map((row, index) => (
                        <AnimatedTableRow
                          key={row.id}
                          className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                          delay={Math.min(index, 12) * 0.015}
                        >
                          <td className="px-5 py-4 text-slate-500 dark:text-slate-400">{index + 1}</td>
                          <td className="px-5 py-4">
                            <TypeBadge type={row.kind} />
                          </td>
                          <td className="px-5 py-4 font-semibold text-slate-900 dark:text-white">{row.code}</td>
                          <td className="px-5 py-4">{formatDateTime(row.date)}</td>
                          <td className="px-5 py-4">
                            <div className="font-semibold text-slate-900 dark:text-white">{row.customerName}</div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{row.customerCode}</div>
                          </td>
                          <td className="px-5 py-4">{row.branchName}</td>
                          <td className="px-5 py-4 text-right">{formatNumber(row.itemCount)}</td>
                          <td className="px-5 py-4 text-right font-semibold text-slate-900 dark:text-white">
                            {formatCurrency(row.total)}
                          </td>
                          <td className="px-5 py-4">
                            <StatusBadge status={row.status} />
                          </td>
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
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return <DatabaseUnavailable error={error} />;
    }

    throw error;
  }
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <MotionMetricCard>
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-sm text-slate-600 dark:text-slate-400">{label}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold text-slate-950 dark:text-white">{value}</div>
        </CardContent>
      </Card>
    </MotionMetricCard>
  );
}

function TypeBadge({ type }: { type: UnifiedOrderRow["kind"] }) {
  const label = type === "temporary" ? "Đơn đặt" : "Hóa đơn";
  const className =
    type === "temporary"
      ? "rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
      : "rounded-full bg-success-50 px-2.5 py-1 text-xs font-semibold text-success-700 dark:bg-success-950/50 dark:text-success-300";

  return <span className={className}>{label}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === temporaryOrderStatus
      ? "rounded-full bg-warning-50 px-2.5 py-1 text-xs font-semibold text-warning-700 dark:bg-warning-950/50 dark:text-warning-300"
      : "rounded-full bg-success-50 px-2.5 py-1 text-xs font-semibold text-success-700 dark:bg-success-950/50 dark:text-success-300";

  return <span className={className}>{status}</span>;
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

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
