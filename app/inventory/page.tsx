import { Prisma } from "@prisma/client";
import { DatabaseUnavailable, isDatabaseConnectionError } from "@/components/layout/database-unavailable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedPanel, AnimatedTableRow, FadeIn, MotionMetricCard, MotionMetricGrid } from "@/components/ui/motion-primitives";
import { TableSearch } from "@/components/ui/table-search";
import { prisma } from "@/lib/prisma";

type InventoryPageProps = {
  searchParams?: Promise<{
    q?: string;
    branch?: string;
    category?: string;
    stock?: string;
  }>;
};

const inventoryPageSize = 20;

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  const params = (await searchParams) ?? {};
  const query = params.q?.trim() ?? "";
  const branch = params.branch?.trim() ?? "";
  const category = params.category?.trim() ?? "";
  const stock = params.stock?.trim() ?? "all";

  let data;

  try {
    const latestInventoryDate = await prisma.inventorySnapshot.aggregate({
      _max: { snapshotDate: true }
    });
    const snapshotDate = latestInventoryDate._max.snapshotDate;
    const inventoryWhere: Prisma.InventorySnapshotWhereInput = {
      ...(snapshotDate ? { snapshotDate } : {}),
      ...(branch ? { branchId: Number(branch) } : {}),
      ...(query || category
        ? {
            product: {
              ...(category ? { categoryName: category } : {}),
              ...(query
                ? {
                    OR: [
                      { name: { contains: query } },
                      { code: { contains: query } },
                      { fullName: { contains: query } }
                    ]
                  }
                : {})
            }
          }
        : {}),
      ...stockFilter(stock)
    };

    const [items, stats, branches, categories] = await Promise.all([
      prisma.inventorySnapshot.findMany({
        where: inventoryWhere,
        include: {
          product: { select: { code: true, name: true, categoryName: true, unit: true, isActive: true } },
          branch: { select: { id: true, name: true } }
        },
        orderBy: [{ onHand: "asc" }, { product: { name: "asc" } }],
        take: inventoryPageSize
      }),
      prisma.inventorySnapshot.aggregate({
        where: inventoryWhere,
        _count: { _all: true },
        _sum: { onHand: true, reserved: true, actualReserved: true }
      }),
      prisma.branch.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true }
      }),
      prisma.product.groupBy({
        by: ["categoryName"],
        _count: { _all: true },
        orderBy: { _count: { categoryName: "desc" } }
      })
    ]);

    data = {
      snapshotDate,
      items,
      stats,
      branches,
      categories,
      negativeCount: items.filter((item) => toNumber(item.onHand) < 0).length,
      zeroCount: items.filter((item) => toNumber(item.onHand) === 0).length,
      lowCount: items.filter((item) => toNumber(item.onHand) > 0 && toNumber(item.onHand) <= 10).length
    };
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return <DatabaseUnavailable error={error} />;
    }

    throw error;
  }

  const searchSuggestions = data.items.map((item) => ({
    label: item.product.name,
    value: item.product.name,
    meta: `${item.product.code ?? "Không có mã"} · ${item.branch.name} · ${item.product.categoryName ?? "Chưa phân nhóm"}`
  }));

  return (
    <div className="space-y-6">
      <FadeIn className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Tồn kho</h1>
          <p className="mt-2 text-sm text-slate-600">
            Tồn kho theo chi nhánh từ snapshot mới nhất đã đồng bộ từ KiotViet.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <a
            className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
            href={`/api/export/inventory?${new URLSearchParams({
              ...(query ? { q: query } : {}),
              ...(branch ? { branch } : {}),
              ...(category ? { category } : {}),
              ...(stock !== "all" ? { stock } : {})
            }).toString()}`}
          >
            Xuất Excel
          </a>
          <div className="text-sm text-slate-500">Snapshot: {formatDateTime(data.snapshotDate)}</div>
        </div>
      </FadeIn>

      <MotionMetricGrid className="md:grid-cols-4">
        <MetricCard label="Dòng tồn kho" value={formatNumber(data.stats._count._all)} />
        <MetricCard label="Tổng tồn" value={formatNumber(toNumber(data.stats._sum.onHand))} />
        <MetricCard label="Đặt giữ" value={formatNumber(toNumber(data.stats._sum.reserved))} />
        <MetricCard label="Tồn âm / hết" value={`${formatNumber(data.negativeCount)} / ${formatNumber(data.zeroCount)}`} />
      </MotionMetricGrid>

      <AnimatedPanel className="relative z-20" delay={0.04}>
        <Card className="shadow-sm transition-shadow duration-200 hover:shadow-md">
          <CardHeader>
            <CardTitle>Bộ lọc</CardTitle>
          </CardHeader>
          <CardContent>
          <form className="grid gap-3 xl:grid-cols-[1fr_220px_220px_180px_auto]">
            <TableSearch
              baseParams={{
                ...(branch ? { branch } : {}),
                ...(category ? { category } : {}),
                ...(stock !== "all" ? { stock } : {})
              }}
              placeholder="Tìm theo tên hoặc mã sản phẩm"
              suggestions={searchSuggestions}
              value={query}
            />
            <select
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
              defaultValue={branch}
              name="branch"
            >
              <option value="">Tất cả chi nhánh</option>
              {data.branches.map((item) => (
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
              {data.categories.map((item) => (
                <option key={item.categoryName ?? "empty"} value={item.categoryName ?? ""}>
                  {item.categoryName ?? "Chưa phân nhóm"} ({item._count._all})
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
              defaultValue={stock}
              name="stock"
            >
              <option value="all">Tất cả tồn kho</option>
              <option value="negative">Tồn âm</option>
              <option value="zero">Hết hàng</option>
              <option value="low">Tồn thấp</option>
              <option value="available">Còn hàng</option>
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
            <CardTitle>Bảng tồn kho</CardTitle>
          </CardHeader>
          <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1060px] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="px-3 py-2 font-medium">STT</th>
                  <th className="px-3 py-2 font-medium">Sản phẩm</th>
                  <th className="px-3 py-2 font-medium">Nhóm hàng</th>
                  <th className="px-3 py-2 font-medium">Chi nhánh</th>
                  <th className="px-3 py-2 text-right font-medium">Tồn</th>
                  <th className="px-3 py-2 text-right font-medium">Đặt giữ</th>
                  <th className="px-3 py-2 text-right font-medium">Giữ thực tế</th>
                  <th className="px-3 py-2 font-medium">Tình trạng</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-slate-500" colSpan={8}>
                      Không có dòng tồn kho phù hợp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  data.items.map((item, index) => {
                    const onHand = toNumber(item.onHand);

                    return (
                      <AnimatedTableRow
                        key={item.id}
                        className="border-b last:border-0"
                        delay={Math.min(index, 12) * 0.015}
                      >
                        <td className="px-3 py-2 text-slate-500">{index + 1}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-900">{item.product.name}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {item.product.code ?? "Không có mã"} · {item.product.unit ?? "Chưa có đơn vị"}
                          </div>
                        </td>
                        <td className="px-3 py-2">{item.product.categoryName ?? "Chưa phân nhóm"}</td>
                        <td className="px-3 py-2">{item.branch.name}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatNumber(onHand)}</td>
                        <td className="px-3 py-2 text-right">{formatNumber(toNumber(item.reserved))}</td>
                        <td className="px-3 py-2 text-right">{formatNumber(toNumber(item.actualReserved))}</td>
                        <td className="px-3 py-2">
                          <StockBadge onHand={onHand} />
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

function StockBadge({ onHand }: { onHand: number }) {
  if (onHand < 0) {
    return <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700">Tồn âm</span>;
  }

  if (onHand === 0) {
    return <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">Hết hàng</span>;
  }

  if (onHand <= 10) {
    return <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">Tồn thấp</span>;
  }

  return <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Còn hàng</span>;
}

function stockFilter(stock: string): Prisma.InventorySnapshotWhereInput {
  if (stock === "negative") {
    return { onHand: { lt: 0 } };
  }

  if (stock === "zero") {
    return { onHand: 0 };
  }

  if (stock === "low") {
    return { onHand: { gt: 0, lte: 10 } };
  }

  if (stock === "available") {
    return { onHand: { gt: 0 } };
  }

  return {};
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

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
}

function formatDateTime(date: Date | null) {
  if (!date) {
    return "Chưa có dữ liệu";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
