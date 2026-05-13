import Link from "next/link";
import { notFound } from "next/navigation";
import { DatabaseUnavailable, isDatabaseConnectionError } from "@/components/layout/database-unavailable";
import { CustomerInvoiceSearch } from "@/components/products/customer-invoice-search";
import { CustomerInvoiceSummaryTable } from "@/components/products/customer-invoice-summary-table";
import { ProductSwitcher } from "@/components/products/product-switcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedPanel, AnimatedTableRow, FadeIn, MotionMetricCard, MotionMetricGrid } from "@/components/ui/motion-primitives";
import {
  formatMonthLabel,
  getProductBranchMonthlyRows,
  toNumber
} from "@/lib/analytics/product-branch-monthly";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type ProductDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    period?: string;
    fromDate?: string;
    toDate?: string;
    invoiceCustomer?: string;
    invoiceQ?: string;
  }>;
};

const cancelledStatus = "Đã hủy";
type AnalysisPeriod = "month" | "previousMonth" | "week" | "custom";

export default async function ProductDetailPage({ params, searchParams }: ProductDetailPageProps) {
  const { id } = await params;
  const productId = Number(id);

  if (!Number.isInteger(productId)) {
    notFound();
  }

  const query = (await searchParams) ?? {};
  const analysisRange = parseAnalysisRange({
    period: query.period?.trim(),
    fromDate: query.fromDate?.trim(),
    toDate: query.toDate?.trim()
  });
  const invoiceCustomer = query.invoiceCustomer?.trim() ?? "";
  const invoiceCustomerId = invoiceCustomer ? Number(invoiceCustomer) : undefined;
  const invoiceKeyword = query.invoiceQ?.trim() ?? "";

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
        gte: analysisRange.fromDate,
        lt: analysisRange.toDate
      },
      ...(invoiceCustomerId ? { customerId: invoiceCustomerId } : {}),
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

    const [productOptions, salesRows, periodInvoiceCustomers, customerSourceInvoices, relatedSummaryItems, relatedItems, inventoryRows] = await Promise.all([
      prisma.product.findMany({
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        select: { id: true, code: true, name: true, categoryName: true, unit: true }
      }),
      getProductBranchMonthlyRows({
        productId,
        fromDate: analysisRange.fromDate,
        toDate: analysisRange.toDate,
        limit: 600
      }),
      prisma.invoice.findMany({
        where: {
          status: { not: cancelledStatus },
          purchaseDate: {
            gte: analysisRange.fromDate,
            lt: analysisRange.toDate
          },
          items: { some: { productId } }
        },
        select: {
          id: true,
          customerId: true
        }
      }),
      prisma.invoice.findMany({
        where: {
          status: { not: cancelledStatus },
          purchaseDate: {
            gte: analysisRange.fromDate,
            lt: analysisRange.toDate
          },
          items: { some: { productId } },
          customerId: { not: null }
        },
        select: {
          customer: { select: { id: true, code: true, name: true } }
        },
        orderBy: { customer: { name: "asc" } }
      }),
      prisma.invoiceItem.findMany({
        where: {
          productId,
          invoice: relatedInvoiceWhere
        },
        select: {
          invoiceId: true,
          quantity: true,
          subtotal: true,
          invoice: {
            select: {
              customer: { select: { id: true, code: true, name: true } }
            }
          }
        }
      }),
      prisma.invoiceItem.findMany({
        where: {
          productId,
          invoice: relatedInvoiceWhere
        },
        orderBy: { invoice: { purchaseDate: "desc" } },
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
    const customerOptions = uniqueCustomers(customerSourceInvoices);
    const invoicesByCustomer = groupInvoiceDetailsByCustomer(relatedItems);
    const relatedCustomerSummary = summarizeInvoiceItemsByCustomer(relatedSummaryItems, invoicesByCustomer);
    const totalQuantity = salesRows.reduce((sum, row) => sum + row.quantity, 0);
    const totalRevenue = salesRows.reduce((sum, row) => sum + row.revenue, 0);
    const invoiceCount = new Set(periodInvoiceCustomers.map((item) => item.id)).size;
    const customerCount = new Set(periodInvoiceCustomers.flatMap((item) => (item.customerId ? [item.customerId] : []))).size;

    return (
      <div className="space-y-6">
        <FadeIn className="relative z-[80] flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm text-slate-500">{product.code ?? "Không có mã"}</div>
            <ProductSwitcher
              currentProductId={productId}
              currentProductName={product.name}
              fromDate={analysisRange.fromDateValue}
              period={analysisRange.period}
              products={productOptions}
              toDate={analysisRange.toDateValue}
            />
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
                Đang tính số liệu từ <span className="font-medium text-slate-900">{formatDate(analysisRange.fromDate)}</span> đến{" "}
                <span className="font-medium text-slate-900">{formatDate(analysisRange.toDateInclusive)}</span>. Mặc định lấy từ đầu tháng hiện tại đến hôm nay.
              </p>
              <form className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    className={periodButtonClass(analysisRange.period === "month")}
                    name="period"
                    type="submit"
                    value="month"
                  >
                    Tháng này
                  </button>
                  <button
                    className={periodButtonClass(analysisRange.period === "previousMonth")}
                    name="period"
                    type="submit"
                    value="previousMonth"
                  >
                    Tháng trước
                  </button>
                  <button
                    className={periodButtonClass(analysisRange.period === "week")}
                    name="period"
                    type="submit"
                    value="week"
                  >
                    Tuần này
                  </button>
                  <button
                    className={periodButtonClass(analysisRange.period === "custom")}
                    name="period"
                    type="submit"
                    value="custom"
                  >
                    Tùy chọn ngày
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-[180px_180px_auto]">
                  <label className="grid gap-1 text-sm">
                    <span className="text-xs font-medium text-slate-600">Ngày đầu</span>
                    <input
                      className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                      defaultValue={analysisRange.fromDateValue}
                      name="fromDate"
                      type="date"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-xs font-medium text-slate-600">Ngày cuối</span>
                    <input
                      className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                      defaultValue={analysisRange.toDateValue}
                      name="toDate"
                      type="date"
                    />
                  </label>
                  <button
                    className="h-10 self-end rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
                    name="period"
                    type="submit"
                    value="custom"
                  >
                    Áp dụng ngày
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>
        </AnimatedPanel>

        <MotionMetricGrid className="relative z-10 md:grid-cols-4">
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
                        <th className="px-3 py-2 font-medium">STT</th>
                        <th className="px-3 py-2 font-medium">Chi nhánh</th>
                        <th className="px-3 py-2 text-right font-medium">Số lượng</th>
                        <th className="px-3 py-2 text-right font-medium">Doanh thu</th>
                        <th className="px-3 py-2 text-right font-medium">Hóa đơn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {branchSummary.length === 0 ? (
                        <tr>
                          <td className="px-3 py-8 text-center text-slate-500" colSpan={5}>
                            Không có dữ liệu bán theo chi nhánh trong kỳ.
                          </td>
                        </tr>
                      ) : (
                        branchSummary.map((row, index) => (
                          <AnimatedTableRow key={row.branchName} className="border-b last:border-0" delay={index * 0.02}>
                            <td className="px-3 py-2 text-slate-500">{index + 1}</td>
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
                        <th className="px-3 py-2 font-medium">STT</th>
                        <th className="px-3 py-2 font-medium">Tháng</th>
                        <th className="px-3 py-2 text-right font-medium">Số lượng</th>
                        <th className="px-3 py-2 text-right font-medium">Doanh thu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthSummary.length === 0 ? (
                        <tr>
                          <td className="px-3 py-8 text-center text-slate-500" colSpan={4}>
                            Không có dữ liệu bán theo tháng trong kỳ.
                          </td>
                        </tr>
                      ) : (
                        monthSummary.map((row, index) => (
                          <AnimatedTableRow key={row.month.toISOString()} className="border-b last:border-0" delay={index * 0.02}>
                            <td className="px-3 py-2 text-slate-500">{index + 1}</td>
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
                        <th className="px-3 py-2 font-medium">STT</th>
                        <th className="px-3 py-2 font-medium">Chi nhánh</th>
                        <th className="px-3 py-2 text-right font-medium">Tồn</th>
                        <th className="px-3 py-2 text-right font-medium">Đặt giữ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryRows.length === 0 ? (
                        <tr>
                          <td className="px-3 py-8 text-center text-slate-500" colSpan={4}>
                            Chưa có snapshot tồn kho cho sản phẩm này.
                          </td>
                        </tr>
                      ) : (
                        inventoryRows.map((row, index) => (
                          <AnimatedTableRow key={row.id} className="border-b last:border-0" delay={index * 0.02}>
                            <td className="px-3 py-2 text-slate-500">{index + 1}</td>
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
              <CustomerInvoiceSearch
                customers={customerOptions}
                fromDate={analysisRange.fromDateValue}
                keyword={invoiceKeyword}
                period={analysisRange.period}
                selectedCustomerId={invoiceCustomer}
                toDate={analysisRange.toDateValue}
              />

              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm font-medium text-slate-900">
                  Bảng bên dưới dùng cùng kỳ phân tích: từ {formatDate(analysisRange.fromDate)} đến {formatDate(analysisRange.toDateInclusive)}
                  {invoiceCustomerId
                    ? `, khách hàng ${customerOptions.find((customer) => customer.id === invoiceCustomerId)?.name ?? "đã chọn"}`
                    : ", tất cả khách hàng"}.
                </div>
                <div className="mt-1 text-xs text-slate-600">
                  Bảng tóm tắt tính trên toàn bộ dữ liệu trong kỳ. Bấm “Xem hóa đơn chi tiết” ở từng khách để đối soát đầy đủ các hóa đơn đang khớp bộ lọc.
                </div>
              </div>

              <CustomerInvoiceSummaryTable rows={relatedCustomerSummary} />
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

type CustomerOption = {
  id: number;
  code: string | null;
  name: string;
};

type CustomerSourceInvoice = {
  customer: CustomerOption | null;
};

type RelatedInvoiceItem = {
  invoiceId: number;
  quantity: unknown;
  subtotal: unknown;
  invoice: {
    customer: CustomerOption | null;
  };
};

function parseAnalysisRange({
  period,
  fromDate,
  toDate
}: {
  period?: string;
  fromDate?: string;
  toDate?: string;
}) {
  const today = startOfDay(new Date());
  const selectedPeriod: AnalysisPeriod =
    period === "previousMonth" || period === "week" || period === "custom" ? period : "month";
  let start = startOfMonth(today);
  let endInclusive = today;

  if (selectedPeriod === "previousMonth") {
    start = startOfMonth(addMonths(today, -1));
    endInclusive = addDays(startOfMonth(today), -1);
  }

  if (selectedPeriod === "week") {
    start = startOfWeek(today);
  }

  if (selectedPeriod === "custom") {
    start = parseDateInput(fromDate) ?? startOfMonth(today);
    endInclusive = parseDateInput(toDate) ?? today;

    if (endInclusive < start) {
      endInclusive = start;
    }
  }

  return {
    period: selectedPeriod,
    fromDate: start,
    toDate: addDays(endInclusive, 1),
    toDateInclusive: endInclusive,
    fromDateValue: formatDateInput(start),
    toDateValue: formatDateInput(endInclusive)
  };
}

function parseDateInput(value?: string) {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return startOfDay(new Date(year, month - 1, day));
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

function startOfWeek(date: Date) {
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(startOfDay(date), mondayOffset);
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function periodButtonClass(active: boolean) {
  const base =
    "inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors duration-200";

  return active
    ? `${base} border-slate-900 bg-slate-900 text-white`
    : `${base} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
}

function uniqueCustomers(rows: CustomerSourceInvoice[]) {
  const map = new Map<number, CustomerOption>();

  for (const row of rows) {
    if (row.customer) {
      map.set(row.customer.id, row.customer);
    }
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

type RelatedDisplayInvoiceItem = {
  id: number;
  invoiceId: number;
  quantity: unknown;
  price: unknown;
  discount: unknown;
  subtotal: unknown;
  invoice: {
    code: string | null;
    purchaseDate: Date;
    customer: CustomerOption | null;
    branch: { name: string } | null;
  };
};

function groupInvoiceDetailsByCustomer(rows: RelatedDisplayInvoiceItem[]) {
  const map = new Map<
    string,
    {
      id: number;
      code: string;
      date: string;
      customerName: string;
      customerCode: string | null;
      branchName: string;
      quantity: string;
      price: string;
      discount: string;
      subtotal: string;
    }[]
  >();

  for (const row of rows) {
    const customerKey = row.invoice.customer?.id ? String(row.invoice.customer.id) : "walk-in";
    const current = map.get(customerKey) ?? [];
    current.push({
      id: row.id,
      code: row.invoice.code ?? "-",
      date: formatDate(row.invoice.purchaseDate),
      customerName: row.invoice.customer?.name ?? "Khách lẻ",
      customerCode: row.invoice.customer?.code ?? null,
      branchName: row.invoice.branch?.name ?? "-",
      quantity: formatNumber(toNumber(row.quantity)),
      price: formatCurrency(toNumber(row.price)),
      discount: formatCurrency(toNumber(row.discount)),
      subtotal: formatCurrency(toNumber(row.subtotal))
    });
    map.set(customerKey, current);
  }

  return map;
}

function summarizeInvoiceItemsByCustomer(
  rows: RelatedInvoiceItem[],
  invoicesByCustomer: ReturnType<typeof groupInvoiceDetailsByCustomer>
) {
  const map = new Map<
    string,
    {
      customerKey: string;
      customerName: string;
      customerCode: string | null;
      quantity: number;
      revenue: number;
      invoiceIds: Set<number>;
    }
  >();

  for (const row of rows) {
    const customerKey = row.invoice.customer?.id ? String(row.invoice.customer.id) : "walk-in";
    const customerName = row.invoice.customer?.name ?? "Khách lẻ";
    const customerCode = row.invoice.customer?.code ?? null;
    const current = map.get(customerKey) ?? {
      customerKey,
      customerName,
      customerCode,
      quantity: 0,
      revenue: 0,
      invoiceIds: new Set<number>()
    };
    current.quantity += toNumber(row.quantity);
    current.revenue += toNumber(row.subtotal);
    current.invoiceIds.add(row.invoiceId);
    map.set(customerKey, current);
  }

  return [...map.values()]
    .map((row) => ({
      customerKey: row.customerKey,
      customerName: row.customerName,
      customerCode: row.customerCode,
      quantity: row.quantity,
      revenue: row.revenue,
      invoiceCount: row.invoiceIds.size,
      invoices: invoicesByCustomer.get(row.customerKey) ?? []
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
