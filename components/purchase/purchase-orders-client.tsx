"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Truck,
  Plus,
  Search,
  RotateCw,
  Settings2,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Pencil,
  Trash2,
  AlertCircle,
  X,
  ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { kiotVietPurchaseOrderUrl } from "@/lib/kiotviet/links";
import { PurchaseOrderForm, ProductItem, BranchItem } from "./purchase-order-form";
import { PurchaseOrderPrint, PurchaseOrderPrintData, PrintTemplateConfig } from "./purchase-order-print";
import { PurchasePrintSettings } from "./purchase-print-settings";

export type PurchaseOrderRowItem = {
  id?: number;
  productCode?: string | null;
  productName: string;
  unit?: string | null;
  quantity: number | string;
  price: number | string;
  amount: number | string;
};

export type PurchaseOrderRow = {
  id: number;
  code: string;
  purchaseDate: string | Date;
  delivererName?: string | null;
  supplierName?: string | null;
  note?: string | null;
  totalAmount: number | string;
  totalQuantity: number | string;
  syncStatus?: string;
  branch?: { id?: number; name?: string; address?: string | null; kvBranchId?: number };
  supplier?: { id?: number; name?: string; phone?: string | null };
  items?: PurchaseOrderRowItem[];
};

type Props = {
  initialBranches: BranchItem[];
  initialProducts: ProductItem[];
  initialPrintConfig?: PrintTemplateConfig;
};

