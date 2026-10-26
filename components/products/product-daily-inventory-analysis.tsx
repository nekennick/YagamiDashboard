"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, History, Loader2, RefreshCw, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { kiotVietInternalUseUrl, kiotVietInvoiceUrl, kiotVietPurchaseOrderUrl, kiotVietStocktakeUrl } from "@/lib/kiotviet/links";
import { AdjustmentDialog } from "@/components/inventory/inventory-adjustment-dialog";

type BranchOption = { id: number; name: string };
type Movement = {
  id: number;
  sourceDocumentId: string;
  occurredAt: string;
  sourceType: string;
  documentCode: string | null;
  quantityDelta: number;
  partnerName: string | null;
};
type Row = {
  date: string;
  openingOverride: number | null;
  openingOnHand: number | null;
  openingSnapshotTime?: string | null;
  closingSnapshotTime?: string | null;
  isAcknowledged?: boolean;
  incoming: number;
  outgoing: number;
  transfer: number;
  stocktake: number;
  adjustment: number | null;
  closingOnHand: number | null;
  provisionalClosingOnHand: number | null;
  actualOnHand: number | null;
  variance: number | null;
  dailyVariance: number | null;
  status: "CHƯA KIỂM" | "KHỚP" | "DƯ" | "THIẾU";
  note: string | null;
  confidence: "COMPLETE" | "RECONCILED" | "MISSING_SNAPSHOT";
  updatedAt: string | null;
  movements: Movement[];
};
type AuditRecord = {
  id: number;
  actor: string;
  createdAt: string;
  previous: Record<string, unknown> | null;
  next: Record<string, unknown> | null;
};
type DailyResponse = { branch: BranchOption; product?: { id: number; name: string; code?: string }; rows: Row[] };

