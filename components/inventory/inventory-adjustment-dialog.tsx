"use client";

import { useEffect, useState } from "react";
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
import { kiotVietInvoiceUrl, kiotVietStocktakeUrl } from "@/lib/kiotviet/links";
import type { InvestigationResult } from "@/lib/kiotviet/investigator";

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}

function formatSignedNumber(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${new Intl.NumberFormat("vi-VN").format(value)}`;
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

export type AdjustmentDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  productId?: number;
  branchId?: number;
  productName: string;
  operationalDate?: string;
  total: number;
  isAcknowledged: boolean;
  onToggleAcknowledge: (productId: number, acknowledged: boolean) => void;
  invoiceChanges?: Array<{
    code: string | null;
    previousQuantity: number;
    currentQuantity: number;
    inventoryDelta: number;
    occurredAt: string;
  }>;
  cancelledStocktakes?: Array<{
    code: string;
    quantityDelta: number;
    occurredAt: string | null;
  }>;
};

export function AdjustmentDialog({
  isOpen,
  onClose,
  productId,
  branchId,
  productName,
  operationalDate,
  total,
  isAcknowledged,
  onToggleAcknowledge,
  invoiceChanges = [],
  cancelledStocktakes = []
}: AdjustmentDialogProps) {
  const [investigating, setInvestigating] = useState(false);
  const [investigation, setInvestigation] = useState<InvestigationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ackLoading, setAckLoading] = useState(false);

  const handleInvestigate = async (forceRefresh = false) => {
    if (!productId || !branchId) return;
    setInvestigating(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          branchId,
          operationalDate,
          adjustment: total,
          forceRefresh
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
    if (isOpen && productId && branchId) {
      handleInvestigate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, productId, branchId, operationalDate, total]);

  const handleToggleAck = async () => {
    if (!productId || !branchId) return;
    setAckLoading(true);
    try {
      const nextAck = !isAcknowledged;
      const res = await fetch("/api/inventory/acknowledgment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          branchId,
          date: operationalDate || new Date().toISOString().slice(0, 10),
          acknowledged: nextAck
        })
      });
      if (res.ok) {
        onToggleAcknowledge(productId, nextAck);
      }
    } finally {
      setAckLoading(false);
    }
  };

  if (!isOpen) return null;

  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Đối soát chênh lệch kho & Điều tra KiotViet">
      <button aria-label="Đóng" className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs" onClick={onClose} type="button" />
      <div className="relative w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              Đối soát chênh lệch kho & Điều tra KiotViet
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {productName} · Mức lệch: {formatSignedNumber(total)}
            </p>
          </div>
          <button aria-label="Đóng" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5 text-sm text-slate-700 dark:text-slate-200 max-h-[70vh] overflow-y-auto">
          {/* Thông tin đối chiếu cơ bản */}
          <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-200 dark:bg-slate-800/60 dark:border-slate-700/60 text-xs space-y-1.5">
            <p>
              <span className="font-semibold text-slate-900 dark:text-white">Nguồn đối soát:</span> Đối chiếu snapshot chốt tồn lúc 18:00 trên KiotViet.
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
                  Đối soát thẻ kho, lịch sử hủy/sửa chứng từ và phân tích bước nhảy snapshot
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
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-slate-900 dark:text-white text-base">
                        {investigation.found ? "KẾT QUẢ ĐIỀU TRA KIOTVIET THỜI GIAN THỰC" : "KẾT QUẢ ĐIỀU TRA"}
                      </p>
                      {investigation.fromCache && (
                        <span className="rounded-md bg-emerald-100/80 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                          ⚡ Đã lưu đệm
                        </span>
                      )}
                    </div>
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
                                    : doc.action === "BACKDATED"
                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                    : doc.action === "CREATED"
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                    : "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
                                }`}
                              >
                                {doc.action === "CANCELLED"
                                  ? "ĐÃ HỦY"
                                  : doc.action === "BACKDATED"
                                  ? "LẬP LÙI NGÀY"
                                  : doc.action === "CREATED"
                                  ? "LỆCH GIAO THỜI"
                                  : "CHỈNH SỬA"}
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
                              <span className="font-medium text-slate-700 dark:text-slate-300">
                                {doc.action === "BACKDATED" ? "Thời điểm tạo thực tế:" : "Thời điểm thao tác:"}
                              </span>{" "}
                              {formatMovementDateTime(doc.actionTime)}
                            </div>
                            <div>
                              <span className="font-medium text-slate-700 dark:text-slate-300">Người thực hiện:</span>{" "}
                              {doc.operatorName || "—"}
                            </div>
                            {doc.originalDate ? (
                              <div>
                                <span className="font-medium text-slate-700 dark:text-slate-300">
                                  {doc.action === "BACKDATED" ? "Ngày chứng từ chọn lùi:" : "Ngày chứng từ gốc:"}
                                </span>{" "}
                                {formatMovementDateTime(doc.originalDate)}
                              </div>
                            ) : null}
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
              {invoiceChanges.length ? (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-3 text-indigo-950 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-200">
                  <p className="font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    Hóa đơn hủy / sửa khớp với mức chênh lệch
                  </p>
                  <ul className="mt-2 space-y-1.5 text-xs">
                    {invoiceChanges.map((change, index) => (
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

              {cancelledStocktakes.length ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                  <p className="font-semibold">Phiếu kiểm kho đã hủy trong ca</p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {cancelledStocktakes.map((stocktake) => (
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

              {!invoiceChanges.length && !cancelledStocktakes.length ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                  Chưa có dữ liệu phân tích. Vui lòng bấm &quot;Điều tra chuyên sâu KiotViet&quot; bên dưới để kiểm tra trực tiếp.
                </div>
              ) : null}
            </div>
          )}

          {/* Thanh hành động chính */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              onClick={() => handleInvestigate(true)}
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

        <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-between text-sm font-semibold dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="text-xs font-normal text-slate-500">
            Hệ thống tự động tra soát thẻ kho & KiotViet API
          </div>
          <div>Tổng lệch: {formatSignedNumber(total)}</div>
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(content, document.body);
}
