import { Prisma } from "@prisma/client";
import { DatabaseUnavailable, isDatabaseConnectionError } from "@/components/layout/database-unavailable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedPanel, AnimatedTableRow, FadeIn, MotionMetricCard, MotionMetricGrid, StaggerContainer, StaggerItem } from "@/components/ui/motion-primitives";
import { TableSearch } from "@/components/ui/table-search";
import { prisma } from "@/lib/prisma";

type CustomerFrequencyPageProps = {
  searchParams?: Promise<{
    q?: string;
    segment?: string;
  }>;
};

const cancelledStatus = "Đã hủy";

export default async function CustomerFrequencyPage({ searchParams }: CustomerFrequencyPageProps) {
  const params = (await searchParams) ?? {};
  const query = params.q?.trim() ?? "";
  const segment = params.segment?.trim() ?? "all";

  const customerWhere: Prisma.CustomerWhereInput = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { code: { contains: query, mode: "insensitive" } },
          { contactNumber: { contains: query, mode: "insensitive" } }
        ]
      }
    : {};

  let data;

  try {
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
          customer,
          invoiceCount,
          revenue: toNumber(item._sum.total),
          firstPurchaseDate: item._min.purchaseDate,
          lastPurchaseDate: item._max.purchaseDate,
          activeDays,
          averageGapDays,
          segment: currentSegment
        };
      })
      .filter((row) => segment === "all" || row.segment.key === segment)
      .sort((a, b) => a.segment.rank - b.segment.rank || b.invoiceCount - a.invoiceCount || b.revenue - a.revenue)
      .slice(0, 100);

    data = {
      rows,
      totalCustomers: frequencyGroups.length,
      totalInvoices: rows.reduce((sum, row) => sum + row.invoiceCount, 0),
      totalRevenue: rows.reduce((sum, row) => sum + row.revenue, 0),
      veryFrequentCount: rows.filter((row) => row.segment.key === "veryFrequent").length,
      frequentCount: rows.filter((row) => row.segment.key === "frequent").length,
      occasionalCount: rows.filter((row) => row.segment.key === "occasional").length,
      newCount: rows.filter((row) => row.segment.key === "new").length
    };
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return <DatabaseUnavailable error={error} />;
    }

    throw error;
  }

  const searchSuggestions = data.rows.flatMap((row) =>
    row.customer
      ? [
          {
            label: row.customer.name,
            value: row.customer.name,
            meta: `${row.customer.code ?? "Không có mã"} · ${row.customer.contactNumber ?? "Không có SĐT"}`
          }
        ]
      : []
  );

  return (
    <div className="space-y-6">
      <FadeIn className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Phân tích tần suất khách hàng</h1>
          <p className="mt-2 text-sm text-slate-600">
            Xếp hạng khách hàng theo số lần mua, doanh thu và khoảng cách trung bình giữa các lần mua.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <a
            className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
            href={`/api/export/analytics/customer-frequency?${new URLSearchParams({
              ...(query ? { q: query } : {}),
              ...(segment !== "all" ? { segment } : {})
            }).toString()}`}
          >
            Xuất Excel
          </a>
          <div className="text-sm text-slate-500">Hiển thị tối đa 100 khách hàng</div>
        </div>
      </FadeIn>

      <MotionMetricGrid className="md:grid-cols-4">
        <MetricCard label="Khách có mua" value={formatNumber(data.totalCustomers)} />
        <MetricCard label="Hóa đơn trong danh sách" value={formatNumber(data.totalInvoices)} />
        <MetricCard label="Doanh thu trong danh sách" value={formatCurrency(data.totalRevenue)} />
        <MetricCard label="Rất thường xuyên" value={formatNumber(data.veryFrequentCount)} />
      </MotionMetricGrid>

      <AnimatedPanel delay={0.04}>
        <Card className="shadow-sm transition-shadow duration-200 hover:shadow-md">
          <CardHeader>
            <CardTitle>Phân nhóm</CardTitle>
          </CardHeader>
          <CardContent>
            <StaggerContainer className="grid gap-3 sm:grid-cols-4">
            <SegmentBox label="Rất thường xuyên" value={data.veryFrequentCount} tone="emerald" />
            <SegmentBox label="Thường xuyên" value={data.frequentCount} tone="blue" />
            <SegmentBox label="Thỉnh thoảng" value={data.occasionalCount} tone="amber" />
            <SegmentBox label="Mới / ít dữ liệu" value={data.newCount} tone="slate" />
            </StaggerContainer>
          </CardContent>
        </Card>
      </AnimatedPanel>

      <AnimatedPanel delay={0.08}>
        <Card className="shadow-sm transition-shadow duration-200 hover:shadow-md">
          <CardHeader>
            <CardTitle>Bộ lọc</CardTitle>
          </CardHeader>
          <CardContent>
          <form className="grid gap-3 lg:grid-cols-[1fr_240px_auto]">
            <TableSearch
              baseParams={{
                ...(segment !== "all" ? { segment } : {})
              }}
              placeholder="Tìm theo tên, mã hoặc số điện thoại"
              suggestions={searchSuggestions}
              value={query}
            />
            <select
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
              defaultValue={segment}
              name="segment"
            >
              <option value="all">Tất cả phân nhóm</option>
              <option value="veryFrequent">Rất thường xuyên</option>
              <option value="frequent">Thường xuyên</option>
              <option value="occasional">Thỉnh thoảng</option>
              <option value="new">Mới / ít dữ liệu</option>
            </select>
            <button className="h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800">
              Lọc
            </button>
          </form>
          </CardContent>
        </Card>
      </AnimatedPanel>

      <AnimatedPanel delay={0.12}>
        <Card className="shadow-sm transition-shadow duration-200 hover:shadow-md">
          <CardHeader>
            <CardTitle>Bảng tần suất</CardTitle>
          </CardHeader>
          <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="px-3 py-2 font-medium">Khách hàng</th>
                  <th className="px-3 py-2 text-right font-medium">Hóa đơn</th>
                  <th className="px-3 py-2 text-right font-medium">Doanh thu</th>
                  <th className="px-3 py-2 font-medium">Mua đầu</th>
                  <th className="px-3 py-2 font-medium">Mua gần nhất</th>
                  <th className="px-3 py-2 text-right font-medium">Khoảng cách TB</th>
                  <th className="px-3 py-2 font-medium">Phân nhóm</th>
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
                  data.rows.map((row, index) => (
                    <AnimatedTableRow
                      key={row.customer?.id ?? row.customer?.code ?? row.lastPurchaseDate?.toISOString()}
                      className="border-b last:border-0"
                      delay={Math.min(index, 12) * 0.015}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{row.customer?.name ?? "Không rõ khách hàng"}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {row.customer?.code ?? "Không có mã"} · {row.customer?.contactNumber ?? "Không có SĐT"}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">{formatNumber(row.invoiceCount)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.revenue)}</td>
                      <td className="px-3 py-2">{formatDate(row.firstPurchaseDate)}</td>
                      <td className="px-3 py-2">{formatDate(row.lastPurchaseDate)}</td>
                      <td className="px-3 py-2 text-right">
                        {row.averageGapDays === null ? "Chưa đủ" : `${formatNumber(row.averageGapDays)} ngày`}
                      </td>
                      <td className="px-3 py-2">
                        <FrequencyBadge label={row.segment.label} tone={row.segment.tone} />
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

function SegmentBox({ label, value, tone }: { label: string; value: number; tone: "emerald" | "blue" | "amber" | "slate" }) {
  const colors = {
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-800",
    blue: "border-blue-100 bg-blue-50 text-blue-800",
    amber: "border-amber-100 bg-amber-50 text-amber-800",
    slate: "border-slate-200 bg-slate-50 text-slate-700"
  };

  return (
    <StaggerItem>
      <div className={`rounded-md border px-4 py-3 ${colors[tone]}`}>
        <div className="text-sm font-medium">{label}</div>
        <div className="mt-1 text-2xl font-semibold">{formatNumber(value)}</div>
      </div>
    </StaggerItem>
  );
}

function FrequencyBadge({ label, tone }: { label: string; tone: "emerald" | "blue" | "amber" | "slate" }) {
  const colors = {
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-100 text-slate-600"
  };

  return <span className={`rounded-md px-2 py-1 text-xs font-medium ${colors[tone]}`}>{label}</span>;
}

function frequencySegment(invoiceCount: number, averageGapDays: number | null) {
  if (invoiceCount >= 20 || (averageGapDays !== null && averageGapDays <= 3)) {
    return { key: "veryFrequent", label: "Rất thường xuyên", tone: "emerald" as const, rank: 1 };
  }

  if (invoiceCount >= 8 || (averageGapDays !== null && averageGapDays <= 10)) {
    return { key: "frequent", label: "Thường xuyên", tone: "blue" as const, rank: 2 };
  }

  if (invoiceCount >= 2) {
    return { key: "occasional", label: "Thỉnh thoảng", tone: "amber" as const, rank: 3 };
  }

  return { key: "new", label: "Mới / ít dữ liệu", tone: "slate" as const, rank: 4 };
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