export const PurchaseOrdersClient: React.FC<Props> = ({
  initialBranches,
  initialProducts,
  initialPrintConfig
}) => {
  // Navigation View: "list" | "create" | "settings"
  const [activeView, setActiveView] = useState<"list" | "create" | "settings">("list");

  // Orders State
  const [orders, setOrders] = useState<PurchaseOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);

  // Filters State
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  // Print Modal State
  const [printOrder, setPrintOrder] = useState<PurchaseOrderPrintData | null>(null);
  const [autoTriggerPrint, setAutoTriggerPrint] = useState(false);
  const [printConfig, setPrintConfig] = useState<PrintTemplateConfig | undefined>(initialPrintConfig);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrderRow | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 6000);
  }, []);

  // Fetch Orders
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedBranchId) params.set("branchId", selectedBranchId);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      params.set("page", String(page));
      params.set("pageSize", "20");

      const res = await fetch(`/api/purchase-orders?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setOrders(data.orders || []);
        setTotalCount(data.total || 0);
      }
    } catch (err) {
      console.error("Lỗi tải danh sách phiếu nhập:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId, searchQuery, fromDate, toDate, page]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Handle Search submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchOrders();
  };

  // Open Print for an order
  const handleOpenPrint = (order: PurchaseOrderRow, auto = false) => {
    const printData: PurchaseOrderPrintData = {
      code: order.code,
      purchaseDate: order.purchaseDate,
      delivererName: order.delivererName,
      supplierName: order.supplierName || order.supplier?.name,
      branchName: order.branch?.name,
      branchAddress: order.branch?.address,
      note: order.note,
      totalAmount: Number(order.totalAmount || 0),
      totalQuantity: Number(order.totalQuantity || 0),
      items: (order.items || []).map((i: PurchaseOrderRowItem, idx: number) => ({
        stt: idx + 1,
        productCode: i.productCode,
        productName: i.productName,
        unit: i.unit,
        quantity: Number(i.quantity),
        price: Number(i.price),
        amount: Number(i.amount)
      }))
    };

    setPrintOrder(printData);
    setAutoTriggerPrint(auto);
  };

  // Retry sync to KiotViet
  const handleRetrySync = async (orderId: number) => {
    setRetryingId(orderId);
    try {
      const res = await fetch(`/api/purchase-orders/${orderId}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        fetchOrders();
        showToast("success", data.message || "Đồng bộ KiotViet thành công!");
      } else {
        showToast("error", data.message || "Đồng bộ thất bại");
      }
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Lỗi kết nối");
    } finally {
      setRetryingId(null);
    }
  };

  // Edit a draft order
  const handleEditDraft = (order: PurchaseOrderRow) => {
    setEditingOrder(order);
    setActiveView("create");
  };

  // Delete a draft order
  const handleDeleteDraft = async (orderId: number, code: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa phiếu tạm ${code} không?`)) {
      return;
    }
    setDeletingId(orderId);
    try {
      const res = await fetch(`/api/purchase-orders/${orderId}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        fetchOrders();
        showToast("success", data.message || `Đã xóa phiếu tạm ${code}`);
      } else {
        showToast("error", data.message || "Xóa phiếu tạm thất bại");
      }
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Lỗi kết nối");
    } finally {
      setDeletingId(null);
    }
  };

  // Stats calculation
  const stats = React.useMemo(() => {
    let synced = 0;
    let localOnly = 0;
    let totalValue = 0;
    for (const o of orders) {
      if (o.syncStatus === "SYNCED") synced++;
      else localOnly++;
      totalValue += Number(o.totalAmount || 0);
    }
    return { synced, localOnly, totalValue };
  }, [orders]);

  return (
    <div className="space-y-6 relative">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800 animate-in fade-in slide-in-from-top-4 duration-200 max-w-md">
          {toast.type === "success" ? (
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400">
              <AlertCircle className="h-5 w-5" />
            </div>
          )}
          <div className="flex-1 text-xs">
            <span className="font-bold block text-slate-900 dark:text-white">
              {toast.type === "success" ? "Thành công" : "Thông báo"}
            </span>
            <span className="text-slate-600 dark:text-slate-300">
              {toast.message}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-950 dark:text-white">
            <Truck className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            <h1 className="text-2xl font-bold tracking-tight">Quản lý Nhập hàng</h1>
            <span className="ml-2 inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              KiotViet Sync
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Tạo phiếu nhập hàng, tự động điền đơn giá bán lẻ và in chứng từ theo chuẩn biểu mẫu KiotViet.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {activeView !== "list" ? (
            <Button
              variant="outline"
              onClick={() => {
                setActiveView("list");
                setEditingOrder(null);
              }}
              className="flex items-center gap-2 text-xs h-9 px-4 font-semibold"
            >
              <ArrowLeft className="h-4 w-4" />
              Quay lại danh sách
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setActiveView("settings")}
                className="flex items-center gap-2 text-xs h-9 px-3.5 font-semibold text-slate-700 dark:text-slate-300"
              >
                <Settings2 className="h-4 w-4" />
                Mẫu in
              </Button>
              <Button
                onClick={() => {
                  setEditingOrder(null);
                  setActiveView("create");
                }}
                className="flex items-center gap-2 text-xs h-9 px-4 font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
              >
                <Plus className="h-4 w-4" />
                Lập phiếu nhập mới
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Content Area based on activeView */}
      {activeView === "create" && (
        <PurchaseOrderForm
          branches={initialBranches}
          products={initialProducts}
          initialOrder={editingOrder}
          onSuccess={(newOrder, shouldPrint, message) => {
            setActiveView("list");
            setEditingOrder(null);
            fetchOrders();
            showToast("success", message || `Đã lưu phiếu ${newOrder.code} thành công`);
            if (shouldPrint) {
              handleOpenPrint(newOrder, true);
            }
          }}
          onCancel={() => {
            setActiveView("list");
            setEditingOrder(null);
          }}
        />
      )}

      {activeView === "settings" && (
        <PurchasePrintSettings
          onSaved={(newConfig) => {
            setPrintConfig(newConfig);
          }}
        />
      )}

      {activeView === "list" && (
        <>
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <span className="text-xs font-medium text-slate-500">Tổng phiếu (trang này)</span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                  {orders.length}
                </span>
                <span className="text-xs text-slate-400">/ tổng {totalCount} phiếu</span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <span className="text-xs font-medium text-slate-500">Tổng giá trị (theo giá bán)</span>
              <div className="mt-1 text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
                {stats.totalValue.toLocaleString("vi-VN")} đ
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <span className="text-xs font-medium text-slate-500">Trạng thái đồng bộ</span>
              <div className="mt-2 flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {stats.synced} Đã sync
                </span>
                {stats.localOnly > 0 && (
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                    <Clock className="h-3.5 w-3.5" /> {stats.localOnly} Phiếu tạm
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Search text */}
              <div className="lg:col-span-2 relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm theo mã phiếu, người giao, NCC..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-9 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              {/* Branch filter */}
              <div>
                <select
                  value={selectedBranchId}
                  onChange={(e) => {
                    setSelectedBranchId(e.target.value);
                    setPage(1);
                  }}
                  className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value="">Tất cả kho nhập</option>
                  {initialBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}{b.address ? ` - ${b.address}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* From Date */}
              <div>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setPage(1);
                  }}
                  className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  title="Từ ngày"
                />
              </div>

              {/* Submit & Refresh */}
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setPage(1);
                  }}
                  className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  title="Đến ngày"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={fetchOrders}
                  className="h-9 px-3 text-slate-500 hover:text-slate-900"
                  title="Làm mới"
                >
                  <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </form>
          </div>

          {/* Orders Table */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900">
            {loading ? (
              <div className="p-12 text-center text-xs text-slate-500">Đang tải danh sách phiếu nhập...</div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400">
                <Truck className="h-10 w-10 text-slate-300 stroke-1 mb-2" />
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Chưa có phiếu nhập hàng nào phù hợp
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Nhấn &quot;Lập phiếu nhập mới&quot; để tạo chứng từ nhập kho đầu tiên.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/40 text-[11px] font-semibold text-slate-500 uppercase">
                      <th className="py-3 px-4">Mã phiếu</th>
                      <th className="py-3 px-4">Ngày nhập</th>
                      <th className="py-3 px-4">Kho nhập</th>
                      <th className="py-3 px-4">Người giao / NCC</th>
                      <th className="py-3 px-4 text-right">Mặt hàng</th>
                      <th className="py-3 px-4 text-right">Tổng số lượng</th>
                      <th className="py-3 px-4 text-right">Tổng tiền hàng</th>
                      <th className="py-3 px-4 text-center">Trạng thái / Kiot</th>
                      <th className="py-3 px-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {orders.map((o) => (
                      <tr
                        key={o.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono font-bold">
                          {o.code ? (
                            <a
                              href={kiotVietPurchaseOrderUrl(o.code)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300 group transition-colors"
                              title={`Mở phiếu nhập ${o.code} trên KiotViet`}
                            >
                              <span>{o.code}</span>
                              <ExternalLink className="h-3 w-3 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                            </a>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                          {formatDateTime(o.purchaseDate)}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                          {o.branch?.name || "N/A"}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900 dark:text-white">
                            {o.delivererName || o.supplierName || "—"}
                          </div>
                          {o.supplierName && o.delivererName && (
                            <div className="text-[10px] text-slate-400">NCC: {o.supplierName}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-slate-700 dark:text-slate-300">
                          {o.items?.length || 0} món
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 dark:text-white">
                          {Number(o.totalQuantity || 0).toLocaleString("vi-VN")}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {Number(o.totalAmount || 0).toLocaleString("vi-VN")} đ
                        </td>
                        <td className="py-3 px-4 text-center">
                          {o.syncStatus === "SYNCED" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                              <CheckCircle2 className="h-3 w-3" /> Đã sync
                            </span>
                          ) : (
                            <div className="inline-flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                <Clock className="h-3 w-3" /> Phiếu tạm
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRetrySync(o.id)}
                                disabled={retryingId === o.id}
                                className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium underline"
                                title="Đẩy phiếu tạm này lên KiotViet ngay"
                              >
                                {retryingId === o.id ? "Đang đẩy..." : "Đẩy Kiot"}
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {o.syncStatus !== "SYNCED" ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditDraft(o)}
                                  className="h-7 px-2 text-xs font-semibold flex items-center gap-1 border-amber-300 bg-amber-50/60 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                                  title="Sửa phiếu tạm này"
                                >
                                  <Pencil className="h-3 w-3" />
                                  Sửa
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeleteDraft(o.id, o.code)}
                                  disabled={deletingId === o.id}
                                  className="h-7 w-7 p-0 text-xs font-medium flex items-center justify-center border-slate-200 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-slate-800 dark:hover:bg-red-950/40"
                                  title="Xóa phiếu tạm"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Printable Modal (Appears when user clicks In phiếu or after saving) */}
      {printOrder && (
        <PurchaseOrderPrint
          order={printOrder}
          config={printConfig}
          autoPrint={autoTriggerPrint}
          onClose={() => {
            setPrintOrder(null);
            setAutoTriggerPrint(false);
          }}
        />
      )}
    </div>
  );
};

function formatDateTime(dateStr: string | Date) {
  try {
    const d = new Date(dateStr);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return String(dateStr);
  }
}
