import Link from "next/link";
import { Prisma } from "@prisma/client";
import { DatabaseUnavailable, isDatabaseConnectionError } from "@/components/layout/database-unavailable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedPanel, AnimatedTableRow, FadeIn, MotionMetricCard, MotionMetricGrid } from "@/components/ui/motion-primitives";
import { TableSearch } from "@/components/ui/table-search";
import { prisma } from "@/lib/prisma";

type ProductsPageProps = {
  searchParams?: Promise<{
    q?: string;
    category?: string;
    status?: string;
  }>;
};

const productsPageSize = 20;

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = (await searchParams) ?? {};
  const query = params.q?.trim() ?? "";
  const category = params.category?.trim() ?? "";
  const status = params.status?.trim() ?? "all";

  const productWhere: Prisma.ProductWhereInput = {
    ...(query
      ? {
          OR: [
            { name: { contains: query } },
            { fullName: { contains: query } },
            { code: { contains: query } }
          ]
        }
      : {}),
    ...(category ? { categoryName: category } : {}),
    ...(status === "active" ? { isActive: true } : {}),
    ...(status === "inactive" ? { isActive: false } : {})
  };

  let productData;

  try {
    const latestInventoryDate = await prisma.inventorySnapshot.aggregate({
      _max: { snapshotDate: true }
    });

    productData = await Promise.all([
      prisma.product.findMany({
        where: productWhere,
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        take: productsPageSize
      }),
      prisma.product.count({ where: productWhere }),
      prisma.product.count({ where: { ...productWhere, isActive: true } }),
      prisma.product.groupBy({
        by: ["categoryName"],
        _count: { _all: true },
        orderBy: { _count: { categoryName: "desc" } }
      }),
      latestInventoryDate._max.snapshotDate
        ? prisma.inventorySnapshot.groupBy({
            by: ["productId"],
            where: {
              snapshotDate: latestInventoryDate._max.snapshotDate
            },
            _sum: {
              onHand: true,
              reserved: true
            }
          })
        : []
    ]);
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return <DatabaseUnavailable error={error} />;
    }

    throw error;
  }

  const [products, totalProducts, activeProducts, categories, inventoryGroups] = productData;

  const inventoryByProduct = new Map(
    inventoryGroups.map((item) => [
      item.productId,
      {
        onHand: toNumber(item._sum.onHand),
        reserved: toNumber(item._sum.reserved)
      }
    ])
  );

  const totalOnHand = products.reduce((sum, product) => sum + (inventoryByProduct.get(product.id)?.onHand ?? 0), 0);
  const searchSuggestions = products.map((product) => ({
    label: product.name,
    value: product.name,
    meta: `${product.code ?? "Không có mã"} · ${product.categoryName ?? "Chưa phân nhóm"}`
  }));

  return (
    <div className="space-y-6">
      <FadeIn className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Sản phẩm</h1>
          <p className="mt-2 text-sm text-slate-600">
            Danh sách sản phẩm đã đồng bộ từ KiotViet, kèm tồn kho tổng theo snapshot mới nhất.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <a
            className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
            href={`/api/export/products?${new URLSearchParams({
              ...(query ? { q: query } : {}),
              ...(category ? { category } : {}),
              ...(status !== "all" ? { status } : {})
            }).toString()}`}
          >
            Xuất Excel
          </a>
          <div className="text-sm text-slate-500">Hiển thị tối đa 20 dòng đầu tiên</div>
        </div>
      </FadeIn>

      <MotionMetricGrid className="md:grid-cols-3">
        <MetricCard label="Sản phẩm khớp lọc" value={formatNumber(totalProducts)} />
        <MetricCard label="Đang bán" value={formatNumber(activeProducts)} />
        <MetricCard label="Tồn kho trong danh sách" value={formatNumber(totalOnHand)} />
      </MotionMetricGrid>

      <AnimatedPanel className="relative z-20" delay={0.04}>
        <Card className="shadow-sm transition-shadow duration-200 hover:shadow-md">
          <CardHeader>
            <CardTitle>Bộ lọc</CardTitle>
          </CardHeader>
          <CardContent>
          <form className="grid gap-3 lg:grid-cols-[1fr_220px_180px_auto]">
            <TableSearch
              baseParams={{
                ...(category ? { category } : {}),
                ...(status !== "all" ? { status } : {})
              }}
              placeholder="Tìm theo tên hoặc mã sản phẩm"
              suggestions={searchSuggestions}
              value={query}
            />
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
            <select
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
              defaultValue={status}
              name="status"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Đang bán</option>
              <option value="inactive">Ngừng bán</option>
            </select>
            <button className="h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800">
              Lọc
            </button>
          </form>
          </CardContent>
        </Card>
      </AnimatedPanel>

      <AnimatedPanel className="relative z-10" delay={0.08}>
        <Card className="shadow-sm transition-shadow duration-200 hover:shadow-md">
          <CardHeader>
            <CardTitle>Bảng sản phẩm</CardTitle>
          </CardHeader>
          <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="px-3 py-2 font-medium">STT</th>
                  <th className="px-3 py-2 font-medium">Mã</th>
                  <th className="px-3 py-2 font-medium">Tên sản phẩm</th>
                  <th className="px-3 py-2 font-medium">Nhóm hàng</th>
                  <th className="px-3 py-2 text-right font-medium">Giá bán</th>
                  <th className="px-3 py-2 text-right font-medium">Tồn</th>
                  <th className="px-3 py-2 text-right font-medium">Đặt giữ</th>
                  <th className="px-3 py-2 font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-slate-500" colSpan={8}>
                      Không có sản phẩm phù hợp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  products.map((product, index) => {
                    const inventory = inventoryByProduct.get(product.id);

                    return (
                      <AnimatedTableRow
                        key={product.id}
                        className="border-b last:border-0"
                        delay={Math.min(index, 12) * 0.015}
                      >
                        <td className="px-3 py-2 text-slate-500">{index + 1}</td>
                        <td className="px-3 py-2 font-medium text-slate-900">{product.code ?? "-"}</td>
                        <td className="px-3 py-2">
                          <Link className="font-medium text-slate-900 underline-offset-2 hover:underline" href={`/products/${product.id}`}>
                            {product.name}
                          </Link>
                          <div className="mt-1 text-xs text-slate-500">{product.unit ?? "Chưa có đơn vị"}</div>
                        </td>
                        <td className="px-3 py-2">{product.categoryName ?? "Chưa phân nhóm"}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(toNumber(product.basePrice))}</td>
                        <td className="px-3 py-2 text-right">{formatNumber(inventory?.onHand ?? 0)}</td>
                        <td className="px-3 py-2 text-right">{formatNumber(inventory?.reserved ?? 0)}</td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              product.isActive
                                ? "rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"
                                : "rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"
                            }
                          >
                            {product.isActive ? "Đang bán" : "Ngừng bán"}
                          </span>
                        </td>
                      </AnimatedTableRow>
                    );
                  })
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
