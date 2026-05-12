import Link from "next/link";
import { notFound } from "next/navigation";
import { DatabaseUnavailable, isDatabaseConnectionError } from "@/components/layout/database-unavailable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedPanel, AnimatedTableRow, FadeIn, MotionMetricCard, MotionMetricGrid } from "@/components/ui/motion-primitives";
import {
  formatMonthLabel,
  getProductBranchMonthlyRows,
  parseMonthRange,
  toNumber
} from "@/lib/analytics/product-branch-monthly";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type ProductDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    fromMonth?: string;
    toMonth?: string;
    invoiceMonth?: string;
    invoiceBranch?: string;
    invoiceQ?: string;
  }>;
};

const cancelledStatus = "Đã hủy";

export default async function ProductDetailPage({ params, searchParams }: ProductDetailPageProps) {
  const { id } = await params;
  const productId = Number(id);

  if (!Number.isInteger(productId)) {
    notFound();
  }

  const query = (await searchParams) ?? {};
  const monthRange = parseMonthRange(query.fromMonth?.trim() ?? "", query.toMonth?.trim() ?? "");
  const invoiceMonth = query.invoiceMonth?.trim() ?? "";
  const invoiceBranch = query.invoiceBranch?.trim() ?? "";
  const invoiceBranchId = invoiceBranch ? Number(invoiceBranch) : undefined;
  const invoiceKeyword = query.invoiceQ?.trim() ?? "";
  const invoiceTableRange = invoiceMonth ? parseMonthRange(invoiceMonth, invoiceMonth) : monthRange;

  try {
    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!product) {
      notFound();
    }

    const latestInventoryDate = await prisma.inventorySnapshot.aggregate({
      _max: { snapshotDate: true }
    });
    const relatedInvoiceWhere = {
      status: { not: cancelledStatus },
      purchaseDate: {
        gte: invoiceTableRange.fromDate,
        lt: invoiceTableRange.toDate
      },
      ...(invoiceBranchId ? { branchId: invoiceBranchId } : {}),
      ...(invoiceKeyword
        ? {
            OR: [
              { code: { contains: invoiceKeyword, mode: "insensitive" as const } },
              { customer: { name: { contains: invoiceKeyword, mode: "insensitive" as const } } },
              { customer: { code: { contains: invoiceKeyword, mode: "insensitive" as const } } }
            ]
          }
        : {})
    };

    const [branches, salesRows, periodInvoiceCustomers, relatedItems, inventoryRows] = await Promise.all([
      prisma.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      getProductBranchMonthlyRows({
        productId,
        fromDate: monthRange.fromDate,
        toDate: monthRange.toDate,
        limit: 600
      }),
      prisma.invoice.findMany({
        where: {
          status: { not: cancelledStatus },
          purchaseDate: {
            gte: monthRange.fromDate,
            lt: monthRange.toDate
          },
          items: { some: { productId } }
        },
        select: {
          id: true,
          customerId: true
        }
      }),
      prisma.invoiceItem.findMany({
        where: {
          productId,
          invoice: relatedInvoiceWhere
        },
        orderBy: { invoice: { purchaseDate: "desc" } },
        take: 120,
        include: {
          invoice: {
            select: {
              id: true,
              code: true,
              purchaseDate: true,
              total: true,
              customer: { select: { id: true, code: true, name: true } },
              branch: { select: { id: true, name: true } }
            }
          }
        }
      }),
      latestInventoryDate._max.snapshotDate
        ? prisma.inventorySnapshot.findMany({
            where: {
              productId,
              snapshotDate: latestInventoryDate._max.snapshotDate
            },
            include: { branch: { select: { id: true, name: true } } },
            orderBy: { branch: { name: "asc" } }
          })
        : []
    ]);
    const branchSummary = summarizeByBranch(salesRows);
    const monthSummary = summarizeByMonth(salesRows);
    const relatedBranchSummary = summarizeInvoiceItemsByBranch(relatedItems);
    const totalQuantity = salesRows.reduce((sum, row) => sum + row.quantity, 0);
    const totalRevenue = salesRows.reduce((sum, row) => sum + row.revenue, 0);
    const invoiceCount = new Set(periodInvoiceCustomers.map((item) => item.id)).size;
    const customerCount = new Set(periodInvoiceCustomers.flatMap((item) => (item.customerId ? [item.customerId] : []))).size;

    return (
      <div className="space-y-6">
        <FadeIn className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm text-slate-500">{product.code ?? "Không có mã"}</div>
            <h1 className="text-2xl font-semibold tracking-normal">{product.name}</h1>
            <p className="mt-2 text-sm text-slate-600">
              Hồ sơ sản phẩm: doanh số theo tháng, chi nhánh, hóa đơn liên quan và tồn kho hiện tại.
            </p>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 hover:bg-slate-50"
            href="/analytics/product-branch-monthly"
          >
            Xem phân tích chi nhánh
          </Link>
        </FadeIn>

        <AnimatedPanel delay={0.04}>
          <Card className="shadow-sm transition-shadow duration-200 hover:shadow-md">
            <CardHeader>
              <CardTitle>Kỳ phân tích</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-slate-600">
                Đang tính số liệu từ <span className="font-medium text-slate-900">{formatDate(monthRange.fromDate)}</span> đến{" "}
                <span className="font-medium text-slate-900">{formatDate(addDays(monthRange.toDate, -1))}</span>. Mốc kết thúc được tính hết ngày cuối
                của tháng đã chọn.
              </p>
              <form className="grid gap-3 sm:grid-cols-[180px_180px_auto]">
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
                <button className="h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800">
                  Lọc
                </button>
              </form>
            </CardContent>
          </Card>
        </AnimatedPanel>

        <MotionMetricGrid className="md:grid-cols-4">
          <MetricCard label="Số lượng bán" value={formatNumber(totalQuantity)} />
          <MetricCard label="Doanh thu" value={formatCurrency(totalRevenue)} />
          <MetricCard label="Hóa đơn trong kỳ" value={formatNumber(invoiceCount)} description="Đếm tất cả hóa đơn có sản phẩm này trong kỳ phân tích." />
          <MetricCard label="Khách trong kỳ" value={formatNumber(customerCount)} description="Đếm khách hàng duy nhất đã mua sản phẩm này trong kỳ." />
        </MotionMetricGrid>

        <div className="grid gap-4 xl:grid-cols-2">
          <AnimatedPanel delay={0.08}>
            <Card className="h-full shadow-sm transition-shadow duration-200 hover:shadow-md">
              <CardHeader>
                <CardTitle>Bán theo chi nhánh</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50 text-left">
                        <th className="px-3 py-2 font-medium">Chi nhánh</th>
                        <th className="px-3 py-2 text-right font-medium">Số lượng</th>
                        <th className="px-3 py-2 text-right font-medium">Doanh thu</th>
                        <th className="px-3 py-2 text-right font-medium">Hóa đơn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {branchSummary.length === 0 ? (
                        <tr>
                          <td className="px-3 py-8 text-center text-slate-500" colSpan={4}>
                            Không có dữ liệu bán theo chi nhánh trong kỳ.
                          </td>
                        </tr>
                      ) : (
                        branchSummary.map((row, index) => (
                          <AnimatedTableRow key={row.branchName} className="border-b last:border-0" delay={index * 0.02}>
                            <td className="px-3 py-2 font-medium text-slate-900">{row.branchName}</td>
                            <td className="px-3 py-2 text-right">{formatNumber(row.quantity)}</td>
                            <td className="px-3 py-2 text-right">{formatCurrency(row.revenue)}</td>
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

          <AnimatedPanel delay={0.1}>
            <Card className="h-full shadow-sm transition-shadow duration-200 hover:shadow-md">
              <CardHeader>
                <CardTitle>Bán theo tháng</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50 text-left">
                        <th className="px-3 py-2 font-medium">Tháng</th>
                        <th className="px-3 py-2 text-right font-medium">Số lượng</th>
                        <th className="px-3 py-2 text-right font-medium">Doanh thu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthSummary.length === 0 ? (
                        <tr>
                          <td className="px-3 py-8 text-center text-slate-500" colSpan={3}>
                            Không có dữ liệu bán theo tháng trong kỳ.
                          </td>
                        </tr>
                      ) : (
                        monthSummary.map((row, index) => (
                          <AnimatedTableRow key={row.month.toISOString()} className="border-b last:border-0" delay={index * 0.02}>
                            <td className="px-3 py-2">{formatMonthLabel(row.month)}</td>
                            <td className="px-3 py-2 text-right">{formatNumber(row.quantity)}</td>
                            <td className="px-3 py-2 text-right">{formatCurrency(row.revenue)}</td>
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

        <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <AnimatedPanel delay={0.12}>
            <Card className="h-full shadow-sm transition-shadow duration-200 hover:shadow-md">
              <CardHeader>
                <CardTitle>Tồn kho hiện tại</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50 text-left">
                        <th className="px-3 py-2 font-medium">Chi nhánh</th>
                        <th className="px-3 py-2 text-right font-medium">Tồn</th>
                        <th className="px-3 py-2 text-right font-medium">Đặt giữ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryRows.length === 0 ? (
                        <tr>
                          <td className="px-3 py-8 text-center text-slate-500" colSpan={3}>
                            Chưa có snapshot tồn kho cho sản phẩm này.
                          </td>
                        </tr>
                      ) : (
                        inventoryRows.map((row, index) => (
                          <AnimatedTableRow key={row.id} className="border-b last:border-0" delay={index * 0.02}>
                            <td className="px-3 py-2">{row.branch.name}</td>
                            <td className="px-3 py-2 text-right font-medium">{formatNumber(toNumber(row.onHand))}</td>
                            <td className="px-3 py-2 text-right">{formatNumber(toNumber(row.reserved))}</td>
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

        <AnimatedPanel delay={0.14}>
          <Card className="shadow-sm transition-shadow duration-200 hover:shadow-md">
            <CardHeader>
              <CardTitle>Hóa đơn liên quan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <form className="grid gap-3 lg:grid-cols-[170px_220px_minmax(220px,1fr)_auto]">
                <input name="fromMonth" type="hidden" value={monthRange.fromMonthValue} />
                <input name="toMonth" type="hidden" value={monthRange.toMonthValue} />
                <label className="grid gap-1 text-sm">
                  <span className="text-xs font-medium text-slate-600">Tháng hóa đơn</span>
                  <input
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                    defaultValue={invoiceMonth}
                    name="invoiceMonth"
                    type="month"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-xs font-medium text-slate-600">Chi nhánh</span>
                  <select
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                    defaultValue={invoiceBranch}
                    name="invoiceBranch"
                  >
                    <option value="">Tất cả chi nhánh</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-xs font-medium text-slate-600">Tìm hóa đơn/khách</span>
                  <input
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                    defaultValue={invoiceKeyword}
                    name="invoiceQ"
                    placeholder="Mã hóa đơn, mã khách, tên khách"
                  />
                </label>
                <button className="h-10 self-end rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800">
                  Lọc bảng
                </button>
              </form>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm font-medium text-slate-900">
                  Bảng bên dưới đang lấy hóa đơn từ {formatDate(invoiceTableRange.fromDate)} đến {formatDate(addDays(invoiceTableRange.toDate, -1))}
                  {invoiceBranchId ? `, chi nhánh ${branches.find((branch) => branch.id === invoiceBranchId)?.name ?? "đã chọn"}` : ", tất cả chi nhánh"}.
                </div>
                <div className="mt-1 text-xs text-slate-600">Hiển thị tối đa 120 dòng gần nhất để bảng vẫn phản hồi nhanh.</div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left">
                      <th className="px-3 py-2 font-medium">Chi nhánh</th>
                      <th className="px-3 py-2 text-right font-medium">Số lượng trong bảng lọc</th>
                      <th className="px-3 py-2 text-right font-medium">Doanh thu</th>
                      <th className="px-3 py-2 text-right font-medium">Hóa đơn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatedBranchSummary.length === 0 ? (
                      <tr>
                        <td className="px-3 py-6 text-center text-slate-500" colSpan={4}>
                          Không có dữ liệu tóm tắt theo chi nhánh với bộ lọc hiện tại.
                        </td>
                      </tr>
                    ) : (
                      relatedBranchSummary.map((row, index) => (
                        <AnimatedTableRow key={row.branchName} className="border-b last:border-0" delay={index * 0.02}>
                          <td className="px-3 py-2 font-medium text-slate-900">{row.branchName}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(row.quantity)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(row.revenue)}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(row.invoiceCount)}</td>
                        </AnimatedTableRow>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left">
                      <th className="px-3 py-2 font-medium">Hóa đơn</th>
                      <th className="px-3 py-2 font-medium">Ngày</th>
                      <th className="px-3 py-2 font-medium">Khách hàng</th>
                      <th className="px-3 py-2 font-medium">Chi nhánh</th>
                      <th className="px-3 py-2 text-right font-medium">SL</th>
                      <th className="px-3 py-2 text-right font-medium">Đơn giá</th>
                      <th className="px-3 py-2 text-right font-medium">Giảm giá</th>
                      <th className="px-3 py-2 text-right font-medium">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatedItems.length === 0 ? (
                      <tr>
                        <td className="px-3 py-8 text-center text-slate-500" colSpan={8}>
                          Không có hóa đơn liên quan với bộ lọc hiện tại.
                        </td>
                      </tr>
                    ) : (
                      relatedItems.map((item, index) => (
                        <AnimatedTableRow key={item.id} className="border-b last:border-0" delay={Math.min(index, 12) * 0.015}>
                          <td className="px-3 py-2 font-medium text-slate-900">{item.invoice.code ?? "-"}</td>
                          <td className="px-3 py-2">{formatDate(item.invoice.purchaseDate)}</td>
                          <td className="px-3 py-2">
                            <div>{item.invoice.customer?.name ?? "Khách lẻ"}</div>
                            <div className="mt-1 text-xs text-slate-500">{item.invoice.customer?.code ?? "Không có mã khách"}</div>
                          </td>
                          <td className="px-3 py-2">{item.invoice.branch?.name ?? "-"}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(toNumber(item.quantity))}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(toNumber(item.price))}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(toNumber(item.discount))}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(toNumber(item.subtotal))}</td>
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

function summarizeByBranch(rows: Awaited<ReturnType<typeof getProductBranchMonthlyRows>>) {
  const map = new Map<string, { branchName: string; quantity: number; revenue: number; invoiceCount: number }>();

  for (const row of rows) {
    const branchName = row.branchName ?? "Không rõ chi nhánh";
    const current = map.get(branchName) ?? { branchName, quantity: 0, revenue: 0, invoiceCount: 0 };
    current.quantity += row.quantity;
    current.revenue += row.revenue;
    current.invoiceCount += row.invoiceCount;
    map.set(branchName, current);
  }

  return [...map.values()].sort((a, b) => b.quantity - a.quantity);
}

function summarizeByMonth(rows: Awaited<ReturnType<typeof getProductBranchMonthlyRows>>) {
  const map = new Map<string, { month: Date; quantity: number; revenue: number }>();

  for (const row of rows) {
    const key = row.month.toISOString();
    const current = map.get(key) ?? { month: row.month, quantity: 0, revenue: 0 };
    current.quantity += row.quantity;
    current.revenue += row.revenue;
    map.set(key, current);
  }

  return [...map.values()].sort((a, b) => b.month.getTime() - a.month.getTime());
}

function summarizeInvoiceItemsByBranch(
  rows: Awaited<ReturnType<typeof prisma.invoiceItem.findMany<{ include: { invoice: { select: { branch: { select: { name: true } } } } } }>>>
) {
  const map = new Map<string, { branchName: string; quantity: number; revenue: number; invoiceIds: Set<number> }>();

  for (const row of rows) {
    const branchName = row.invoice.branch?.name ?? "Không rõ chi nhánh";
    const current = map.get(branchName) ?? { branchName, quantity: 0, revenue: 0, invoiceIds: new Set<number>() };
    current.quantity += toNumber(row.quantity);
    current.revenue += toNumber(row.subtotal);
    current.invoiceIds.add(row.invoiceId);
    map.set(branchName, current);
  }

  return [...map.values()]
    .map((row) => ({
      branchName: row.branchName,
      quantity: row.quantity,
      revenue: row.revenue,
      invoiceCount: row.invoiceIds.size
    }))
    .sort((a, b) => b.quantity - a.quantity);
}

function MetricCard({ label, value, description }: { label: string; value: string; description?: string }) {
  return (
    <MotionMetricCard>
      <Card className="h-full shadow-sm transition-shadow duration-200 hover:shadow-md">
        <CardHeader>
          <CardTitle className="text-sm text-slate-600">{label}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{value}</div>
          {description ? <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p> : null}
        </CardContent>
      </Card>
    </MotionMetricCard>
  );
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

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
