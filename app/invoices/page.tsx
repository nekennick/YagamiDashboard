import { Prisma } from "@prisma/client";
import { DatabaseUnavailable, isDatabaseConnectionError } from "@/components/layout/database-unavailable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedPanel, AnimatedTableRow, FadeIn, MotionMetricCard, MotionMetricGrid } from "@/components/ui/motion-primitives";
import { TableSearch } from "@/components/ui/table-search";
import { prisma } from "@/lib/prisma";

type InvoicesPageProps = {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function InvoicesPage({ searchParams }: InvoicesPageProps) {
  const params = (await searchParams) ?? {};
  const query = params.q?.trim() ?? "";
  const status = params.status?.trim() ?? "all";
  const from = params.from?.trim() ?? "";
  const to = params.to?.trim() ?? "";
  const dateFilter = buildDateFilter(from, to);

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
    ...(dateFilter ? { purchaseDate: dateFilter } : {})
  };

  let data;

  try {
    const [invoices, invoiceStats, itemStats, statuses] = await Promise.all([
      prisma.invoice.findMany({
        where: invoiceWhere,
        orderBy: { purchaseDate: "desc" },
        take: 100,
        include: {
          customer: { select: { code: true, name: true } },
          branch: { select: { name: true } },
          _count: { select: { items: true } }
        }
      }),
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
        _count: { _all: true },
        _sum: { quantity: true }
      }),
      prisma.invoice.groupBy({
        by: ["status"],
        _count: { _all: true },
        orderBy: { _count: { status: "desc" } }
      })
    ]);

    data = {
      invoices,
      invoiceStats,
      itemStats,
      statuses
    };
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return <DatabaseUnavailable error={error} />;
    }

    throw error;
  }

  const searchSuggestions = data.invoices.map((invoice) => ({
    label: invoice.code ?? "Không có mã hóa đơn",
    value: invoice.code ?? invoice.customer?.name ?? "",
    meta: `${invoice.customer?.name ?? "Khách lẻ"} · ${invoice.customer?.code ?? "Không có mã khách"}`
  }));

  return (
    <div className="space-y-6">
      <FadeIn className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Hóa đơn</h1>
          <p className="mt-2 text-sm text-slate-600">
            Theo dõi hóa đơn đã đồng bộ từ KiotViet, kèm khách hàng, chi nhánh, trạng thái và tổng tiền.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <a
            className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
            href={`/api/export/invoices?${new URLSearchParams({
              ...(query ? { q: query } : {}),
              ...(status !== "all" ? { status } : {}),
              ...(from ? { from } : {}),
              ...(to ? { to } : {})
            }).toString()}`}
          >
            Xuất Excel
          </a>
          <div className="text-sm text-slate-500">Hiển thị tối đa 100 hóa đơn mới nhất</div>
        </div>
      </FadeIn>

      <MotionMetricGrid className="md:grid-cols-4">
        <MetricCard label="Hóa đơn khớp lọc" value={formatNumber(data.invoiceStats._count._all)} />
        <MetricCard label="Doanh thu" value={formatCurrency(toNumber(data.invoiceStats._sum.total))} />
        <MetricCard label="Dòng hóa đơn" value={formatNumber(data.itemStats._count._all)} />
        <MetricCard label="Số lượng bán" value={formatNumber(toNumber(data.itemStats._sum.quantity))} />
      </MotionMetricGrid>

      <AnimatedPanel className="relative z-20" delay={0.04}>
        <Card className="shadow-sm transition-shadow duration-200 hover:shadow-md">
          <CardHeader>
            <CardTitle>Bộ lọc</CardTitle>
          </CardHeader>
          <CardContent>
          <form className="grid gap-3 xl:grid-cols-[1fr_180px_170px_170px_auto]">
            <TableSearch
              baseParams={{
                ...(status !== "all" ? { status } : {}),
                ...(from ? { from } : {}),
                ...(to ? { to } : {})
              }}
              placeholder="Tìm theo mã hóa đơn hoặc khách hàng"
              suggestions={searchSuggestions}
              value={query}
            />
            <select
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
              defaultValue={status}
              name="status"
            >
              <option value="all">Tất cả trạng thái</option>
              {data.statuses.map((item) => (
                <option key={item.status ?? "empty"} value={item.status ?? ""}>
                  {item.status ?? "Chưa có"} ({item._count._all})
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
          <div className="mt-3 text-xs text-slate-500">
            Khoảng dữ liệu hiện có: {formatDate(data.invoiceStats._min.purchaseDate)} -{" "}
            {formatDate(data.invoiceStats._max.purchaseDate)}
          </div>
          </CardContent>
        </Card>
      </AnimatedPanel>

      <AnimatedPanel className="relative z-10" delay={0.08}>
        <Card className="shadow-sm transition-shadow duration-200 hover:shadow-md">
          <CardHeader>
            <CardTitle>Bảng hóa đơn</CardTitle>
          </CardHeader>
          <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="px-3 py-2 font-medium">STT</th>
                  <th className="px-3 py-2 font-medium">Mã hóa đơn</th>
                  <th className="px-3 py-2 font-medium">Ngày mua</th>
                  <th className="px-3 py-2 font-medium">Khách hàng</th>
                  <th className="px-3 py-2 font-medium">Chi nhánh</th>
                  <th className="px-3 py-2 text-right font-medium">Dòng</th>
                  <th className="px-3 py-2 text-right font-medium">Tổng tiền</th>
                  <th className="px-3 py-2 font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-slate-500" colSpan={8}>
                      Không có hóa đơn phù hợp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  data.invoices.map((invoice, index) => (
                    <AnimatedTableRow
                      key={invoice.id}
                      className="border-b last:border-0"
                      delay={Math.min(index, 12) * 0.015}
                    >
                      <td className="px-3 py-2 text-slate-500">{index + 1}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{invoice.code ?? "-"}</td>
                      <td className="px-3 py-2">{formatDateTime(invoice.purchaseDate)}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{invoice.customer?.name ?? "Khách lẻ"}</div>
                        <div className="mt-1 text-xs text-slate-500">{invoice.customer?.code ?? "Không có mã"}</div>
                      </td>
                      <td className="px-3 py-2">{invoice.branch?.name ?? "-"}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(invoice._count.items)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(toNumber(invoice.total))}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={invoice.status} />
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
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <MotionMetricCard>
      <Card className="h-full shadow-sm transition-shadow duration-200 hover:shadow-md">
        <CardHeader>
          <CardTitle className="text-sm text-slate-600">{label}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{value}</div>
        </CardContent>
      </Card>
    </MotionMetricCard>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const label = status ?? "Chưa có";
  const className =
    label === "Hoàn thành"
      ? "rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"
      : label === "Đã hủy"
        ? "rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700"
        : "rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700";

  return <span className={className}>{label}</span>;
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

function formatDate(date: Date | null) {
  if (!date) {
    return "Chưa có";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
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
