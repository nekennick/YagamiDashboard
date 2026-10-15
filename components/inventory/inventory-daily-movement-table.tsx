"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { kiotVietInternalUseUrl, kiotVietInvoiceUrl, kiotVietPurchaseOrderUrl, kiotVietStocktakeUrl } from "@/lib/kiotviet/links";

export type InventoryMovementDetail = { id: number; sourceDocumentId: string; sourceType: string; documentCode: string | null; occurredAt: string; quantityDelta: number; partnerName: string | null };
export type InvoiceChangeDetail = { code: string | null; previousQuantity: number; currentQuantity: number; inventoryDelta: number; occurredAt: string };

export type InventoryDailyMovementTableRow = {
  id: number; index: number; groupName: string; isGroupStart: boolean; groupRowSpan: number; productName: string; unit: string;
  openingOnHand: number | null; incoming: number; outgoing: number; transfer: number; stocktake: number; adjustment: number | null;
  closingOnHand: number | null; provisionalClosingOnHand: number | null; statusOnHand: number;
  cancelledStocktakes: { code: string; quantityDelta: number; occurredAt: string | null }[];
  invoiceChanges: InvoiceChangeDetail[];
  movements: InventoryMovementDetail[];
};

type DetailSource = "incoming" | "outgoing" | "transfer" | "stocktake" | "adjustment";
type FloatingHeaderState = { visible: boolean; top: number; left: number; width: number; tableWidth: number; scrollLeft: number; columnWidths: number[] };

export function InventoryDailyMovementTable({ rows }: { rows: InventoryDailyMovementTableRow[] }) {
  const [selection, setSelection] = useState<{ row: InventoryDailyMovementTableRow; source: DetailSource } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [floatingHeader, setFloatingHeader] = useState<FloatingHeaderState>({ visible: false, top: 0, left: 0, width: 0, tableWidth: 0, scrollLeft: 0, columnWidths: [] });
  useEffect(() => { if (!selection) return; const close = (event: KeyboardEvent) => event.key === "Escape" && setSelection(null); window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [selection]);
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
        top: appHeaderBottom,
        left: scrollRect.left,
        width: scrollRect.width,
        tableWidth: tableRect.width,
        scrollLeft: scroll.scrollLeft,
        columnWidths: Array.from(header.querySelectorAll("th")).map((cell) => cell.getBoundingClientRect().width)
      };
      setFloatingHeader((current) => current.visible === next.visible && current.top === next.top && current.left === next.left && current.width === next.width && current.tableWidth === next.tableWidth && current.scrollLeft === next.scrollLeft ? current : next);
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
  }, [rows]);

  return <>
    <div ref={scrollRef} className="overflow-x-auto"><div className="inventory-table-capture w-max min-w-full bg-white dark:bg-slate-950"><table ref={tableRef} className="inventory-table inventory-daily-table w-full min-w-[1320px] border-collapse text-sm">
      <thead><tr className="border-b bg-slate-50 text-left">
        <th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">STT</th><th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">Nhóm hàng</th><th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">Sản phẩm</th><th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">ĐVT</th>
        <th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 text-right font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">Tồn đầu</th><th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 text-right font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">Nhập kho</th><th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 text-right font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">Xuất kho</th><th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 text-right font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">Chuyển kho</th><th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 text-right font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">Kiểm kê +/-</th><th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 text-right font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">Lệch +/-</th><th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 text-right font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">Tồn cuối</th><th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">Tình trạng</th><th className="sticky top-16 z-20 bg-slate-50 px-3 py-2 font-medium shadow-sm lg:top-[76px] dark:bg-slate-900">Ghi chú</th>
      </tr></thead>
      <tbody>{rows.length === 0 ? <tr><td className="px-3 py-8 text-center text-slate-500" colSpan={13}>Không có dòng tồn kho phù hợp với bộ lọc.</td></tr> : rows.map((row) => <tr className="h-9 border-b last:border-0" key={row.id}>
        <td className="h-9 px-3 py-0.5 leading-5 text-slate-500">{row.index}</td>
        {row.isGroupStart ? <td className="h-9 px-3 py-0.5 align-middle font-semibold leading-5 text-slate-700 dark:text-slate-200" rowSpan={row.groupRowSpan}>{row.groupName}</td> : null}
        <td className="h-9 px-3 py-0.5 leading-5"><div className="font-medium leading-5 text-slate-900">{row.productName}</div></td><td className="h-9 px-3 py-0.5 leading-5">{row.unit}</td>
        <td className="h-9 px-3 py-0.5 text-right font-medium leading-5">{formatOptionalNumber(row.openingOnHand)}</td>
        <AmountCell value={row.incoming} onClick={() => setSelection({ row, source: "incoming" })} positive /><AmountCell value={row.outgoing} onClick={() => setSelection({ row, source: "outgoing" })} />
        <SignedAmountCell value={row.transfer} onClick={() => setSelection({ row, source: "transfer" })} /><SignedAmountCell value={row.stocktake} onClick={() => setSelection({ row, source: "stocktake" })} /><SignedAmountCell value={row.adjustment} onClick={() => setSelection({ row, source: "adjustment" })} />
        <td className="h-9 px-3 py-0.5 text-right font-medium leading-5">{formatOptionalNumber(row.closingOnHand ?? row.provisionalClosingOnHand)}{row.closingOnHand === null && row.provisionalClosingOnHand !== null ? <span className="ml-1 text-[10px] font-medium text-amber-600">tạm tính</span> : null}</td>
        <td className="h-9 px-3 py-0.5 leading-5"><StockBadge onHand={row.statusOnHand} /></td><td className="h-9 px-3 py-0.5 leading-5 text-slate-600">{adjustmentNote(row)}</td>
      </tr>)}</tbody>
    </table></div></div>
    <FloatingInventoryHeader state={floatingHeader} />
    {selection ? <MovementDialog selection={selection} onClose={() => setSelection(null)} /> : null}
  </>;
}

