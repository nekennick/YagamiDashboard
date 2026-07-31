import { Prisma } from "@prisma/client";
import { DatabaseUnavailable, isDatabaseConnectionError } from "@/components/layout/database-unavailable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedPanel, AnimatedTableRow, FadeIn, MotionMetricCard, MotionMetricGrid } from "@/components/ui/motion-primitives";
import { TableSearch } from "@/components/ui/table-search";
import { InventoryGroupManager } from "@/components/inventory/inventory-group-manager";
import { prisma } from "@/lib/prisma";
import { normalizeWarehouseFilter, warehouseBranchWhere, warehouseFilterOptions, warehouseSelectClassName } from "@/lib/warehouse-filter";
import { inventoryStorageOptions, normalizeInventoryStorage } from "@/lib/inventory-storage";

type InventoryPageProps = {
  searchParams?: Promise<{
    q?: string;
    branch?: string;
    warehouse?: string;
    storage?: string;
    stock?: string;
  }>;
};

const inventoryPageSize = 20;

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  const params = (await searchParams) ?? {};
  const query = params.q?.trim() ?? "";
  const warehouse = normalizeWarehouseFilter(params.warehouse ?? params.branch);
  const storage = normalizeInventoryStorage(params.storage);
  const stock = params.stock?.trim() ?? "all";

  let data;

  try {
    const latestInventoryDate = await prisma.inventorySnapshot.aggregate({
      _max: { snapshotDate: true }
    });
    const snapshotDate = latestInventoryDate._max.snapshotDate;
    const branchWhere = warehouseBranchWhere(warehouse);
    const productWhere: Prisma.ProductWhereInput | undefined = query || storage
      ? {
          ...(storage ? { manualGroupAssignment: { is: { group: { storageArea: storage } } } } : {}),
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
      : undefined;
    const inventoryWhere: Prisma.InventorySnapshotWhereInput = {
      ...(snapshotDate ? { snapshotDate } : {}),
      ...(branchWhere ? { branch: branchWhere } : {}),
      ...(productWhere ? { product: productWhere } : {}),
      ...stockFilter(stock)
    };

    const [unsortedItems, stats] = await Promise.all([
      prisma.inventorySnapshot.findMany({
        where: inventoryWhere,
        include: {
          product: { select: { code: true, name: true, categoryName: true, unit: true, isActive: true, manualGroupAssignment: { select: { position: true, group: { select: { name: true, position: true, storageArea: true } } } } } },
          branch: { select: { id: true, name: true } }
        },
        orderBy: [{ product: { name: "asc" } }],
        take: inventoryPageSize
      }),
      prisma.inventorySnapshot.aggregate({
        where: inventoryWhere,
        _count: { _all: true },
        _sum: { onHand: true, reserved: true, actualReserved: true }
      })
    ]);

    const items = unsortedItems.sort((left, right) => {
      const leftGroup = left.product.manualGroupAssignment?.group;
      const rightGroup = right.product.manualGroupAssignment?.group;
      const leftGroupPosition = leftGroup?.position ?? Number.MAX_SAFE_INTEGER;
      const rightGroupPosition = rightGroup?.position ?? Number.MAX_SAFE_INTEGER;
      if (leftGroupPosition !== rightGroupPosition) return leftGroupPosition - rightGroupPosition;

      const leftProductPosition = left.product.manualGroupAssignment?.position ?? Number.MAX_SAFE_INTEGER;
      const rightProductPosition = right.product.manualGroupAssignment?.position ?? Number.MAX_SAFE_INTEGER;
      if (leftProductPosition !== rightProductPosition) return leftProductPosition - rightProductPosition;

      return left.product.name.localeCompare(right.product.name, "vi");
    });

    data = {
      snapshotDate,
      items,
      stats,
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
    meta: `${item.product.code ?? "Không có mã"} · ${item.branch.name} · ${item.product.manualGroupAssignment?.group.name ?? "Chưa phân nhóm"}`
  }));
  const groupNameForItem = (item: (typeof data.items)[number]) => item.product.manualGroupAssignment?.group.name ?? "Chưa phân nhóm";

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
              ...(warehouse ? { warehouse } : {}),
              ...(storage ? { storage } : {}),
              ...(stock !== "all" ? { stock } : {})
            }).toString()}`}
          >
            Xuất Excel
          </a>
          <div className="text-sm text-slate-500">Snapshot: {formatDateTime(data.snapshotDate)}</div>
        </div>
      </FadeIn>

      <InventoryGroupManager />

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
          <form className="grid gap-3 xl:grid-cols-[1fr_190px_220px_180px_auto]">
            <TableSearch
              baseParams={{
                ...(warehouse ? { warehouse } : {}),
                ...(storage ? { storage } : {}),
                ...(stock !== "all" ? { stock } : {})
              }}
              placeholder="Tìm theo tên hoặc mã sản phẩm"
              suggestions={searchSuggestions}
              value={query}
            />
            <select
              className={warehouseSelectClassName()}
              defaultValue={warehouse}
              name="warehouse"
            >
              <option value="">Tất cả kho</option>
              {warehouseFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
              defaultValue={storage ?? ""}
              name="storage"
            >
              <option value="">Tất cả khu kho</option>
              {inventoryStorageOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
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
            <table className="inventory-table w-full min-w-[1120px] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="px-3 py-2 font-medium">STT</th>
                  <th className="px-3 py-2 font-medium">Nhóm hàng</th>
                  <th className="px-3 py-2 font-medium">Sản phẩm</th>
                  <th className="px-3 py-2 font-medium">ĐVT</th>
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
                    <td className="px-3 py-8 text-center text-slate-500" colSpan={9}>
                      Không có dòng tồn kho phù hợp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  data.items.map((item, index) => {
                    const onHand = toNumber(item.onHand);
                    const groupName = groupNameForItem(item);
                    const isGroupStart = index === 0 || groupNameForItem(data.items[index - 1]) !== groupName;
                    const nextGroupOffset = data.items.slice(index).findIndex((candidate) => groupNameForItem(candidate) !== groupName);
                    const groupRowSpan = nextGroupOffset === -1 ? data.items.length - index : nextGroupOffset;

                    return (
                      <AnimatedTableRow
                        key={item.id}
                        className="h-9 border-b last:border-0"
                        delay={Math.min(index, 12) * 0.015}
                      >
                        <td className="h-9 px-3 py-0.5 leading-5 text-slate-500">{index + 1}</td>
                        {isGroupStart ? <td className="h-9 px-3 py-0.5 align-middle font-semibold leading-5 text-slate-700 dark:text-slate-200" rowSpan={groupRowSpan}>{groupName}</td> : null}
                        <td className="h-9 px-3 py-0.5 leading-5">
                          <div className="font-medium leading-5 text-slate-900">{item.product.name}</div>
                        </td>
                        <td className="h-9 px-3 py-0.5 leading-5">{item.product.unit ?? "-"}</td>
                        <td className="h-9 px-3 py-0.5 leading-5">{item.branch.name}</td>
                        <td className="h-9 px-3 py-0.5 text-right font-medium leading-5">{formatNumber(onHand)}</td>
                        <td className="h-9 px-3 py-0.5 text-right leading-5">{formatNumber(toNumber(item.reserved))}</td>
                        <td className="h-9 px-3 py-0.5 text-right leading-5">{formatNumber(toNumber(item.actualReserved))}</td>
                        <td className="h-9 px-3 py-0.5 leading-5">
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
