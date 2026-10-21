import { Prisma } from "@prisma/client";
import { FileSpreadsheet, Clock } from "lucide-react";
import { DatabaseUnavailable, isDatabaseConnectionError } from "@/components/layout/database-unavailable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedPanel, AnimatedTableRow, FadeIn, MotionMetricCard, MotionMetricGrid } from "@/components/ui/motion-primitives";
import { TableSearch } from "@/components/ui/table-search";
import { InventoryGroupManager } from "@/components/inventory/inventory-group-manager";
import { InventoryAutoSelect } from "@/components/inventory/inventory-auto-select";
import { InventoryDatePicker } from "@/components/inventory/inventory-date-picker";
import { InventoryScreenshotButton } from "@/components/inventory/inventory-screenshot-button";
import { InventoryQuickCategoryButtons } from "@/components/inventory/inventory-quick-category-buttons";
import { InventoryDailyMovementTable, type InventoryDailyMovementTableRow } from "@/components/inventory/inventory-daily-movement-table";
import { calculateProvisionalClosing, closestSnapshotTo, operationalDayEnd, operationalDayStart } from "@/lib/inventory-ledger";
import { inventoryCategoryFilter, inventoryCategoryQuickFilters, quickFilterProductOrder } from "@/lib/inventory-category-filter";
import { prisma } from "@/lib/prisma";
import { normalizeWarehouseFilter, warehouseBranchWhere, warehouseFilterOptions, warehouseSelectClassName } from "@/lib/warehouse-filter";

type InventoryPageProps = {
  searchParams?: Promise<{
    q?: string;
    branch?: string;
    warehouse?: string;
    category?: string;
    stock?: string;
    date?: string;
  }>;
};