export function ProductDailyInventoryAnalysis({
  productId,
  branches,
  initialBranchId
}: {
  productId: number;
  branches: BranchOption[];
  initialBranchId?: string;
}) {
  const defaultRange = useMemo(() => currentMonthRange(), []);
  const defaultBranch =
    (initialBranchId ? branches.find((branch) => String(branch.id) === String(initialBranchId)) : undefined) ??
    branches.find((branch) => {
      const name = normalizeBranchName(branch.name);
      return name.includes("tong kho yagami") || name.includes("cao lanh");
    }) ??
    branches[0];
  const [branchId, setBranchId] = useState(String(defaultBranch?.id ?? ""));
  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);
  const [rows, setRows] = useState<Row[]>([]);
  const [productInfo, setProductInfo] = useState<{ id: number; name: string; code?: string } | null>(null);
  const [loading, setLoading] = useState(Boolean(branches[0]));
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [detailSelection, setDetailSelection] = useState<{ date: string; source: "outgoing" | "incoming" | "transfer" | "stocktake" } | null>(null);
  const [investigateRow, setInvestigateRow] = useState<Row | null>(null);
  const [auditDate, setAuditDate] = useState<string | null>(null);
  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState(branches.length ? "" : "Chưa có kho để phân tích sản phẩm này.");
  const movementGroups = useMemo(() => groupMovementsByDate(rows), [rows]);

  const selectedDetail = useMemo(() => {
    if (!detailSelection) return null;
    const row = rows.find((item) => item.date === detailSelection.date);
    if (!row) return null;
    let movements: Movement[] = [];
    if (detailSelection.source === "transfer") {
      movements = row.movements.filter(isTransferMovement);
    } else if (detailSelection.source === "stocktake") {
      movements = row.movements.filter(isStocktakeMovement);
    } else if (detailSelection.source === "outgoing") {
      movements = row.movements.filter((m) => !isTransferMovement(m) && !isStocktakeMovement(m) && m.quantityDelta < 0);
    } else {
      movements = row.movements.filter((m) => !isTransferMovement(m) && !isStocktakeMovement(m) && m.quantityDelta > 0);
    }
    return { row, movements };
  }, [detailSelection, rows]);

  const selectedDetailDate = detailSelection?.date;
  const selectedDetailSource = detailSelection?.source;

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams({ branchId, from: fromDate, to: toDate });
      const response = await fetch(`/api/products/${productId}/daily-inventory?${params}`, { cache: "no-store" });
      const data = (await response.json()) as DailyResponse & { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Không thể tải phân tích tồn kho.");
      if (data.product) {
        setProductInfo(data.product);
      }
      setRows([...data.rows].sort((left, right) => right.date.localeCompare(left.date)));
    } catch (error) {
      setRows([]);
      setMessage(error instanceof Error ? error.message : "Không thể tải phân tích tồn kho.");
    } finally {
      setLoading(false);
    }
  }, [branchId, fromDate, productId, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedDetailDate || !selectedDetailSource) return;
    detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedDetailDate, selectedDetailSource]);

  const loadAudit = async (date: string) => {
    if (!branchId) return;
    setAuditDate(date);
    setAuditLoading(true);
    try {
      const res = await fetch(`/api/products/${productId}/daily-inventory/${date}/audit?branchId=${branchId}`);
      const data = await res.json();
      setAuditRecords(data.audits || []);
    } catch {
      setAuditRecords([]);
    } finally {
      setAuditLoading(false);
    }
  };

  function patchRow(date: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.date === date ? { ...row, ...patch } : row)));
  }

  async function saveRow(row: Row) {
    if (!branchId || savingDate === row.date) return;
    setSavingDate(row.date);
    setMessage("");
    try {
      const response = await fetch(`/api/products/${productId}/daily-inventory/${row.date}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: Number(branchId),
          openingOverride: row.openingOverride,
          actualOnHand: row.actualOnHand,
          note: row.note,
          expectedUpdatedAt: row.updatedAt
        })
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Không thể lưu dòng kiểm kê.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể lưu dòng kiểm kê.");
    } finally {
      setSavingDate(null);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Phân tích tồn kho theo ngày</CardTitle>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Sổ kho tính từ snapshot chốt lúc 18:00 hôm trước đến 18:00 hôm nay; tồn cuối ngày trước là tồn đầu ngày sau.
            </p>
          </div>
          <Button disabled={loading || !branchId} onClick={() => void load()} variant="secondary">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Làm mới
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            Kho
            <select className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" onChange={(event) => setBranchId(event.target.value)} value={branchId}>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            Từ ngày
            <input className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" max={toDate} onChange={(event) => setFromDate(event.target.value)} type="date" value={fromDate} />
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            Đến ngày
            <input className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" min={fromDate} onChange={(event) => setToDate(event.target.value)} type="date" value={toDate} />
          </label>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-0">
        {message ? <div className="mx-6 mt-5 flex items-start gap-2 rounded-lg bg-warning-50 p-3 text-sm text-warning-800 dark:bg-warning-950/40 dark:text-warning-200"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />{message}</div> : null}
        <div className="overflow-x-auto">
          <table className="min-w-[1550px] w-full border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900/70 dark:text-slate-400">
              <tr>
                {['Ngày', 'Tồn đầu', 'Nhập', 'Xuất', 'Chuyển kho +/-', 'Kiểm kê +/-', 'Điều chỉnh +/-', 'Tồn cuối', 'Tồn thực tế', 'Dư/Thiếu', 'Lệch trong ngày', 'Trạng thái', 'Ghi chú / Lịch sử'].map((title) => <th className="whitespace-nowrap px-3 py-3 font-semibold" key={title}>{title}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-t border-slate-100 align-top dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-900/40 transition-colors" key={row.date}>
                  <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-900 dark:text-white">
                    <div className="flex items-center gap-1.5">
                      <span>{formatDate(row.date)}</span>
                      <button
                        className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer transition-colors"
                        onClick={() => void loadAudit(row.date)}
                        title="Xem lịch sử chỉnh sửa ngày này"
                        type="button"
                      >
                        <History className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="relative group">
                      <EditableNumber
                        onChange={(value) => patchRow(row.date, { openingOnHand: value, openingOverride: value })}
                        onSave={() => void saveRow(row)}
                        value={row.openingOnHand}
                      />
                      {row.openingSnapshotTime ? (
                        <span className="block text-[10px] text-slate-400 mt-0.5" title="Mốc chụp snapshot của Tồn đầu">
                          {formatTimeVN(row.openingSnapshotTime)}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-medium text-emerald-700 dark:text-emerald-300">
                    {row.incoming > 0 ? (
                      <button className="underline decoration-dotted underline-offset-4 cursor-pointer hover:text-emerald-900 dark:hover:text-emerald-200" onClick={() => setDetailSelection({ date: row.date, source: "incoming" })} type="button">
                        {formatNumber(row.incoming)}
                      </button>
                    ) : (
                      formatNumber(row.incoming)
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-medium text-rose-700 dark:text-rose-300">
                    {row.outgoing > 0 ? (
                      <button className="underline decoration-dotted underline-offset-4 cursor-pointer hover:text-rose-900 dark:hover:text-rose-200" onClick={() => setDetailSelection({ date: row.date, source: "outgoing" })} type="button">
                        {formatNumber(row.outgoing)}
                      </button>
                    ) : (
                      formatNumber(row.outgoing)
                    )}
                  </td>
                  <td className={row.transfer === 0 ? "px-3 py-3 text-right" : row.transfer > 0 ? "px-3 py-3 text-right font-medium text-sky-700 dark:text-sky-300" : "px-3 py-3 text-right font-medium text-amber-700 dark:text-amber-300"}>
                    {row.transfer !== 0 ? (
                      <button className="underline decoration-dotted underline-offset-4 cursor-pointer hover:opacity-80" onClick={() => setDetailSelection({ date: row.date, source: "transfer" })} type="button">
                        {formatSignedNumber(row.transfer)}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-medium text-violet-700 dark:text-violet-300">
                    {row.stocktake !== 0 ? (
                      <button
                        className="underline decoration-dotted underline-offset-4 cursor-pointer hover:text-violet-900 dark:hover:text-violet-200"
                        onClick={() => setDetailSelection({ date: row.date, source: "stocktake" })}
                        type="button"
                        title="Bấm để xem danh sách phiếu kiểm kê KiotViet"
                      >
                        {formatSignedNumber(row.stocktake)}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-medium">
                    {row.adjustment === null || Math.abs(row.adjustment) < 0.000001 ? (
                      "—"
                    ) : (
                      <span className="inline-flex items-center gap-1 justify-end">
                        <button
                          className={`underline decoration-dotted underline-offset-4 cursor-pointer font-semibold ${
                            row.isAcknowledged
                              ? "text-slate-400 line-through dark:text-slate-500"
                              : row.adjustment > 0
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-amber-700 dark:text-amber-400"
                          }`}
                          onClick={() => setInvestigateRow(row)}
                          title="Bấm để mở Đối soát chênh lệch & Điều tra KiotViet"
                          type="button"
                        >
                          {formatSignedNumber(row.adjustment)}
                        </button>
                        {row.isAcknowledged ? (
                          <span
                            className="rounded-full bg-emerald-100 px-1 py-0.2 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 cursor-help"
                            title="Đã xác nhận / Ẩn cảnh báo"
                          >
                            ✓
                          </span>
                        ) : null}
                      </span>
                    )}
                  </td>
                  <td
                    className="px-3 py-3 text-right font-semibold"
                    title={row.closingSnapshotTime ? `Snapshot chốt: ${formatTimeVN(row.closingSnapshotTime)}` : row.provisionalClosingOnHand !== null ? "Số tạm tính (chưa có snapshot chốt ca)" : undefined}
                  >
                    {row.closingOnHand !== null ? (
                      <div>
                        <span>{formatNumber(row.closingOnHand)}</span>
                        {row.closingSnapshotTime ? (
                          <span className="block text-[10px] font-normal text-slate-400">
                            {formatTimeVN(row.closingSnapshotTime)}
                          </span>
                        ) : null}
                      </div>
                    ) : row.provisionalClosingOnHand !== null ? (
                      <span className="inline-flex flex-col items-end leading-tight text-amber-700 dark:text-amber-300" title="Số tạm tính, chưa có snapshot chốt cuối ngày">
                        {formatNumber(row.provisionalClosingOnHand)}
                        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide">tt</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2"><EditableNumber onChange={(value) => patchRow(row.date, { actualOnHand: value })} onSave={() => void saveRow(row)} value={row.actualOnHand} /></td>
                  <td className="px-3 py-3 text-right">{formatOptionalSignedNumber(row.variance)}</td>
                  <td className="px-3 py-3 text-right">{formatOptionalSignedNumber(row.dailyVariance)}</td>
                  <td className="px-3 py-3"><StatusBadge confidence={row.confidence} status={row.status} /></td>
                  <td className="px-3 py-2"><input className="h-9 min-w-44 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900" onBlur={() => void saveRow(row)} onChange={(event) => patchRow(row.date, { note: event.target.value || null })} value={row.note ?? ''} /></td>
                </tr>
              ))}
              {!loading && rows.length === 0 ? <tr><td className="px-6 py-8 text-center text-slate-500" colSpan={13}>Chưa có dữ liệu trong khoảng ngày này.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="px-6 pb-6">
          <details className="rounded-xl border border-slate-200 dark:border-slate-700">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-semibold text-slate-900 dark:text-white">
              Chi tiết giao dịch
              <ChevronDown className="h-4 w-4" />
            </summary>
            <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
              <table className="min-w-[620px] w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900/70"><tr><th className="px-4 py-3">Ngày</th><th className="px-4 py-3 text-right">Số giao dịch</th><th className="px-4 py-3">Loại</th><th className="px-4 py-3 text-right">Tổng tăng/giảm</th></tr></thead>
                <tbody>{movementGroups.map((group) => <tr className="border-t border-slate-100 dark:border-slate-800" key={group.date}><td className="px-4 py-3 font-medium">{formatDate(group.date)}</td><td className="px-4 py-3 text-right">{group.count}</td><td className="px-4 py-3">{group.labels}</td><td className={group.quantityDelta >= 0 ? 'px-4 py-3 text-right text-emerald-700' : 'px-4 py-3 text-right text-rose-700'}>{formatSignedNumber(group.quantityDelta)}</td></tr>)}</tbody>
              </table>
            </div>
          </details>
        </div>
      </CardContent>

      {/* Modal chi tiết chứng từ (Nhập / Xuất / Chuyển kho / Kiểm kê) */}
      {selectedDetail ? (
        <div className="mt-3 scroll-mt-6 overflow-hidden rounded-xl border border-indigo-200 bg-indigo-50/40 dark:border-indigo-900 dark:bg-indigo-950/20" ref={detailRef}>
          <div className="flex items-center justify-between gap-3 border-b border-indigo-100 px-4 py-3 dark:border-indigo-900">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">
                {detailSelection?.source === "outgoing"
                  ? "Hóa đơn và chi nhánh liên quan"
                  : detailSelection?.source === "transfer"
                  ? "Phiếu chuyển kho trong ngày"
                  : detailSelection?.source === "stocktake"
                  ? "Phiếu kiểm kho KiotViet trong ngày"
                  : "Phiếu nhập trong ngày"}
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{formatDate(selectedDetail.row.date)} · {selectedDetail.movements.length} chứng từ</p>
            </div>
            <Button onClick={() => setDetailSelection(null)} variant="secondary">Đóng</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="bg-white/70 text-left text-xs uppercase text-slate-500 dark:bg-slate-900/40 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Chứng từ</th>
                  <th className="px-4 py-3">
                    {detailSelection?.source === "outgoing"
                      ? "Chi nhánh / đối tác"
                      : detailSelection?.source === "transfer"
                      ? "Kho liên quan"
                      : detailSelection?.source === "stocktake"
                      ? "Mã phiếu kiểm kê"
                      : "Nhà cung cấp"}
                  </th>
                  <th className="px-4 py-3">Loại</th>
                  <th className="px-4 py-3 text-right">Số lượng</th>
                </tr>
              </thead>
              <tbody>
                {selectedDetail.movements.map((movement) => {
                  const code = movement.documentCode ?? movement.sourceDocumentId;
                  const url = movementLinkUrl(movement.sourceType, movement.documentCode);
                  return (
                    <tr className="border-t border-indigo-100 dark:border-indigo-900" key={movement.id}>
                      <td className="px-4 py-3 font-medium">
                        {url ? (
                          <a className="text-indigo-700 underline decoration-dotted underline-offset-4 hover:text-indigo-900 dark:text-indigo-300 dark:hover:text-indigo-200" href={url} rel="noreferrer" target="_blank">
                            {code}
                          </a>
                        ) : (
                          code
                        )}
                      </td>
                      <td className="px-4 py-3">{movement.partnerName ?? "—"}</td>
                      <td className="px-4 py-3">{movementLabel(movement.sourceType)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatSignedNumber(movement.quantityDelta)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-indigo-100 px-4 py-3 text-right text-sm font-semibold dark:border-indigo-900">
            Tổng: {formatSignedNumber(selectedDetail.movements.reduce((sum, movement) => sum + movement.quantityDelta, 0))}
          </div>
        </div>
      ) : null}

      {/* Modal Điều tra thông minh cho Tab Kiểm tồn */}
      {investigateRow ? (
        <AdjustmentDialog
          isOpen={Boolean(investigateRow)}
          onClose={() => setInvestigateRow(null)}
          productId={productId}
          branchId={Number(branchId)}
          productName={productInfo?.name || "Sản phẩm"}
          operationalDate={investigateRow.date}
          total={investigateRow.adjustment ?? 0}
          isAcknowledged={Boolean(investigateRow.isAcknowledged)}
          onToggleAcknowledge={(prodId, ack) => {
            setRows((current) =>
              current.map((r) =>
                r.date === investigateRow.date ? { ...r, isAcknowledged: ack } : r
              )
            );
          }}
        />
      ) : null}

      {/* Modal Lịch sử chỉnh sửa kiểm toán (Audit Log) */}
      {auditDate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Lịch sử kiểm toán">
          <button aria-label="Đóng" className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs" onClick={() => setAuditDate(null)} type="button" />
          <div className="relative w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <History className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  Lịch sử chỉnh sửa: Ngày {formatDate(auditDate)}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{productInfo?.name || "Sản phẩm"}</p>
              </div>
              <button className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer" onClick={() => setAuditDate(null)} type="button">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 max-h-[60vh] overflow-y-auto space-y-3">
              {auditLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                </div>
              ) : auditRecords.length === 0 ? (
                <p className="text-center text-sm text-slate-500 py-6">Chưa có lượt chỉnh sửa thủ công nào được ghi nhận cho ngày này.</p>
              ) : (
                auditRecords.map((a) => (
                  <div key={a.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/50 text-xs space-y-1">
                    <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-200">
                      <span>Người sửa: {a.actor || "Người dùng"}</span>
                      <span className="text-slate-500 font-mono font-normal">{formatMovementDateTime(a.createdAt)}</span>
                    </div>
                    {a.next ? (
                      <div className="text-slate-600 dark:text-slate-300 pt-1 space-y-0.5">
                        {a.next.openingOverride !== undefined ? (
                          <p>
                            • Tồn đầu chốt: <strong className="text-indigo-600">{String(a.next.openingOverride ?? "Mặc định")}</strong> (cũ: {String(a.previous?.openingOverride ?? "—")})
                          </p>
                        ) : null}
                        {a.next.actualOnHand !== undefined ? (
                          <p>
                            • Tồn thực tế: <strong className="text-indigo-600">{String(a.next.actualOnHand ?? "—")}</strong> (cũ: {String(a.previous?.actualOnHand ?? "—")})
                          </p>
                        ) : null}
                        {a.next.note ? (
                          <p>
                            • Ghi chú: <span className="italic">{String(a.next.note)}</span>
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function EditableNumber({ value, onChange, onSave }: { value: number | null; onChange: (value: number | null) => void; onSave: () => void }) {
  return <input className="h-9 w-28 rounded-md border border-slate-200 bg-white px-2 text-right text-sm dark:border-slate-700 dark:bg-slate-900" onBlur={onSave} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))} type="number" value={value ?? ''} />;
}

function StatusBadge({ status, confidence }: Pick<Row, 'status' | 'confidence'>) {
  const color = status === 'KHỚP' ? 'bg-emerald-50 text-emerald-700' : status === 'DƯ' ? 'bg-sky-50 text-sky-700' : status === 'THIẾU' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600';
  const title = confidence === 'COMPLETE' ? 'Đủ chứng từ và snapshot' : confidence === 'RECONCILED' ? 'Đã đối chiếu snapshot, có điều chỉnh chưa xác định' : 'Thiếu snapshot gần đầu hoặc cuối ngày';
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${color}`} title={title}>{status}</span>;
}

function currentMonthRange() {
  const today = new Date();
  const end = formatIsoDate(today);
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  return { from: formatIsoDate(from), to: end };
}

function groupMovementsByDate(rows: Row[]) {
  const groups = new Map<string, { date: string; count: number; quantityDelta: number; labels: Set<string> }>();
  for (const row of rows) {
    for (const movement of row.movements) {
      const current = groups.get(row.date) ?? { date: row.date, count: 0, quantityDelta: 0, labels: new Set<string>() };
      current.count += 1;
      current.quantityDelta += movement.quantityDelta;
      current.labels.add(movementLabel(movement.sourceType));
      groups.set(row.date, current);
    }
  }

  return [...groups.values()]
    .map((group) => ({ ...group, labels: [...group.labels].join(", ") }))
    .sort((left, right) => right.date.localeCompare(left.date));
}

function formatIsoDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
function normalizeBranchName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function formatDate(value: string) { return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${value}T00:00:00+07:00`)); }
function formatNumber(value: number) { return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value); }
function formatSignedNumber(value: number) { return `${value > 0 ? '+' : ''}${formatNumber(value)}`; }
function movementLinkUrl(sourceType: string, code: string | null) {
  if (!code) return null;
  if (sourceType === "SALE") return kiotVietInvoiceUrl(code);
  if (sourceType === "PURCHASE") return kiotVietPurchaseOrderUrl(code);
  if (sourceType === "INTERNAL_USE") return kiotVietInternalUseUrl(code);
  if (sourceType === "STOCKTAKE") return kiotVietStocktakeUrl(code);
  return null;
}
function isTransferMovement(movement: Movement) { return movement.sourceType === "TRANSFER_OUT" || movement.sourceType === "TRANSFER_IN"; }
function isStocktakeMovement(movement: Movement) { return movement.sourceType === "STOCKTAKE"; }
function formatOptionalSignedNumber(value: number | null) { return value === null ? '—' : formatSignedNumber(value); }
function movementLabel(value: string) { return ({ SALE: 'Bán hàng', PURCHASE: 'Nhập hàng', CUSTOMER_RETURN: 'Khách trả hàng', TRANSFER_OUT: 'Chuyển đi', TRANSFER_IN: 'Chuyển đến', STOCKTAKE: 'Kiểm kê', INTERNAL_USE: 'Xuất dùng nội bộ' } as Record<string, string>)[value] ?? value; }
function formatTimeVN(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(d);
}
function formatMovementDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}