function FloatingInventoryHeader({ state }: { state: FloatingHeaderState }) {
  if (!state.visible || state.columnWidths.length !== 13) return null;
  const cells = [
    ["STT", ""], ["Nhóm hàng", ""], ["Sản phẩm", ""], ["ĐVT", ""], ["Tồn đầu", "text-right"], ["Nhập kho", "text-right"], ["Xuất kho", "text-right"], ["Chuyển kho", "text-right"], ["Kiểm kê +/-", "text-right"], ["Lệch +/-", "text-right"], ["Tồn cuối", "text-right"], ["Tình trạng", ""], ["Ghi chú", ""]
  ];
  const content = <div className="pointer-events-none fixed z-30 overflow-hidden border-b border-slate-200 bg-slate-50 shadow-md dark:border-slate-700 dark:bg-slate-900" style={{ top: state.top, left: state.left, width: state.width }}>
    <table className="inventory-table border-collapse text-sm" style={{ width: state.tableWidth, transform: `translateX(-${state.scrollLeft}px)` }}>
      <colgroup>{state.columnWidths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
      <thead><tr className="text-left">{cells.map(([label, alignment], index) => <th className={`bg-slate-50 px-3 py-2 font-medium dark:bg-slate-900 ${alignment}`} key={index}>{label}</th>)}</tr></thead>
    </table>
  </div>;
  return typeof document === "undefined" ? null : createPortal(content, document.body);
}

function AmountCell({ value, onClick, positive = false }: { value: number; onClick: () => void; positive?: boolean }) { return <td className={`h-9 px-3 py-0.5 text-right leading-5 ${value ? "font-medium" : ""} ${positive && value ? "text-emerald-700" : value ? "text-rose-700" : ""}`}>{value ? <button className="underline decoration-dotted underline-offset-4" onClick={onClick} type="button">{formatNumber(value)}</button> : formatNumber(value)}</td>; }
function SignedAmountCell({ value, onClick }: { value: number | null; onClick: () => void }) { if (value === null || Math.abs(value) < 0.000001) return <td className="h-9 px-3 py-0.5 text-right leading-5">—</td>; return <td className={`h-9 px-3 py-0.5 text-right font-medium leading-5 ${value > 0 ? "text-emerald-700" : "text-amber-700"}`}><button className="underline decoration-dotted underline-offset-4" onClick={onClick} type="button">{formatSignedNumber(value)}</button></td>; }

function MovementDialog({ selection, onClose }: { selection: { row: InventoryDailyMovementTableRow; source: DetailSource }; onClose: () => void }) {
  const { row, source } = selection;
  const movements = source === "adjustment" ? [] : row.movements.filter((movement) => source === "transfer" ? isTransfer(movement.sourceType) : source === "stocktake" ? movement.sourceType === "STOCKTAKE" : source === "incoming" ? !isTransfer(movement.sourceType) && movement.sourceType !== "STOCKTAKE" && movement.quantityDelta > 0 : !isTransfer(movement.sourceType) && movement.sourceType !== "STOCKTAKE" && movement.quantityDelta < 0);
  const title = source === "incoming" ? "Phiếu nhập liên quan" : source === "outgoing" ? "Hóa đơn và phiếu xuất dùng nội bộ" : source === "transfer" ? "Phiếu chuyển kho liên quan" : source === "stocktake" ? "Phiếu kiểm kê liên quan" : row.invoiceChanges.length ? "Chênh snapshot do chỉnh sửa hóa đơn" : row.cancelledStocktakes.length ? "Chênh snapshot do phiếu kiểm kho đã hủy" : "Chênh snapshot chưa xác định";
  const total = source === "adjustment" ? row.adjustment ?? 0 : movements.reduce((sum, movement) => sum + movement.quantityDelta, 0);
  const content = <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
    <button aria-label="Đóng" className="absolute inset-0 bg-slate-950/40" onClick={onClose} type="button" /><div className="relative w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700"><div><h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3><p className="mt-1 text-sm text-slate-500">{row.productName} · {movements.length || (source === "adjustment" ? row.invoiceChanges.length || row.cancelledStocktakes.length || 1 : 0)} mục liên quan</p></div><button aria-label="Đóng" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" onClick={onClose} type="button"><X className="h-5 w-5" /></button></div>
      {source === "adjustment" ? <AdjustmentContent row={row} total={total} /> : <div className="max-h-[60vh] overflow-auto"><table className="w-full min-w-[620px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Chứng từ</th><th className="px-5 py-3">Đối tác / kho</th><th className="px-5 py-3">Loại</th><th className="px-5 py-3 text-right">Số lượng</th></tr></thead><tbody>{movements.map((movement) => <tr className="border-t border-slate-100" key={movement.id}><td className="px-5 py-3 font-medium">{movementUrl(movement) ? <a className="text-indigo-700 underline decoration-dotted underline-offset-4 hover:text-indigo-900" href={movementUrl(movement)!} rel="noreferrer" target="_blank">{movement.documentCode ?? movement.sourceDocumentId}</a> : movement.documentCode ?? movement.sourceDocumentId}</td><td className="px-5 py-3">{movement.partnerName ?? "—"}</td><td className="px-5 py-3">{movementLabel(movement.sourceType)}</td><td className="px-5 py-3 text-right font-semibold">{formatSignedNumber(movement.quantityDelta)}</td></tr>)}</tbody></table></div>}
      <div className="border-t border-slate-200 px-5 py-3 text-right text-sm font-semibold dark:border-slate-700">Tổng: {formatSignedNumber(total)}</div>
    </div></div>;
  return typeof document === "undefined" ? null : createPortal(content, document.body);
}

function AdjustmentContent({ row, total }: { row: InventoryDailyMovementTableRow; total: number }) { return <div className="space-y-3 px-5 py-5 text-sm text-slate-700 dark:text-slate-200"><p><span className="font-medium">Nguồn:</span> đối chiếu snapshot chốt tồn lúc 17:00.</p><p><span className="font-medium">Cách tính:</span> tồn cuối snapshot trừ (tồn đầu + nhập − xuất + chuyển kho + kiểm kê).</p>{row.invoiceChanges.length ? <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-indigo-950"><p className="font-semibold">Nguyên nhân: hóa đơn đã được chỉnh sửa sau đồng bộ</p><ul className="mt-1 space-y-1">{row.invoiceChanges.map((change, index) => <li key={`${change.code}-${index}`}>{change.code ? <a className="font-medium text-indigo-700 underline decoration-dotted underline-offset-4 hover:text-indigo-900" href={kiotVietInvoiceUrl(change.code)} rel="noreferrer" target="_blank">{change.code}</a> : "Hóa đơn chưa có mã"} <span>— xuất {formatNumber(change.previousQuantity)} → {formatNumber(change.currentQuantity)}, ảnh hưởng tồn {formatSignedNumber(change.inventoryDelta)}</span></li>)}</ul></div> : null}{row.cancelledStocktakes.length ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950"><p className="font-semibold">Nguyên nhân: phiếu kiểm kho đã hủy</p><ul className="mt-1 space-y-1">{row.cancelledStocktakes.map((stocktake) => <li key={stocktake.code}><a className="font-medium text-indigo-700 underline decoration-dotted underline-offset-4 hover:text-indigo-900" href={kiotVietStocktakeUrl(stocktake.code)} rel="noreferrer" target="_blank">{stocktake.code}</a> <span>— {formatSignedNumber(stocktake.quantityDelta)}</span></li>)}</ul><p className="mt-2 text-xs">Phiếu hủy không được cộng vào cột Kiểm kê; thông tin này chỉ dùng để giải thích chênh snapshot.</p></div> : null}<p className="font-semibold">Chênh snapshot: {formatSignedNumber(total)}</p></div>; }
function adjustmentNote(row: InventoryDailyMovementTableRow) { if (!row.adjustment || Math.abs(row.adjustment) < 0.000001) return "—"; if (row.invoiceChanges.length) return `Chỉnh sửa hóa đơn ${row.invoiceChanges.map((item) => item.code ?? "—").join(", ")} (${formatSignedNumber(row.adjustment)})`; if (row.cancelledStocktakes.length) return `Phiếu kiểm kho đã hủy ${row.cancelledStocktakes.map((item) => item.code).join(", ")} (${formatSignedNumber(row.adjustment)})`; return "—"; }
function movementUrl(movement: InventoryMovementDetail) { if (!movement.documentCode) return null; if (movement.sourceType === "SALE") return kiotVietInvoiceUrl(movement.documentCode); if (movement.sourceType === "PURCHASE") return kiotVietPurchaseOrderUrl(movement.documentCode); if (movement.sourceType === "STOCKTAKE") return kiotVietStocktakeUrl(movement.documentCode); if (movement.sourceType === "INTERNAL_USE") return kiotVietInternalUseUrl(movement.documentCode); return null; }
function isTransfer(sourceType: string) { return sourceType === "TRANSFER_OUT" || sourceType === "TRANSFER_IN"; }
function movementLabel(value: string) { return ({ SALE: "Bán hàng", PURCHASE: "Nhập hàng", CUSTOMER_RETURN: "Khách trả hàng", TRANSFER_OUT: "Chuyển đi", TRANSFER_IN: "Chuyển đến", STOCKTAKE: "Kiểm kê", INTERNAL_USE: "Xuất dùng nội bộ" } as Record<string, string>)[value] ?? value; }
function formatNumber(value: number) { return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value); }
function formatSignedNumber(value: number) { return `${value > 0 ? "+" : ""}${formatNumber(value)}`; }
function formatOptionalNumber(value: number | null) { return value === null ? "—" : formatNumber(value); }
function StockBadge({ onHand }: { onHand: number }) { if (onHand < 0) return <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700">Tồn âm</span>; if (onHand === 0) return <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">Hết hàng</span>; if (onHand <= 10) return <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">Tồn thấp</span>; return <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Còn hàng</span>; }
