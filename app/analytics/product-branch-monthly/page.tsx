import Link from "next/link";
import { DatabaseUnavailable, isDatabaseConnectionError } from "@/components/layout/database-unavailable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedPanel, AnimatedTableRow, FadeIn, MotionMetricCard, MotionMetricGrid } from "@/components/ui/motion-primitives";
import { TableSearch } from "@/components/ui/table-search";
import {
  formatMonthLabel,
  getProductBranchMonthlyRows,
  parseMonthRange,
  type ProductBranchMonthlyRow
} from "@/lib/analytics/product-branch-monthly";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type ProductBranchMonthlyPageProps = {
  searchParams?: Promise<{
    fromMonth?: string;
    toMonth?: string;
    branch?: string;
    category?: string;
    q?: string;
  }>;
};

type PivotRow = {
  key: string;
  month: Date;
  productId: number;
  productCode: string | null;
  productName: string;
  categoryName: string | null;
  unit: string | null;
  branchQuantities: Map<number, number>;
  totalQuantity: number;
  totalRevenue: number;
  invoiceCount: number;
};

export default async function ProductBranchMonthlyPage({ searchParams }: ProductBranchMonthlyPageProps) {
  const params = (await searchParams) ?? {};
  const query = params.q?.trim() ?? "";
  const category = params.category?.trim() ?? "";
  const branch = params.branch?.trim() ?? "";
  const branchId = branch ? Number(branch) : undefined;
  const monthRange = parseMonthRange(params.fromMonth?.trim() ?? "", params.toMonth?.trim() ?? "");

  try {
    const [branches, categories, rows] = await Promise.all([
      prisma.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.product.groupBy({
        by: ["categoryName"],
        _count: { _all: true },
        orderBy: { _count: { categoryName: "desc" } }
      }),
      getProductBranchMonthlyRows({
        fromDate: monthRange.fromDate,
        toDate: monthRange.toDate,
        branchId,
        category,
        query,
        limit: 1500
      })
    ]);
    const visibleBranches = branchId ? branches.filter((item) => item.id === branchId) : branches;
    const pivotRows = buildPivotRows(rows)
      .sort((a, b) => b.month.getTime() - a.month.getTime() || b.totalQuantity - a.totalQuantity)
      .slice(0, 160);
    const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);
    const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    const soldProductCount = new Set(rows.map((row) => row.productId)).size;
    const strongestBranch = getStrongestBranch(rows);
    const searchSuggestions = pivotRows.map((row) => ({
      label: row.productName,
      value: row.productName,
      meta: `${row.productCode ?? "Không có mã"} · ${row.categoryName ?? "Chưa phân nhóm"}`
    }));

    return (
      <div className="space-y-6">
        <FadeIn className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Sản phẩm theo chi nhánh/tháng</h1>
            <p className="mt-2 text-sm text-slate-600">
              Theo dõi tổng lượng sản phẩm bán ra theo từng tháng và từng chi nhánh.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <a
              className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
              href={`/api/export/analytics/product-branch-monthly?${new URLSearchParams({
                fromMonth: monthRange.fromMonthValue,
                toMonth: monthRange.toMonthValue,
                ...(query ? { q: query } : {}),
                ...(branch ? { branch } : {}),
                ...(category ? { category } : {})
              }).toString()}`}
            >
              Xuất Excel
            </a>
            <div className="text-sm text-slate-500">
              Kỳ: {formatMonthLabel(monthRange.fromDate)} - {formatMonthLabel(addMonths(monthRange.toDate, -1))}
            </div>
          </div>
        </FadeIn>

        <MotionMetricGrid className="md:grid-cols-4">
          <MetricCard label="Tổng số lượng" value={formatNumber(totalQuantity)} />
          <MetricCard label="Doanh thu" value={formatCurrency(totalRevenue)} />
          <MetricCard label="Sản phẩm có bán" value={formatNumber(soldProductCount)} />
          <MetricCard label="Chi nhánh mạnh nhất" value={strongestBranch} />
        </MotionMetricGrid>

        <AnimatedPanel delay={0.04}>
          <Card className="shadow-sm transition-shadow duration-200 hover:shadow-md">
            <CardHeader>
              <CardTitle>Bộ lọc</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3 xl:grid-cols-[1fr_170px_170px_220px_220px_auto]">
                <TableSearch
                  baseParams={{
                    fromMonth: monthRange.fromMonthValue,
                    toMonth: monthRange.toMonthValue,
                    ...(branch ? { branch } : {}),
                    ...(category ? { category } : {})
                  }}
                  placeholder="Tìm theo tên hoặc mã sản phẩm"
                  suggestions={searchSuggestions}
                  value={query}
                />
                <input
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                  defaultValue={monthRange.fromMonthValue}
                  name="fromMonth"
                  type="month"
                />
                <input
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                  defaultValue={monthRange.toMonthValue}
                  name="toMonth"
                  type="month"
                />
                <select
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                  defaultValue={branch}
                  name="branch"
                >
                  <option value="">Tất cả chi nhánh</option>
                  {branches.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <select
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                  defaultValue={category}
                  name="category"
                >
                  <option value="">Tất cả nhóm hàng</option>
                  {categories.map((item) => (
                    <option key={item.categoryName ?? "empty"} value={item.categoryName ?? ""}>
                      {item.categoryName ?? "Chưa phân nhóm"} ({item._count._all})
                    </option>
                  ))}
                </select>
                <button className="h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800">
                  Lọc
                </button>
              </form>
            </CardContent>
          </Card>
        </AnimatedPanel>

        <AnimatedPanel delay={0.08}>
          <Card className="shadow-sm transition-shadow duration-200 hover:shadow-md">
            <CardHeader>
              <CardTitle>Bảng sản lượng theo chi nhánh</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left">
                      <th className="px-3 py-2 font-medium">Tháng</th>
                      <th className="px-3 py-2 font-medium">Sản phẩm</th>
                      <th className="px-3 py-2 font-medium">Nhóm hàng</th>
                      {visibleBranches.map((item) => (
                        <th key={item.id} className="px-3 py-2 text-right font-medium">
                          {item.name}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right font-medium">Tổng SL</th>
                      <th className="px-3 py-2 text-right font-medium">Doanh thu</th>
                      <th className="px-3 py-2 text-right font-medium">Hóa đơn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pivotRows.length === 0 ? (
                      <tr>
                        <td className="px-3 py-8 text-center text-slate-500" colSpan={visibleBranches.length + 6}>
                          Không có dữ liệu bán ra phù hợp với bộ lọc.
                        </td>
                      </tr>
                    ) : (
                      pivotRows.map((row, index) => (
                        <AnimatedTableRow key={row.key} className="border-b last:border-0" delay={Math.min(index, 12) * 0.015}>
                          <td className="px-3 py-2">{formatMonthLabel(row.month)}</td>
                          <td className="px-3 py-2">
                            <Link className="font-medium text-slate-900 underline-offset-2 hover:underline" href={`/products/${row.productId}`}>
                              {row.productName}
                            </Link>
                            <div className="mt-1 text-xs text-slate-500">
                              {row.productCode ?? "Không có mã"} · {row.unit ?? "Chưa có đơn vị"}
                            </div>
                          </td>
                          <td className="px-3 py-2">{row.categoryName ?? "Chưa phân nhóm"}</td>
                          {visibleBranches.map((item) => (
                            <td key={item.id} className="px-3 py-2 text-right">
                              {formatNumber(row.branchQuantities.get(item.id) ?? 0)}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right font-medium">{formatNumber(row.totalQuantity)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(row.totalRevenue)}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(row.invoiceCount)}</td>
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

function buildPivotRows(rows: ProductBranchMonthlyRow[]) {
  const map = new Map<string, PivotRow>();

  for (const row of rows) {
    const key = `${row.month.toISOString()}-${row.productId}`;
    const current =
      map.get(key) ??
      ({
        key,
        month: row.month,
        productId: row.productId,
        productCode: row.productCode,
        productName: row.productName,
        categoryName: row.categoryName,
        unit: row.unit,
        branchQuantities: new Map<number, number>(),
        totalQuantity: 0,
        totalRevenue: 0,
        invoiceCount: 0
      } satisfies PivotRow);

    if (row.branchId) {
      current.branchQuantities.set(row.branchId, (current.branchQuantities.get(row.branchId) ?? 0) + row.quantity);
    }

    current.totalQuantity += row.quantity;
    current.totalRevenue += row.revenue;
    current.invoiceCount += row.invoiceCount;
    map.set(key, current);
  }

  return [...map.values()];
}

function getStrongestBranch(rows: ProductBranchMonthlyRow[]) {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const branchName = row.branchName ?? "Không rõ chi nhánh";
    totals.set(branchName, (totals.get(branchName) ?? 0) + row.quantity);
  }

  return [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Chưa có";
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

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
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
