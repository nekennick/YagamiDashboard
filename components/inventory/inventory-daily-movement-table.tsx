"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  X,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  ShieldCheck,
  RotateCcw
} from "lucide-react";
import {
  kiotVietDamagedGoodsUrl,
  kiotVietInternalUseUrl,
  kiotVietInvoiceUrl,
  kiotVietPurchaseOrderUrl,
  kiotVietStocktakeUrl
} from "@/lib/kiotviet/links";
import type { InvestigationResult } from "@/lib/kiotviet/investigator";

export type InventoryMovementDetail = {
  id: number;
  sourceDocumentId: string;
  sourceType: string;
  documentCode: string | null;
  occurredAt: string;
  quantityDelta: number;
  partnerName: string | null;
};

export type InvoiceChangeDetail = {
  code: string | null;
  previousQuantity: number;
  currentQuantity: number;
  inventoryDelta: number;
  occurredAt: string;
};

export type InventoryDailyMovementTableRow = {
  id: number;
  productId?: number;
  branchId?: number;
  index: number;
  groupName: string;
  isGroupStart: boolean;
  groupRowSpan: number;
  productName: string;
  unit: string;
  openingOnHand: number | null;
  incoming: number;
  outgoing: number;
  transfer: number;
  stocktake: number;
  adjustment: number | null;
  closingOnHand: number | null;
  provisionalClosingOnHand: number | null;
  statusOnHand: number;
  cancelledStocktakes: { code: string; quantityDelta: number; occurredAt: string | null }[];
  invoiceChanges: InvoiceChangeDetail[];
  pendingCount: { difference: number; actualCount: number } | null;
  movements: InventoryMovementDetail[];
};

type DetailSource = "incoming" | "outgoing" | "transfer" | "stocktake" | "adjustment";
type FloatingHeaderState = {
  visible: boolean;
  top: number;
  left: number;
  width: number;
  tableWidth: number;
  scrollLeft: number;
  columnWidths: number[];
};