const inventoryPageSize = 200;
const defaultInventoryWarehouse = "CAO_LANH";
const defaultInventoryCategory = "HÀNG ĐÔNG LẠNH";

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  const params = (await searchParams) ?? {};
  const query = params.q?.trim() ?? "";
  const warehouse = normalizeWarehouseFilter(params.warehouse ?? params.branch ?? defaultInventoryWarehouse);
  const category = params.category === undefined ? defaultInventoryCategory : params.category.trim();
  const stock = params.stock?.trim() ?? "all";
  const operationalDate = isBusinessDate(params.date) ? params.date : formatBusinessDate(new Date());

  let data;

  try {
    const latestInventoryDate = await prisma.inventorySnapshot.aggregate({
      _max: { snapshotDate: true }
    });
    const snapshotDate = latestInventoryDate._max.snapshotDate;
    const branchWhere = warehouseBranchWhere(warehouse);
    const productWhere: Prisma.ProductWhereInput = {
      isActive: true,
      ...(category ? inventoryCategoryFilter(category) : {}),
      ...(query
        ? {
          OR: [
            { name: { contains: query } },
            { code: { contains: query } },
            { fullName: { contains: query } }
          ]
        }
        : {})
    };
    const inventoryWhere: Prisma.InventorySnapshotWhereInput = {
      ...(snapshotDate ? { snapshotDate } : {}),
      ...(branchWhere ? { branch: branchWhere } : {}),
      product: productWhere,
      ...stockFilter(stock)
    };

    const [unsortedItems, stats, categories] = await Promise.all([
      prisma.inventorySnapshot.findMany({
        where: inventoryWhere,
        include: {
          product: { select: { id: true, code: true, name: true, categoryName: true, unit: true, isActive: true, manualGroupAssignment: { select: { position: true, group: { select: { name: true, position: true, storageArea: true } } } } } },
          branch: { select: { id: true, name: true } }
        },
        orderBy: [{ product: { name: "asc" } }],
        take: inventoryPageSize
      }),
      prisma.inventorySnapshot.aggregate({
        where: inventoryWhere,
        _count: { _all: true },
        _sum: { onHand: true, reserved: true, actualReserved: true }
      }),
      prisma.product.groupBy({
        by: ["categoryName"],
        where: { isActive: true, categoryName: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { categoryName: "desc" } }
      })
    ]);

    const quickProductOrder = quickFilterProductOrder(category);
    const items = unsortedItems.sort((left, right) => {
      if (quickProductOrder) {
        const leftIndex = quickProductOrder.get(`${left.product.name.toLocaleLowerCase()}\u0000${(left.product.unit ?? "").toLocaleLowerCase()}`) ?? Number.MAX_SAFE_INTEGER;
        const rightIndex = quickProductOrder.get(`${right.product.name.toLocaleLowerCase()}\u0000${(right.product.unit ?? "").toLocaleLowerCase()}`) ?? Number.MAX_SAFE_INTEGER;
        if (leftIndex !== rightIndex) return leftIndex - rightIndex;
      }
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

    const operationalStart = operationalDayStart(operationalDate);
    const operationalEnd = operationalDayEnd(operationalDate);
    const selectedProductIds = [...new Set(items.map((item) => item.productId))];
    const selectedBranchIds = [...new Set(items.map((item) => item.branchId))];
    const [dailySnapshots, dailyMovements, cancelledStocktakeLines, invoiceItemChanges, pendingCountLines] = selectedProductIds.length === 0
      ? [[], [], [], [], []]
      : await Promise.all([
        prisma.inventorySnapshot.findMany({
          where: {
            productId: { in: selectedProductIds },
            branchId: { in: selectedBranchIds },
            snapshotDate: {
              gte: new Date(operationalStart.getTime() - 2 * 60 * 60 * 1000),
              lte: new Date(operationalEnd.getTime() + 2 * 60 * 60 * 1000)
            }
          },
          select: { productId: true, branchId: true, snapshotDate: true, onHand: true },
          orderBy: { snapshotDate: "asc" }
        }),
        prisma.inventoryMovement.findMany({
          where: {
            productId: { in: selectedProductIds },
            branchId: { in: selectedBranchIds },
            isActive: true,
            occurredAt: { gte: operationalStart, lt: operationalEnd }
          },
          select: { id: true, productId: true, branchId: true, sourceDocumentId: true, sourceType: true, documentCode: true, occurredAt: true, quantityDelta: true, partnerName: true }
        }),
        prisma.stocktakeLine.findMany({
          where: {
            isActive: true,
            productId: { in: selectedProductIds },
            adjustmentValue: { not: 0 },
            stocktakeDocument: {
              branchId: { in: selectedBranchIds },
              status: 0,
              OR: [
                { sourceModifiedAt: { gte: operationalStart, lt: operationalEnd } },
                { sourceModifiedAt: null, sourceCreatedAt: { gte: operationalStart, lt: operationalEnd } }
              ]
            }
          },
          select: {
            productId: true,
            adjustmentValue: true,
            stocktakeDocument: { select: { branchId: true, code: true, sourceCreatedAt: true } }
          }
        }),
        prisma.invoiceItemChange.findMany({
          where: {
            productId: { in: selectedProductIds },
            branchId: { in: selectedBranchIds },
            detectedAt: { gte: operationalStart, lt: operationalEnd }
          },
          select: {
            productId: true,
            branchId: true,
            invoiceCode: true,
            previousQuantity: true,
            currentQuantity: true,
            inventoryDelta: true,
            detectedAt: true
          }
        }),
        prisma.inventoryCountLine.findMany({
          where: {
            productId: { in: selectedProductIds },
            status: "QUEUED",
            session: { branchId: { in: selectedBranchIds }, status: "APPROVED" }
          },
          select: { productId: true, difference: true, actualCount: true, session: { select: { branchId: true } } }
        })
      ]);
    const saleDocumentIds = [...new Set(dailyMovements.filter((movement) => movement.sourceType === "SALE" && !movement.partnerName).map((movement) => Number(movement.sourceDocumentId)).filter(Number.isInteger))];
    const saleInvoices = saleDocumentIds.length === 0 ? [] : await prisma.invoice.findMany({
      where: { kvInvoiceId: { in: saleDocumentIds } },
      select: { kvInvoiceId: true, customer: { select: { code: true, name: true } } }
    });
    const salePartnerByDocumentId = new Map(saleInvoices.map((invoice) => [String(invoice.kvInvoiceId), invoice.customer ? [invoice.customer.code, invoice.customer.name].filter(Boolean).join(" ") : null]));
    const enrichedDailyMovements = dailyMovements.map((movement) => movement.sourceType === "SALE" && !movement.partnerName ? { ...movement, partnerName: salePartnerByDocumentId.get(movement.sourceDocumentId) ?? null } : movement);
    const snapshotsByProductBranch = groupByProductBranch(dailySnapshots);
    const movementsByProductBranch = groupByProductBranch(enrichedDailyMovements);
    const cancelledStocktakesByProductBranch = groupByProductBranch(cancelledStocktakeLines.filter((line) => line.productId !== null && line.stocktakeDocument.branchId !== null).map((line) => ({
      productId: line.productId!,
      branchId: line.stocktakeDocument.branchId!,
      code: line.stocktakeDocument.code,
      quantityDelta: toNumber(line.adjustmentValue),
      occurredAt: line.stocktakeDocument.sourceCreatedAt?.toISOString() ?? null
    })));
    const invoiceChangesByProductBranch = groupByProductBranch(invoiceItemChanges.filter((line) => line.productId !== null && line.branchId !== null).map((line) => ({
      productId: line.productId!,
      branchId: line.branchId!,
      code: line.invoiceCode,
      previousQuantity: toNumber(line.previousQuantity),
      currentQuantity: toNumber(line.currentQuantity),
      inventoryDelta: toNumber(line.inventoryDelta),
      occurredAt: line.detectedAt.toISOString()
    })));
    const pendingCountByProductBranch = new Map(pendingCountLines.map((line) => [
      productBranchKey(line.productId, line.session.branchId),
      { difference: toNumber(line.difference), actualCount: toNumber(line.actualCount) }
    ]));
    const dailyByInventoryId = new Map(items.map((item) => {
      const key = productBranchKey(item.productId, item.branchId);
      const snapshots = snapshotsByProductBranch.get(key) ?? [];
      const movements = movementsByProductBranch.get(key) ?? [];
      const openingSnapshot = closestSnapshotTo(snapshots, operationalStart);
      const closingSnapshot = closestSnapshotTo(snapshots, operationalEnd);
      const transfer = sum(movements.filter((movement) => isTransferMovement(movement.sourceType)).map((movement) => toNumber(movement.quantityDelta)));
      const stocktake = sum(movements.filter((movement) => isStocktakeMovement(movement.sourceType)).map((movement) => toNumber(movement.quantityDelta)));
      const incoming = sum(movements.filter((movement) => !isTransferMovement(movement.sourceType) && !isStocktakeMovement(movement.sourceType) && toNumber(movement.quantityDelta) > 0).map((movement) => toNumber(movement.quantityDelta)));
      const outgoing = Math.abs(sum(movements.filter((movement) => !isTransferMovement(movement.sourceType) && !isStocktakeMovement(movement.sourceType) && toNumber(movement.quantityDelta) < 0).map((movement) => toNumber(movement.quantityDelta))));
      const openingOnHand = openingSnapshot ? toNumber(openingSnapshot.onHand) : null;
      const closingOnHand = closingSnapshot ? toNumber(closingSnapshot.onHand) : null;
      const adjustment = openingOnHand !== null && closingOnHand !== null
        ? closingOnHand - (openingOnHand + incoming - outgoing + transfer + stocktake)
        : null;
      const cancelledStocktakes = (cancelledStocktakesByProductBranch.get(key) ?? [])
        .filter((line) => adjustment !== null && Math.abs(line.quantityDelta - adjustment) < 0.000001);
      const invoiceChanges = (invoiceChangesByProductBranch.get(key) ?? [])
        .filter((line) => adjustment !== null && Math.abs(line.inventoryDelta - adjustment) < 0.000001);

      return [item.id, {
        openingOnHand,
        incoming,
        outgoing,
        transfer,
        stocktake,
        adjustment,
        closingOnHand,
        provisionalClosingOnHand: closingOnHand === null && openingOnHand !== null
          ? calculateProvisionalClosing(openingOnHand, incoming, outgoing, transfer, stocktake)
          : null,
        cancelledStocktakes,
        invoiceChanges,
        pendingCount: pendingCountByProductBranch.get(key) ?? null,
        movements: movements.map((movement) => ({
          id: movement.id,
          sourceDocumentId: movement.sourceDocumentId,
          sourceType: movement.sourceType,
          documentCode: movement.documentCode,
          occurredAt: movement.occurredAt.toISOString(),
          quantityDelta: toNumber(movement.quantityDelta),
          partnerName: movement.partnerName
        }))
      }];
    }));

    data = {
      snapshotDate,
      operationalDate,
      items,
      dailyByInventoryId,
      stats,
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
    meta: `${item.product.code ?? "Không có mã"} · ${item.branch.name} · ${item.product.manualGroupAssignment?.group.name ?? "Chưa phân nhóm"}`
  }));
  const groupNameForItem = (item: (typeof data.items)[number]) => item.product.manualGroupAssignment?.group.name ?? "Chưa phân nhóm";
  const screenshotRows = data.items.map((item, index) => {
    const daily = data.dailyByInventoryId.get(item.id);
    const closingOnHand = daily?.closingOnHand ?? daily?.provisionalClosingOnHand ?? toNumber(item.onHand);

    return {
      index: index + 1,
      groupName: groupNameForItem(item),
      productName: item.product.name,
      unit: item.product.unit ?? "-",
      openingOnHand: formatInventoryNumber(daily?.openingOnHand ?? null),
      incoming: formatNumber(daily?.incoming ?? 0),
      outgoing: formatNumber(daily?.outgoing ?? 0),
      transfer: formatSignedNumber(daily?.transfer ?? 0),
      stocktake: formatSignedNumber(daily?.stocktake ?? 0),
      adjustment: formatNullableSignedNumber(daily?.adjustment ?? null),
      closingOnHand: formatInventoryNumber(daily?.closingOnHand ?? daily?.provisionalClosingOnHand ?? null),
      closingOnHandValue: closingOnHand
    };
  });
  const tableRows: InventoryDailyMovementTableRow[] = data.items.map((item, index) => {
    const daily = data.dailyByInventoryId.get(item.id);
    const groupName = groupNameForItem(item);
    const isGroupStart = index === 0 || groupNameForItem(data.items[index - 1]) !== groupName;
    const nextGroupOffset = data.items.slice(index).findIndex((candidate) => groupNameForItem(candidate) !== groupName);
    const closingOnHand = daily?.closingOnHand ?? daily?.provisionalClosingOnHand;

    return {
      id: item.id,
      productId: item.productId,
      branchId: item.branchId,
      index: index + 1,
      groupName,
      isGroupStart,
      groupRowSpan: nextGroupOffset === -1 ? data.items.length - index : nextGroupOffset,
      productName: item.product.name,
      unit: item.product.unit ?? "-",
      openingOnHand: daily?.openingOnHand ?? null,
      incoming: daily?.incoming ?? 0,
      outgoing: daily?.outgoing ?? 0,
      transfer: daily?.transfer ?? 0,
      stocktake: daily?.stocktake ?? 0,
      adjustment: daily?.adjustment ?? null,
      closingOnHand: daily?.closingOnHand ?? null,
      provisionalClosingOnHand: daily?.provisionalClosingOnHand ?? null,
      statusOnHand: closingOnHand ?? toNumber(item.onHand),
      cancelledStocktakes: daily?.cancelledStocktakes ?? [],
      invoiceChanges: daily?.invoiceChanges ?? [],
      pendingCount: daily?.pendingCount ?? null,
      movements: daily?.movements ?? []
    };
  });

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
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-emerald-200/90 bg-emerald-50/80 px-3.5 text-xs font-semibold text-emerald-800 shadow-2xs transition-all hover:bg-emerald-100/90 hover:border-emerald-300 hover:shadow-xs active:scale-[0.98] dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
            href={`/api/export/inventory?${new URLSearchParams({
              ...(query ? { q: query } : {}),
              ...(warehouse ? { warehouse } : {}),
              ...(category ? { category } : {}),
              ...(stock !== "all" ? { stock } : {})
            }).toString()}`}
            title="Xuất dữ liệu tồn kho ra file Excel"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>Xuất Excel</span>
          </a>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Clock className="h-3 w-3 text-slate-400" />
            <span>Snapshot: {formatDateTime(data.snapshotDate)}</span>
          </div>
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
            <InventoryQuickCategoryButtons filters={inventoryCategoryQuickFilters} value={category} />
            <form className="grid gap-3 xl:grid-cols-[1fr_190px_220px_220px_180px]">
              <TableSearch
                baseParams={{
                  ...(warehouse ? { warehouse } : {}),
                  ...(category ? { category } : {}),
                  ...(params.date ? { date: operationalDate } : {}),
                  ...(stock !== "all" ? { stock } : {})
                }}
                placeholder="Tìm theo tên hoặc mã sản phẩm"
                suggestions={searchSuggestions}
                value={query}
              />
              <InventoryAutoSelect
                ariaLabel="Kho"
                className={warehouseSelectClassName()}
                name="warehouse"
                options={[{ value: "", label: "Tất cả kho" }, ...warehouseFilterOptions]}
                value={warehouse}
              />
              <InventoryDatePicker value={operationalDate} max={formatBusinessDate(new Date())} />
              <InventoryAutoSelect
                ariaLabel="Nhóm hàng"
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                name="category"
                options={[{ value: "", label: "Tất cả nhóm hàng" }, ...data.categories.map((option) => ({ value: option.categoryName ?? "", label: `${option.categoryName} (${option._count._all})` }))]}
                value={category}
              />
              <InventoryAutoSelect
                ariaLabel="Trạng thái tồn"
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
                name="stock"
                options={[
                  { value: "all", label: "Tất cả tồn kho" },
                  { value: "negative", label: "Tồn âm" },
                  { value: "zero", label: "Hết hàng" },
                  { value: "low", label: "Tồn thấp" },
                  { value: "available", label: "Còn hàng" }
                ]}
                value={stock}
              />
            </form>
          </CardContent>
        </Card>
      </AnimatedPanel>

      <AnimatedPanel className="relative z-10" delay={0.08}>
        <Card className="shadow-sm transition-shadow duration-200 hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Bảng tồn kho</CardTitle>
              <p className="mt-1 text-xs font-normal text-slate-500">Biến động ngày {formatDate(data.operationalDate)} · Từ 17:00 hôm trước đến 17:00 hôm nay</p>
            </div>
            <InventoryScreenshotButton
              rows={screenshotRows}
              snapshotLabel={`Biến động ngày ${formatDate(data.operationalDate)} · 17:00 hôm trước–17:00 hôm nay`}
            />
          </CardHeader>
          <CardContent>
            <InventoryDailyMovementTable rows={tableRows} />
            <div className="hidden overflow-x-auto">
              <div className="inventory-table-capture w-max min-w-full bg-white dark:bg-slate-950">
                <table className="inventory-table w-full min-w-[1220px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left">
                      <th className="px-3 py-2 font-medium">STT</th>
                      <th className="px-3 py-2 font-medium">Nhóm hàng</th>
                      <th className="px-3 py-2 font-medium">Sản phẩm</th>
                      <th className="px-3 py-2 font-medium">ĐVT</th>
                      <th className="px-3 py-2 text-right font-medium">Tồn đầu</th>
                      <th className="px-3 py-2 text-right font-medium">Nhập kho</th>
                      <th className="px-3 py-2 text-right font-medium">Xuất kho</th>
                      <th className="px-3 py-2 text-right font-medium">Chuyển kho</th>
                      <th className="px-3 py-2 text-right font-medium">Lệch +/-</th>
                      <th className="px-3 py-2 text-right font-medium">Tồn cuối</th>
                      <th className="px-3 py-2 font-medium">Tình trạng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.length === 0 ? (
                      <tr>
                        <td className="px-3 py-8 text-center text-slate-500" colSpan={11}>
                          Không có dòng tồn kho phù hợp với bộ lọc.
                        </td>
                      </tr>
                    ) : (
                      data.items.map((item, index) => {
                        const onHand = toNumber(item.onHand);
                        const daily = data.dailyByInventoryId.get(item.id);
                        const closingOnHand = daily?.closingOnHand ?? daily?.provisionalClosingOnHand;
                        const statusOnHand = closingOnHand ?? onHand;
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
                            <td className="h-9 px-3 py-0.5 text-right font-medium leading-5">{formatInventoryNumber(daily?.openingOnHand ?? null)}</td>
                            <td className="h-9 px-3 py-0.5 text-right leading-5">{formatNumber(daily?.incoming ?? 0)}</td>
                            <td className="h-9 px-3 py-0.5 text-right leading-5">{formatNumber(daily?.outgoing ?? 0)}</td>
                            <td className="h-9 px-3 py-0.5 text-right leading-5">{formatSignedNumber(daily?.transfer ?? 0)}</td>
                            <td className="h-9 px-3 py-0.5 text-right font-medium leading-5">{formatNullableSignedNumber(daily?.adjustment ?? null)}</td>
                            <td className="h-9 px-3 py-0.5 text-right font-medium leading-5">
                              {formatInventoryNumber(closingOnHand ?? null)}
                              {daily?.closingOnHand === null && daily?.provisionalClosingOnHand !== null ? <span className="ml-1 text-[10px] font-medium text-amber-600">tt</span> : null}
                            </td>
                            <td className="h-9 px-3 py-0.5 leading-5">
                              <StockBadge onHand={statusOnHand} />
                            </td>
                          </AnimatedTableRow>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
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

function formatInventoryNumber(value: number | null) {
  return value === null ? "—" : formatNumber(value);
}

function formatSignedNumber(value: number) {
  if (value === 0) return "—";
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

function formatNullableSignedNumber(value: number | null) {
  return value === null ? "—" : formatSignedNumber(value);
}

function productBranchKey(productId: number, branchId: number) {
  return `${productId}:${branchId}`;
}

function groupByProductBranch<T extends { productId: number; branchId: number }>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = productBranchKey(row.productId, row.branchId);
    const values = groups.get(key) ?? [];
    values.push(row);
    groups.set(key, values);
  }
  return groups;
}

function isTransferMovement(sourceType: string) {
  return sourceType === "TRANSFER_OUT" || sourceType === "TRANSFER_IN";
}

function isStocktakeMovement(sourceType: string) {
  return sourceType === "STOCKTAKE";
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function formatBusinessDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return `${map.get("year")}-${map.get("month")}-${map.get("day")}`;
}

function isBusinessDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
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
