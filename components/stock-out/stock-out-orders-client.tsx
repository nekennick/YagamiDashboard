"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  FileSpreadsheet,
  Plus,
  Search,
  Printer,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StockOutOrderForm, BranchItem, ProductItem } from "./stock-out-order-form";
import { StockOutOrderPrint, StockOutOrderPrintData } from "./stock-out-order-print";

export type StockOutOrderRow = {
  id: number;
  code: string;
  branchId: number;
  branch?: {
    id: number;
    name: string;
    address?: string | null;
  } | null;
  receiverName?: string | null;
  documentBasis?: string | null;
  issueDate: string;
  reportDate?: string | null;
  totalAmount: number | string;
  totalQuantity: number | string;
  note?: string | null;
  status: string;
  createdBy?: {
    id: number;
    displayName: string;
  } | null;
  items?: Array<{
    id: number;
    productId: number;
    productCode?: string | null;
    productName: string;
    unit?: string | null;
    quantity: number | string;
    price: number | string;
    amount: number | string;
    note?: string | null;
  }>;
};

type Props = {
  initialBranches: BranchItem[];
  initialProducts: ProductItem[];
};

export const StockOutOrdersClient: React.FC<Props> = ({
  initialBranches,
  initialProducts
}) => {
  const [activeView, setActiveView] = useState<"list" | "create">("list");
  const [orders, setOrders] = useState<StockOutOrderRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);

  // Filters
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  // Print Modal
  const [printOrder, setPrintOrder] = useState<StockOutOrderPrintData | null>(null);
  const [autoTriggerPrint, setAutoTriggerPrint] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 6000);
  }, []);

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

      const res = await fetch(`/api/stock-out-orders?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setOrders(data.orders || []);
        setTotalCount(data.total || 0);
      }
    } catch (err) {
      console.error("Lỗi tải danh sách phiếu xuất kho:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId, searchQuery, fromDate, toDate, page]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handlePrintClick = (order: StockOutOrderRow, auto = false) => {
    const printData: StockOutOrderPrintData = {
      code: order.code,
      issueDate: order.issueDate,
      reportDate: order.reportDate,
      receiverName: order.receiverName,
      documentBasis: order.documentBasis,
      branchName: order.branch?.name || "TỔNG KHO YAGAMI",
      branchAddress: order.branch?.address || "Xã Ba Sao, Tỉnh Đồng Tháp",
      note: order.note,
      totalAmount: Number(order.totalAmount),
      totalQuantity: Number(order.totalQuantity),
      items: (order.items || []).map((i) => ({
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

  const handleDeleteOrder = async (orderId: number, code: string) => {
    if (!confirm(`Bạn có chắc muốn xóa phiếu xuất kho ${code}?`)) return;

    setDeletingId(orderId);
    try {
      const res = await fetch(`/api/stock-out-orders/${orderId}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        showToast("success", data.message || "Đã xóa phiếu xuất kho");
        fetchOrders();
      } else {
        showToast("error", data.message || "Xóa phiếu thất bại");
      }
    } catch {
      showToast("error", "Lỗi kết nối");
    } finally {
      setDeletingId(null);
    }
  };

  const formatDateTime = (dateStr: string | Date) => {
    try {
      const d = new Date(dateStr);
      return `${d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} ${d.toLocaleDateString("vi-VN")}`;
    } catch {
      return String(dateStr);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl px-4 py-3 text-xs font-semibold text-white shadow-xl transition ${
            toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <FileSpreadsheet className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
            Xuất kho & Phiếu xuất nội bộ
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Lập phiếu xuất kho từ dữ liệu báo cáo hàng hóa cuối ngày, in theo mẫu chứng từ nội bộ chuẩn.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {activeView === "list" ? (
            <Button
              onClick={() => setActiveView("create")}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold h-10 px-4 rounded-xl shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Lập phiếu xuất kho mới
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => setActiveView("list")}
              className="text-xs font-medium h-10 px-4 rounded-xl"
            >
              Xem danh sách phiếu xuất
            </Button>
          )}
        </div>
      </div>

      {activeView === "create" ? (
        <StockOutOrderForm
          branches={initialBranches}
          products={initialProducts}
          onSuccess={(orderData, shouldPrint, message) => {
            showToast("success", message || "Tạo phiếu xuất kho thành công");
            fetchOrders();
            setActiveView("list");
            if (shouldPrint) {
              setPrintOrder(orderData);
              setAutoTriggerPrint(true);
            }
          }}
          onCancel={() => setActiveView("list")}
        />
      ) : (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
            {/* Search */}
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Mã phiếu, người nhận, ghi chú..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500"
              />
            </div>

            {/* Branch Filter */}
            <div>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="w-full h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500 font-medium"
              >
                <option value="">Tất cả chi nhánh</option>
                {initialBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* From Date */}
            <div>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                placeholder="Từ ngày"
                className="w-full h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500"
              />
            </div>

            {/* To Date */}
            <div>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                placeholder="Đến ngày"
                className="w-full h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500"
              />
            </div>

            {/* Reset Filters */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedBranchId("");
                  setSearchQuery("");
                  setFromDate("");
                  setToDate("");
                  setPage(1);
                }}
                className="h-9 px-3 text-xs w-full text-slate-600 dark:text-slate-300"
              >
                Đặt lại
              </Button>
            </div>
          </div>

          {/* Orders Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase border-b border-slate-200 dark:border-slate-800">
                    <th className="py-3 px-4">Mã phiếu</th>
                    <th className="py-3 px-4">Thời gian xuất (Lấy dữ liệu)</th>
                    <th className="py-3 px-4">Ngày báo cáo</th>
                    <th className="py-3 px-4">Kho / Chi nhánh xuất</th>
                    <th className="py-3 px-4">Người nhận</th>
                    <th className="py-3 px-4 text-right">Tổng số lượng</th>
                    <th className="py-3 px-4 text-right">Tổng tiền hàng</th>
                    <th className="py-3 px-4 text-center">Người lập</th>
                    <th className="py-3 px-4 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        Đang tải danh sách phiếu xuất kho...
                      </td>
                    </tr>
                  ) : orders.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        Chưa có phiếu xuất kho nào. Bấm <strong>&quot;Lập phiếu xuất kho mới&quot;</strong> để tạo phiếu từ báo cáo cuối ngày.
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => (
                      <tr key={order.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {order.code}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            {formatDateTime(order.issueDate)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                          {order.reportDate || "—"}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                          {order.branch?.name || "—"}
                        </td>
                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                          {order.receiverName || "—"}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 dark:text-white">
                          {Number(order.totalQuantity).toLocaleString("vi-VN")}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {Number(order.totalAmount).toLocaleString("vi-VN")} đ
                        </td>
                        <td className="py-3 px-4 text-center text-slate-500">
                          {order.createdBy?.displayName || "—"}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => handlePrintClick(order, false)}
                              title="In phiếu xuất kho"
                              className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 dark:text-indigo-400 transition"
                            >
                              <Printer className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              disabled={deletingId === order.id}
                              onClick={() => handleDeleteOrder(order.id, order.code)}
                              title="Xóa phiếu"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination / Total count */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
              <div>
                Tổng số phiếu: <strong className="text-slate-900 dark:text-white">{totalCount}</strong>
              </div>
              {totalCount > 20 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="h-8 text-xs"
                  >
                    Trang trước
                  </Button>
                  <span>Trang {page}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page * 20 >= totalCount}
                    onClick={() => setPage((p) => p + 1)}
                    className="h-8 text-xs"
                  >
                    Trang sau
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Printable Sheet Modal */}
      {printOrder && (
        <StockOutOrderPrint
          order={printOrder}
          autoPrint={autoTriggerPrint}
          onClose={() => setPrintOrder(null)}
        />
      )}
    </div>
  );
};