export function InventoryDailyMovementTable({
  rows,
  operationalDate,
  initialAcknowledgedMap = {}
}: {
  rows: InventoryDailyMovementTableRow[];
  operationalDate?: string;
  initialAcknowledgedMap?: Record<number, { acknowledged: boolean; acknowledgedAt: string; note?: string }>;
}) {
  const [selection, setSelection] = useState<{ row: InventoryDailyMovementTableRow; source: DetailSource } | null>(null);
  const [acknowledgedMap, setAcknowledgedMap] = useState<Record<number, { acknowledged: boolean; acknowledgedAt: string; note?: string }>>(initialAcknowledgedMap);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [floatingHeader, setFloatingHeader] = useState<FloatingHeaderState>({
    visible: false,
    top: 0,
    left: 0,
    width: 0,
    tableWidth: 0,
    scrollLeft: 0,
    columnWidths: []
  });

  // Tải danh sách đã xác nhận nếu chưa có
  useEffect(() => {
    if (Object.keys(initialAcknowledgedMap).length > 0 || rows.length === 0) return;
    const branchId = rows[0]?.branchId ?? 2;
    const date = operationalDate ?? new Date().toISOString().slice(0, 10);
    fetch(`/api/inventory/acknowledgment?branchId=${branchId}&date=${date}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.acknowledgments) {
          setAcknowledgedMap(data.acknowledgments);
        }
      })
      .catch(() => {});
  }, [rows, operationalDate, initialAcknowledgedMap]);

  useEffect(() => {
    if (!selection) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setSelection(null);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selection]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    const updateFloatingHeader = () => {
      const scroll = scrollRef.current;
      const table = tableRef.current;
      if (!scroll || !table) return;
      const header = table.querySelector("thead");
      if (!header) return;
      const appHeaderBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      const headerRect = header.getBoundingClientRect();
      const tableRect = table.getBoundingClientRect();
      const scrollRect = scroll.getBoundingClientRect();
      const visible = headerRect.top < appHeaderBottom && tableRect.bottom > appHeaderBottom + headerRect.height;
      const next: FloatingHeaderState = {
        visible,
        top: Math.max(appHeaderBottom, headerRect.top),
        left: scrollRect.left,
        width: scrollRect.width,
        tableWidth: tableRect.width,
        scrollLeft: scroll.scrollLeft,
        columnWidths: Array.from(header.querySelectorAll("th")).map((th) => th.getBoundingClientRect().width)
      };
      setFloatingHeader(next);
    };
    updateFloatingHeader();
    window.addEventListener("scroll", updateFloatingHeader, { passive: true });
    window.addEventListener("resize", updateFloatingHeader);
    scrollElement?.addEventListener("scroll", updateFloatingHeader, { passive: true });
    return () => {
      window.removeEventListener("scroll", updateFloatingHeader);
      window.removeEventListener("resize", updateFloatingHeader);
      scrollElement?.removeEventListener("scroll", updateFloatingHeader);
    };
  }, []);

  const handleToggleAcknowledge = (productId: number, acknowledged: boolean) => {
    setAcknowledgedMap((prev) => {
      const next = { ...prev };
      if (acknowledged) {
        next[productId] = { acknowledged: true, acknowledgedAt: new Date().toISOString() };
      } else {
        delete next[productId];
      }
      return next;
    });
  };

  return (
    <>
      <div ref={scrollRef} className="overflow-x-auto">
        <div className="inventory-table-capture w-max min-w-full bg-white dark:bg-slate-950">
          <table ref={tableRef} className="inventory-table inventory-daily-table w-full min-w-[1320px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">STT</th>
                <th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">Nhóm hàng</th>
                <th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">Sản phẩm</th>
                <th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">ĐVT</th>
                <th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 text-right font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">Tồn đầu</th>
                <th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 text-right font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">Nhập kho</th>
                <th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 text-right font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">Xuất kho</th>
                <th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 text-right font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">Chuyển kho</th>
                <th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 text-right font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">Kiểm kê +/-</th>
                <th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 text-right font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">Lệch +/-</th>
                <th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 text-right font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">Tồn cuối</th>
                <th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">Tình trạng</th>
                <th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-slate-500" colSpan={13}>
                    Không có dòng tồn kho phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const isAck = Boolean(row.productId && acknowledgedMap[row.productId]);
                  return (
                    <tr className="h-9 border-b last:border-0" key={row.id}>
                      <td className="h-9 px-3 py-0.5 leading-5 text-slate-500">{row.index}</td>
                      {row.isGroupStart ? (
                        <td className="h-9 px-3 py-0.5 align-middle font-semibold leading-5 text-slate-700 dark:text-slate-200" rowSpan={row.groupRowSpan}>
                          {row.groupName}
                        </td>
                      ) : null}
                      <td className="h-9 px-3 py-0.5 leading-5">
                        {row.productId ? (
                          <Link
                            href={`/stocktake?productId=${row.productId}${row.branchId ? `&branchId=${row.branchId}` : ""}`}
                            className="font-medium leading-5 text-slate-900 transition-colors hover:text-indigo-600 hover:underline decoration-indigo-400 underline-offset-2 dark:text-slate-100 dark:hover:text-indigo-400"
                            title={`Mở sổ kiểm tồn cho "${row.productName}"`}
                          >
                            {row.productName}
                          </Link>
                        ) : (
                          <div className="font-medium leading-5 text-slate-900 dark:text-slate-100">{row.productName}</div>
                        )}
                      </td>
                      <td className="h-9 px-3 py-0.5 leading-5">{row.unit}</td>
                      <td className="h-9 px-3 py-0.5 text-right font-medium leading-5">{formatOptionalNumber(row.openingOnHand)}</td>
                      <AmountCell value={row.incoming} onClick={() => setSelection({ row, source: "incoming" })} positive />
                      <AmountCell value={row.outgoing} onClick={() => setSelection({ row, source: "outgoing" })} />
                      <SignedAmountCell value={row.transfer} onClick={() => setSelection({ row, source: "transfer" })} />
                      <PendingStocktakeCell pendingCount={row.pendingCount} value={row.stocktake} onClick={() => setSelection({ row, source: "stocktake" })} />
                      <SignedAmountCell
                        value={row.adjustment}
                        onClick={() => setSelection({ row, source: "adjustment" })}
                        isAcknowledged={isAck}
                      />
                      <td className="h-9 px-3 py-0.5 text-right font-medium leading-5">
                        {formatOptionalNumber(row.closingOnHand ?? row.provisionalClosingOnHand)}
                        {row.closingOnHand === null && row.provisionalClosingOnHand !== null ? (
                          <span className="ml-1 text-[10px] font-medium text-amber-600">tt</span>
                        ) : null}
                      </td>
                      <td className="h-9 px-3 py-0.5 leading-5">
                        <StockBadge onHand={row.statusOnHand} />
                      </td>
                      <td className="h-9 px-3 py-0.5 leading-5 text-slate-600">
                        {isAck ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Đã xác nhận
                          </span>
                        ) : (
                          adjustmentNote(row)
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <FloatingInventoryHeader state={floatingHeader} />
      {selection ? (
        <MovementDialog
          selection={selection}
          onClose={() => setSelection(null)}
          operationalDate={operationalDate}
          isAcknowledged={Boolean(selection.row.productId && acknowledgedMap[selection.row.productId])}
          onToggleAcknowledge={handleToggleAcknowledge}
        />
      ) : null}
    </>
  );
}

function FloatingInventoryHeader({ state }: { state: FloatingHeaderState }) {
  if (!state.visible || state.columnWidths.length !== 13) return null;
  const cells = [
    ["STT", ""],
    ["Nhóm hàng", ""],
    ["Sản phẩm", ""],
    ["ĐVT", ""],
    ["Tồn đầu", "text-right"],
    ["Nhập kho", "text-right"],
    ["Xuất kho", "text-right"],
    ["Chuyển kho", "text-right"],
    ["Kiểm kê +/-", "text-right"],
    ["Lệch +/-", "text-right"],
    ["Tồn cuối", "text-right"],
    ["Tình trạng", ""],
    ["Ghi chú", ""]
  ];
  const content = (
    <div
      className="pointer-events-none fixed z-30 overflow-hidden border-b border-slate-200 bg-slate-50 shadow-md dark:border-slate-700 dark:bg-slate-900"
      style={{ top: state.top, left: state.left, width: state.width }}
    >
      <table
        className="inventory-table border-collapse text-sm"
        style={{ width: state.tableWidth, transform: `translateX(-${state.scrollLeft}px)` }}
      >
        <colgroup>
          {state.columnWidths.map((width, index) => (
            <col key={index} style={{ width }} />
          ))}
        </colgroup>
        <thead>
          <tr className="text-left">
            {cells.map(([label, alignment], index) => (
              <th className={`bg-slate-50 px-3 py-2 font-medium dark:bg-slate-900 ${alignment}`} key={index}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
      </table>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(content, document.body);
}

function AmountCell({ value, onClick, positive = false }: { value: number; onClick: () => void; positive?: boolean }) {
  return (
    <td
      className={`h-9 px-3 py-0.5 text-right leading-5 ${value ? "font-medium" : ""} ${
        positive && value ? "text-emerald-700" : value ? "text-rose-700" : ""
      }`}
    >
      {value ? (
        <button className="underline decoration-dotted underline-offset-4" onClick={onClick} type="button">
          {formatNumber(value)}
        </button>
      ) : (
        formatNumber(value)
      )}
    </td>
  );
}

function SignedAmountCell({
  value,
  onClick,
  isAcknowledged = false
}: {
  value: number | null;
  onClick: () => void;
  isAcknowledged?: boolean;
}) {
  if (value === null || Math.abs(value) < 0.000001) return <td className="h-9 px-3 py-0.5 text-right leading-5">—</td>;
  return (
    <td
      className={`h-9 px-3 py-0.5 text-right font-medium leading-5 ${
        isAcknowledged
          ? "text-slate-400 dark:text-slate-500 line-through"
          : value > 0
          ? "text-emerald-700 dark:text-emerald-400"
          : "text-amber-700 dark:text-amber-400"
      }`}
    >
      <button className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-4" onClick={onClick} type="button">
        <span>{formatSignedNumber(value)}</span>
        {isAcknowledged ? (
          <span
            className="inline-flex items-center rounded-full bg-emerald-100 px-1 py-0.2 text-[10px] font-semibold text-emerald-800 no-underline dark:bg-emerald-950 dark:text-emerald-300"
            title="Đã xác nhận / Ẩn cảnh báo"
          >
            ✓
          </span>
        ) : null}
      </button>
    </td>
  );
}

function PendingStocktakeCell({
  pendingCount,
  value,
  onClick
}: {
  pendingCount: InventoryDailyMovementTableRow["pendingCount"];
  value: number;
  onClick: () => void;
}) {
  if (!pendingCount) return <SignedAmountCell value={value} onClick={onClick} />;
  return (
    <td
      className="h-9 px-3 py-0.5 text-right font-medium leading-5 text-amber-700"
      title={`Kiểm thực tế ${formatNumber(pendingCount.actualCount)} đang chờ cân bằng`}
    >
      <span>{formatSignedNumber(pendingCount.difference)}</span>
      <span className="ml-1 text-[10px]">· Chờ cân bằng</span>
    </td>
  );
}

function MovementDialog({
  selection,
  onClose,
  operationalDate,
  isAcknowledged,
  onToggleAcknowledge
}: {
  selection: { row: InventoryDailyMovementTableRow; source: DetailSource };
  onClose: () => void;
  operationalDate?: string;
  isAcknowledged: boolean;
  onToggleAcknowledge: (productId: number, acknowledged: boolean) => void;
}) {
  const { row, source } = selection;
  const movements =
    source === "adjustment"
      ? []
      : row.movements.filter((movement) =>
          source === "transfer"
            ? isTransfer(movement.sourceType)
            : source === "stocktake"
            ? movement.sourceType === "STOCKTAKE"
            : source === "incoming"
            ? !isTransfer(movement.sourceType) && movement.sourceType !== "STOCKTAKE" && movement.quantityDelta > 0
            : !isTransfer(movement.sourceType) && movement.sourceType !== "STOCKTAKE" && movement.quantityDelta < 0
        );
  const title =
    source === "incoming"
      ? "Phiếu nhập liên quan"
      : source === "outgoing"
      ? "Hóa đơn, phiếu xuất dùng và xuất hủy"
      : source === "transfer"
      ? "Phiếu chuyển kho liên quan"
      : source === "stocktake"
      ? "Phiếu kiểm kê liên quan"
      : "Đối soát chênh lệch kho & Điều tra KiotViet";
  const total = source === "adjustment" ? row.adjustment ?? 0 : movements.reduce((sum, movement) => sum + movement.quantityDelta, 0);

  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Đóng" className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs" onClick={onClose} type="button" />
      <div className="relative w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              {source === "adjustment" ? <ShieldCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" /> : null}
              {title}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {row.productName} · {source === "adjustment" ? `Mức lệch: ${formatSignedNumber(total)}` : `${movements.length} mục liên quan`}
            </p>
          </div>
          <button aria-label="Đóng" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>

        {source === "adjustment" ? (
          <AdjustmentContent
            row={row}
            total={total}
            operationalDate={operationalDate}
            isAcknowledged={isAcknowledged}
            onToggleAcknowledge={onToggleAcknowledge}
          />
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3">Chứng từ</th>
                  <th className="px-5 py-3">Thời gian</th>
                  <th className="px-5 py-3">Đối tác / kho</th>
                  <th className="px-5 py-3">Loại</th>
                  <th className="px-5 py-3 text-right">Số lượng</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr className="border-t border-slate-100 dark:border-slate-800" key={movement.id}>
                    <td className="px-5 py-3 font-medium">
                      {movementUrl(movement) ? (
                        <a
                          className="text-indigo-700 underline decoration-dotted underline-offset-4 hover:text-indigo-900 dark:text-indigo-400"
                          href={movementUrl(movement)!}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {movement.documentCode ?? movement.sourceDocumentId}
                        </a>
                      ) : (
                        movement.documentCode ?? movement.sourceDocumentId
                      )}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300 font-mono text-xs">
                      {formatMovementDateTime(movement.occurredAt)}
                    </td>
                    <td className="px-5 py-3">{movement.partnerName ?? "—"}</td>
                    <td className="px-5 py-3">{movementLabel(movement.sourceType)}</td>
                    <td className="px-5 py-3 text-right font-semibold">{formatSignedNumber(movement.quantityDelta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-between text-sm font-semibold dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="text-xs font-normal text-slate-500">
            {source === "adjustment" ? "Hệ thống tự động tra soát thẻ kho & KiotViet API" : "Tổng biến động trong ca"}
          </div>
          <div>Tổng: {formatSignedNumber(total)}</div>
        </div>
      </div>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(content, document.body);
}

function AdjustmentContent({
  row,
  total,
  operationalDate,
  isAcknowledged,
  onToggleAcknowledge
}: {
  row: InventoryDailyMovementTableRow;
  total: number;
  operationalDate?: string;
  isAcknowledged: boolean;
  onToggleAcknowledge: (productId: number, acknowledged: boolean) => void;
}) {
  const [investigating, setInvestigating] = useState(false);
  const [investigation, setInvestigation] = useState<InvestigationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ackLoading, setAckLoading] = useState(false);

  const handleInvestigate = async () => {
    setInvestigating(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: row.productId,
          branchId: row.branchId,
          operationalDate,
          adjustment: total
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể thực hiện điều tra");
      }
      setInvestigation(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lỗi không xác định khi điều tra");
    } finally {
      setInvestigating(false);
    }
  };

  useEffect(() => {
    handleInvestigate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.productId, row.branchId, operationalDate, total]);

  const handleToggleAck = async () => {
    if (!row.productId) return;
    setAckLoading(true);
    try {
      const nextAck = !isAcknowledged;
      const res = await fetch("/api/inventory/acknowledgment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: row.productId,
          branchId: row.branchId,
          date: operationalDate || new Date().toISOString().slice(0, 10),
          acknowledged: nextAck
        })
      });
      if (res.ok) {
        onToggleAcknowledge(row.productId, nextAck);
      }
    } finally {
      setAckLoading(false);
    }
  };

  return (
    <div className="space-y-4 px-5 py-5 text-sm text-slate-700 dark:text-slate-200 max-h-[70vh] overflow-y-auto">
      {/* Thông tin đối chiếu cơ bản */}
      <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-200 dark:bg-slate-800/60 dark:border-slate-700/60 text-xs space-y-1.5">
        <p>
          <span className="font-semibold text-slate-900 dark:text-white">Nguồn đối soát:</span> Đối chiếu snapshot chốt tồn lúc 17:00 trên KiotViet.
        </p>
        <p>
          <span className="font-semibold text-slate-900 dark:text-white">Công thức:</span> Tồn cuối snapshot trừ (Tồn đầu + Nhập − Xuất + Chuyển kho + Kiểm kê).
        </p>
        <p className="font-medium text-slate-900 dark:text-white pt-1">
          Chênh lệch snapshot thực tế: <span className="font-bold text-sm text-indigo-600 dark:text-indigo-400">{formatSignedNumber(total)}</span>
        </p>
      </div>

      {/* Hiển thị lỗi nếu có */}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300 flex items-start gap-2">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
          <div>
            <p className="font-semibold">Lỗi điều tra KiotViet:</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
        </div>
      ) : null}

      {/* Kết quả điều tra sâu thời gian thực hoặc đang tải */}
      {investigating && !investigation ? (
        <div className="flex flex-col items-center justify-center p-8 space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400" />
          <div className="text-center">
            <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">
              Đang điều tra thời gian thực trên KiotViet API...
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Đối soát thẻ kho, lịch sử hủy/sửa hóa đơn và phân tích bước nhảy snapshot
            </p>
          </div>
        </div>
      ) : investigation ? (
        <div className="space-y-3">
          <div
            className={`rounded-xl border p-4 shadow-xs ${
              investigation.found
                ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/30"
                : "border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/30"
            }`}
          >
            <div className="flex items-start gap-2.5">
              {investigation.found ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              )}
              <div className="flex-1">
                <p className="font-bold text-slate-900 dark:text-white text-base">
                  {investigation.found ? "KẾT QUẢ ĐIỀU TRA KIOTVIET THỜI GIAN THỰC" : "KẾT QUẢ ĐIỀU TRA"}
                </p>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{investigation.summary}</p>
              </div>
            </div>

            {/* Bằng chứng bước nhảy thẻ kho */}
            {investigation.snapshotJump ? (
              <div className="mt-3 rounded-lg border border-slate-200/80 bg-white/80 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300">
                <span className="font-semibold text-slate-900 dark:text-white">⏱️ Bằng chứng Thẻ kho (Snapshot):</span> Lúc{" "}
                <span className="font-mono font-medium">{formatMovementDateTime(investigation.snapshotJump.beforeTime)}</span> số tồn đang là{" "}
                <span className="font-semibold">{formatNumber(investigation.snapshotJump.beforeOnHand)}</span>, đến{" "}
                <span className="font-mono font-medium">{formatMovementDateTime(investigation.snapshotJump.afterTime)}</span> số tồn thay đổi thành{" "}
                <span className="font-semibold">{formatNumber(investigation.snapshotJump.afterOnHand)}</span> (biến động ròng giữa 2 lần chụp:{" "}
                <span className="font-bold text-indigo-600 dark:text-indigo-400">{formatSignedNumber(investigation.snapshotJump.delta)}</span>).
                {investigation.snapshotJump.explanation ? (
                  <div className="mt-2.5 rounded bg-indigo-50/70 p-2.5 text-indigo-950 dark:bg-indigo-950/40 dark:text-indigo-200 border border-indigo-100 dark:border-indigo-900/50">
                    💡 <strong>Giải thích chi tiết:</strong> {investigation.snapshotJump.explanation}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Danh sách chứng từ can thiệp */}
            {investigation.suspectDocuments.length > 0 ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Chứng từ gây ra chênh lệch ({investigation.suspectDocuments.length} chứng từ):
                </p>
                <div className="space-y-2">
                  {investigation.suspectDocuments.map((doc, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs dark:border-slate-700 dark:bg-slate-900"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                              doc.action === "CANCELLED"
                                ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                                : "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
                            }`}
                          >
                            {doc.action === "CANCELLED" ? "ĐÃ HỦY" : "CHỈNH SỬA"}
                          </span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {doc.kiotVietUrl ? (
                              <a
                                href={doc.kiotVietUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 hover:underline decoration-dotted dark:text-indigo-400"
                              >
                                {doc.code} <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              doc.code
                            )}
                          </span>
                          {doc.replacementCode ? (
                            <span className="text-xs text-slate-500">
                              (Thay thế bởi: <strong className="text-slate-700 dark:text-slate-300">{doc.replacementCode}</strong>)
                            </span>
                          ) : null}
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                            Ảnh hưởng tồn: {formatSignedNumber(doc.quantityDelta)}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400 border-t border-slate-100 pt-2 dark:border-slate-800">
                        <div>
                          <span className="font-medium text-slate-700 dark:text-slate-300">Thời điểm thao tác:</span>{" "}
                          {formatMovementDateTime(doc.actionTime)}
                        </div>
                        <div>
                          <span className="font-medium text-slate-700 dark:text-slate-300">Người thực hiện:</span>{" "}
                          {doc.operatorName || "—"}
                        </div>
                        <div>
                          <span className="font-medium text-slate-700 dark:text-slate-300">Khách hàng / Đối tác:</span>{" "}
                          {doc.partnerName || "—"}
                        </div>
                        <div>
                          <span className="font-medium text-slate-700 dark:text-slate-300">Chi nhánh:</span>{" "}
                          {doc.branchName || "—"}
                        </div>
                      </div>

                      {doc.note ? (
                        <p className="mt-2 text-xs italic text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-2 rounded-md">
                          💡 {doc.note}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        /* Khi chưa có kết quả điều tra KiotViet trực tiếp */
        <div className="space-y-3">
          {row.invoiceChanges.length ? (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-3 text-indigo-950 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-200">
              <p className="font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                Hóa đơn hủy / sửa khớp với mức chênh lệch
              </p>
              <ul className="mt-2 space-y-1.5 text-xs">
                {row.invoiceChanges.map((change, index) => (
                  <li key={`${change.code}-${index}`} className="flex items-center justify-between border-t border-indigo-200/50 pt-1 dark:border-indigo-800/50">
                    <div>
                      {change.code ? (
                        <a
                          className="font-bold text-indigo-700 underline decoration-dotted underline-offset-4 hover:text-indigo-900 dark:text-indigo-400"
                          href={kiotVietInvoiceUrl(change.code)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {change.code}
                        </a>
                      ) : (
                        "Hóa đơn chưa có mã"
                      )}
                      <span className="ml-2 text-slate-600 dark:text-slate-400">
                        (Hủy đơn / điều chỉnh đơn)
                      </span>
                    </div>
                    <div className="font-semibold text-indigo-700 dark:text-indigo-300">
                      Hoàn tồn: {formatSignedNumber(change.inventoryDelta)}
                      {change.occurredAt ? ` (${formatMovementDateTime(change.occurredAt)})` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {row.cancelledStocktakes.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              <p className="font-semibold">Phiếu kiểm kho đã hủy trong ca</p>
              <ul className="mt-2 space-y-1 text-xs">
                {row.cancelledStocktakes.map((stocktake) => (
                  <li key={stocktake.code}>
                    <a
                      className="font-medium text-indigo-700 underline decoration-dotted underline-offset-4 hover:text-indigo-900 dark:text-indigo-400"
                      href={kiotVietStocktakeUrl(stocktake.code)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {stocktake.code}
                    </a>{" "}
                    <span>
                      — {formatSignedNumber(stocktake.quantityDelta)}
                      {stocktake.occurredAt ? ` (${formatMovementDateTime(stocktake.occurredAt)})` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!row.invoiceChanges.length && !row.cancelledStocktakes.length ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
              Chưa có dữ liệu phân tích. Vui lòng bấm &quot;Điều tra chuyên sâu KiotViet&quot; bên dưới để kiểm tra trực tiếp.
            </div>
          ) : null}
        </div>
      )}

      {/* Thanh hành động chính */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
        <button
          onClick={handleInvestigate}
          disabled={investigating}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-indigo-700 active:scale-98 transition-all disabled:opacity-60 cursor-pointer"
          type="button"
        >
          {investigating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Đang truy quét KiotViet API...</span>
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              <span>{investigation ? "Quét lại KiotViet" : "🔍 Điều tra chuyên sâu KiotViet"}</span>
            </>
          )}
        </button>

        <button
          onClick={handleToggleAck}
          disabled={ackLoading}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold border transition-all cursor-pointer ${
            isAcknowledged
              ? "border-slate-300 text-slate-700 bg-slate-100 hover:bg-slate-200 dark:border-slate-700 dark:text-slate-300 dark:bg-slate-800"
              : "border-emerald-600 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
          }`}
          type="button"
        >
          {ackLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isAcknowledged ? (
            <RotateCcw className="h-3.5 w-3.5" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          <span>{isAcknowledged ? "Bỏ xác nhận (Hiện lại cảnh báo)" : "✓ Đã xác nhận / Ẩn cảnh báo"}</span>
        </button>
      </div>
    </div>
  );
}

function adjustmentNote(row: InventoryDailyMovementTableRow) {
  if (!row.adjustment || Math.abs(row.adjustment) < 0.000001) return "—";
  if (row.invoiceChanges.length) {
    const codes = [...new Set(row.invoiceChanges.map((item) => item.code ?? "—"))].join(", ");
    return `Sửa hóa đơn ${codes} (${formatSignedNumber(row.adjustment)})`;
  }
  if (row.cancelledStocktakes.length) {
    return `Phiếu kiểm kho đã hủy ${row.cancelledStocktakes.map((item) => item.code).join(", ")} (${formatSignedNumber(
      row.adjustment
    )})`;
  }
  return "—";
}

function movementUrl(movement: InventoryMovementDetail) {
  if (!movement.documentCode) return null;
  if (movement.sourceType === "SALE") return kiotVietInvoiceUrl(movement.documentCode);
  if (movement.sourceType === "PURCHASE") return kiotVietPurchaseOrderUrl(movement.documentCode);
  if (movement.sourceType === "STOCKTAKE") return kiotVietStocktakeUrl(movement.documentCode);
  if (movement.sourceType === "INTERNAL_USE") return kiotVietInternalUseUrl(movement.documentCode);
  if (movement.sourceType === "DAMAGED_GOODS") return kiotVietDamagedGoodsUrl(movement.documentCode);
  return null;
}

function isTransfer(sourceType: string) {
  return sourceType === "TRANSFER_OUT" || sourceType === "TRANSFER_IN";
}

function movementLabel(value: string) {
  return (
    ({
      SALE: "Bán hàng",
      PURCHASE: "Nhập hàng",
      CUSTOMER_RETURN: "Khách trả hàng",
      TRANSFER_OUT: "Chuyển đi",
      TRANSFER_IN: "Chuyển đến",
      STOCKTAKE: "Kiểm kê",
      INTERNAL_USE: "Xuất dùng nội bộ",
      DAMAGED_GOODS: "Xuất hủy"
    } as Record<string, string>)[value] ?? value
  );
}

function formatMovementDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }
  return `${map.hour}:${map.minute} ${map.day}/${map.month}/${map.year}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
}

function formatSignedNumber(value: number) {
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

function formatOptionalNumber(value: number | null) {
  return value === null ? "—" : formatNumber(value);
}

function StockBadge({ onHand }: { onHand: number }) {
  if (onHand < 0) return <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700">Tồn âm</span>;
  if (onHand === 0) return <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">Hết hàng</span>;
  if (onHand <= 10) return <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">Tồn thấp</span>;
  return <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Còn hàng</span>;
}
