import { Prisma } from "@prisma/client";
import { DatabaseUnavailable, isDatabaseConnectionError } from "@/components/layout/database-unavailable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

type ProductFrequencyPageProps = {
  searchParams?: Promise<{
    q?: string;
    category?: string;
    sort?: string;
  }>;
};

const cancelledStatus = "Đã hủy";

export default async function ProductFrequencyPage({ searchParams }: ProductFrequencyPageProps) {
  const params = (await searchParams) ?? {};
  const query = params.q?.trim() ?? "";
  const category = params.category?.trim() ?? "";
  const sort = params.sort?.trim() ?? "revenue";

  const productWhere: Prisma.ProductWhereInput = {
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { code: { contains: query, mode: "insensitive" } },
            { fullName: { contains: query, mode: "insensitive" } }
          ]
        }
      : {}),
    ...(category ? { categoryName: category } : {})
  };

  let data;

  try {
    const matchingProducts = await prisma.product.findMany({
      where: productWhere,
      select: { id: true, code: true, name: true, categoryName: true, unit: true }
    });
    const productIds = matchingProducts.map((product) => product.id);
    const productGroups = await prisma.invoiceItem.groupBy({
      by: ["productId"],
      where: {
        productId: { in: productIds.length > 0 ? productIds : [-1] },
        invoice: { status: { not: cancelledStatus } }
      },
      _count: { _all: true },
      _sum: { quantity: true, subtotal: true }
    });
    const sortedProductGroups = productGroups
      .sort((a, b) => sortProductGroups(a, b, sort))
      .slice(0, 100);
    const shownProductIds = sortedProductGroups.flatMap((item) => (item.productId ? [item.productId] : []));
    const [customerCounts, branchGroups, categories] = await Promise.all([
      prisma.invoiceItem.findMany({
        where: {
          productId: { in: shownProductIds },
          invoice: { status: { not: cancelledStatus }, customerId: { not: null } }
        },
        select: {
          productId: true,
          invoice: { select: { customerId: true } }
        }
      }),
      prisma.invoiceItem.groupBy({
        by: ["productId", "invoiceId"],
        where: {
          productId: { in: shownProductIds },
          invoice: { status: { not: cancelledStatus } }
        },
        _sum: { subtotal: true }
      }),
      prisma.product.groupBy({
        by: ["categoryName"],
        _count: { _all: true },
        orderBy: { _count: { categoryName: "desc" } }
      })
    ]);
    const invoicesForBranch = await prisma.invoice.findMany({
      where: {
        id: { in: branchGroups.map((item) => item.invoiceId) }
      },
      select: { id: true, branchId: true, branch: { select: { name: true } } }
    });
    const invoiceBranchById = new Map(invoicesForBranch.map((invoice) => [invoice.id, invoice.branch]));
    const customerSetByProduct = new Map<number, Set<number>>();
    for (const item of customerCounts) {
      if (!item.productId || !item.invoice.customerId) {
        continue;
      }

      const set = customerSetByProduct.get(item.productId) ?? new Set<number>();
      set.add(item.invoice.customerId);
      customerSetByProduct.set(item.productId, set);
    }
    const branchRevenueByProduct = new Map<number, Map<string, number>>();
    for (const item of branchGroups) {
      if (!item.productId) {
        continue;
      }

      const branchName = invoiceBranchById.get(item.invoiceId)?.name ?? "Không rõ chi nhánh";
      const branchMap = branchRevenueByProduct.get(item.productId) ?? new Map<string, number>();
      branchMap.set(branchName, (branchMap.get(branchName) ?? 0) + toNumber(item._sum.subtotal));
      branchRevenueByProduct.set(item.productId, branchMap);
    }
    const productById = new Map(matchingProducts.map((product) => [product.id, product]));
    const rows = sortedProductGroups.map((item) => {
      const productId = item.productId ?? 0;
      const branchMap = branchRevenueByProduct.get(productId);
      const bestBranch = branchMap
        ? [...branchMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
        : undefined;

      return {
        product: productById.get(productId),
        invoiceAppearances: item._count._all,
        quantity: toNumber(item._sum.quantity),
        revenue: toNumber(item._sum.subtotal),
        customerCount: customerSetByProduct.get(productId)?.size ?? 0,
        bestBranch: bestBranch ?? "-"
      };
    });

    data = {
      rows,
      categories,
      totalRevenue: rows.reduce((sum, item) => sum + item.revenue, 0),
      totalQuantity: rows.reduce((sum, item) => sum + item.quantity, 0),
      totalAppearances: rows.reduce((sum, item) => sum + item.invoiceAppearances, 0),
      productCount: rows.length
    };
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return <DatabaseUnavailable error={error} />;
    }

    throw error;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Phân tích tần suất sản phẩm</h1>
          <p className="mt-2 text-sm text-slate-600">
            Xếp hạng sản phẩm theo doanh thu, số lượng bán, số lần xuất hiện trong hóa đơn và khách hàng đã mua.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <a
            className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
            href={`/api/export/analytics/product-frequency?${new URLSearchParams({
              ...(query ? { q: query } : {}),
              ...(category ? { category } : {}),
              ...(sort !== "revenue" ? { sort } : {})
            }).toString()}`}
          >
            Xuất Excel
          </a>
          <div className="text-sm text-slate-500">Hiển thị tối đa 100 sản phẩm</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Sản phẩm có bán" value={formatNumber(data.productCount)} />
        <MetricCard label="Doanh thu" value={formatCurrency(data.totalRevenue)} />
        <MetricCard label="Số lượng bán" value={formatNumber(data.totalQuantity)} />
        <MetricCard label="Lượt xuất hiện" value={formatNumber(data.totalAppearances)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bộ lọc</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 xl:grid-cols-[1fr_240px_220px_auto]">
            <input
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
              defaultValue={query}
              name="q"
              placeholder="Tìm theo tên hoặc mã sản phẩm"
            />
            <select
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
              defaultValue={category}
              name="category"
            >
              <option value="">Tất cả nhóm hàng</option>
              {data.categories.map((item) => (
                <option key={item.categoryName ?? "empty"} value={item.categoryName ?? ""}>
                  {item.categoryName ?? "Chưa phân nhóm"} ({item._count._all})
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
              defaultValue={sort}
              name="sort"
            >
              <option value="revenue">Sắp xếp theo doanh thu</option>
              <option value="quantity">Sắp xếp theo số lượng</option>
              <option value="appearances">Sắp xếp theo lượt xuất hiện</option>
            </select>
            <button className="h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800">
              Lọc
            </button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bảng tần suất sản phẩm</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="px-3 py-2 font-medium">Sản phẩm</th>
                  <th className="px-3 py-2 font-medium">Nhóm hàng</th>
                  <th className="px-3 py-2 text-right font-medium">Số lượng</th>
                  <th className="px-3 py-2 text-right font-medium">Lượt hóa đơn</th>
                  <th className="px-3 py-2 text-right font-medium">Doanh thu</th>
                  <th className="px-3 py-2 text-right font-medium">Khách đã mua</th>
                  <th className="px-3 py-2 font-medium">Chi nhánh mạnh nhất</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-slate-500" colSpan={7}>
                      Không có sản phẩm phù hợp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  data.rows.map((row, index) => (
                    <tr key={`${row.product?.id ?? "unknown"}-${index}`} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{row.product?.name ?? "Không rõ sản phẩm"}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {row.product?.code ?? "Không có mã"} · {row.product?.unit ?? "Chưa có đơn vị"}
                        </div>
                      </td>
                      <td className="px-3 py-2">{row.product?.categoryName ?? "Chưa phân nhóm"}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(row.quantity)}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(row.invoiceAppearances)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.revenue)}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(row.customerCount)}</td>
                      <td className="px-3 py-2">{row.bestBranch}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-slate-600">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function sortProductGroups(
  a: {
    _count: { _all: number };
    _sum: { quantity: Prisma.Decimal | null; subtotal: Prisma.Decimal | null };
  },
  b: {
    _count: { _all: number };
    _sum: { quantity: Prisma.Decimal | null; subtotal: Prisma.Decimal | null };
  },
  sort: string
) {
  if (sort === "quantity") {
    return toNumber(b._sum.quantity) - toNumber(a._sum.quantity);
  }

  if (sort === "appearances") {
    return b._count._all - a._count._all;
  }

  return toNumber(b._sum.subtotal) - toNumber(a._sum.subtotal);
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
