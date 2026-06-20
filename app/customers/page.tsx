import { Prisma } from "@prisma/client";
import { DatabaseUnavailable, isDatabaseConnectionError } from "@/components/layout/database-unavailable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedPanel, AnimatedTableRow, FadeIn, MotionMetricCard, MotionMetricGrid } from "@/components/ui/motion-primitives";
import { prisma } from "@/lib/prisma";
import { buildDateRange } from "@/lib/date";
import { CustomerFilters } from "@/components/customers/customer-filters";
import { CalendarDays } from "lucide-react";

type CustomersPageProps = {
  searchParams?: Promise<{
    q?: string;
    activity?: string;
    range?: string;
    from?: string;
    to?: string;
  }>;
};

const cancelledStatus = "Đã hủy";

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const params = (await searchParams) ?? {};
  const query = params.q?.trim() ?? "";
  const activity = params.activity?.trim() ?? "all";
  const range = params.range?.trim() ?? "30d";
  const from = params.from?.trim() ?? "";
  const to = params.to?.trim() ?? "";

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

  let data;

  try {
    const matchingCustomers = await prisma.customer.findMany({
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
    const customerIds = matchingCustomers.map((customer) => customer.id);
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
      _max: { purchaseDate: true },
      orderBy: { _sum: { total: "desc" } }
    });
    const statsByCustomer = new Map(stats.map((item) => [item.customerId, item]));
    const rows = matchingCustomers
      .map((customer) => {
        const stat = statsByCustomer.get(customer.id);
        return {
          ...customer,
          invoiceCount: stat?._count._all ?? 0,
          revenue: toNumber(stat?._sum.total),
          lastPurchaseDate: stat?._max.purchaseDate ?? null
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
      .sort((a, b) => b.revenue - a.revenue || b.invoiceCount - a.invoiceCount || a.name.localeCompare(b.name))
      .slice(0, 100);

    data = {
      rows,
      totalCustomers: matchingCustomers.length,
      activeCustomers: stats.length,
      totalRevenue: rows.reduce((sum, customer) => sum + customer.revenue, 0),
      totalInvoices: rows.reduce((sum, customer) => sum + customer.invoiceCount, 0)
    };
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return <DatabaseUnavailable error={error} />;
    }

    throw error;
  }

  const searchSuggestions = data.rows.map((customer) => ({
    label: customer.name,
    value: customer.name,
    meta: `${customer.code ?? "Không có mã"} · ${customer.contactNumber ?? "Không có SĐT"}`
  }));

  return (
    <div className="space-y-6">
      <FadeIn className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-400">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            {dateRange ? `${formatDate(dateRange.from)} - ${formatDate(dateRange.to)}` : "Tất cả thời gian"}
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">Khách hàng</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Theo dõi khách hàng đã đồng bộ từ KiotViet, doanh thu và tần suất mua dựa trên hóa đơn hiện có.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <a
            className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 transition"
            href={`/api/export/customers?${new URLSearchParams({
              ...(query ? { q: query } : {}),
              ...(activity !== "all" ? { activity } : {}),
              ...(range !== "30d" ? { range } : {}),
              ...(from ? { from } : {}),
              ...(to ? { to } : {})
            }).toString()}`}
          >
            Xuất Excel
          </a>
          <div className="text-sm text-slate-500">Hiển thị tối đa 100 khách hàng</div>
        </div>
      </FadeIn>

      <MotionMetricGrid className="md:grid-cols-4">
        <MetricCard label="Khách khớp lọc" value={formatNumber(data.totalCustomers)} />
        <MetricCard label="Có mua" value={formatNumber(data.activeCustomers)} />
        <MetricCard label="Hóa đơn" value={formatNumber(data.totalInvoices)} />
        <MetricCard label="Doanh thu" value={formatCurrency(data.totalRevenue)} />
      </MotionMetricGrid>

      <AnimatedPanel className="relative z-20" delay={0.04}>
        <Card className="shadow-sm transition-shadow duration-200 hover:shadow-md">
          <CardHeader>
            <CardTitle>Bộ lọc</CardTitle>
          </CardHeader>
          <CardContent>
          <CustomerFilters
            initialQuery={query}
            initialActivity={activity}
            initialRange={range}
            initialFrom={from}
            initialTo={to}
            searchSuggestions={searchSuggestions}
          />
          </CardContent>
        </Card>
      </AnimatedPanel>

      <AnimatedPanel className="relative z-10" delay={0.08}>
        <Card className="shadow-sm transition-shadow duration-200 hover:shadow-md">
          <CardHeader>
            <CardTitle>Bảng khách hàng</CardTitle>
          </CardHeader>
          <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="px-3 py-2 font-medium">STT</th>
                  <th className="px-3 py-2 font-medium">Mã</th>
                  <th className="px-3 py-2 font-medium">Khách hàng</th>
                  <th className="px-3 py-2 font-medium">Liên hệ</th>
                  <th className="px-3 py-2 text-right font-medium">Hóa đơn</th>
                  <th className="px-3 py-2 text-right font-medium">Doanh thu</th>
                  <th className="px-3 py-2 font-medium">Lần mua gần nhất</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-slate-500" colSpan={7}>
                      Không có khách hàng phù hợp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  data.rows.map((customer, index) => (
                    <AnimatedTableRow
                      key={customer.id}
                      className="border-b last:border-0"
                      delay={Math.min(index, 12) * 0.015}
                    >
                      <td className="px-3 py-2 text-slate-500">{index + 1}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{customer.code ?? "-"}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{customer.name}</div>
                        <div className="mt-1 text-xs text-slate-500">{customer.address ?? "Chưa có địa chỉ"}</div>
                      </td>
                      <td className="px-3 py-2">{customer.contactNumber ?? "-"}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(customer.invoiceCount)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(customer.revenue)}</td>
                      <td className="px-3 py-2">{formatDate(customer.lastPurchaseDate)}</td>
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
