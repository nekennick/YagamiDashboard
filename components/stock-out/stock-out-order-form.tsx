"use client";

import React, { useState, useMemo } from "react";
import {
  Calendar,
  Building2,
  User,
  FileText,
  FileSpreadsheet,
  Plus,
  Trash2,
  Printer,
  Save,
  Clock,
  AlertCircle,
  RefreshCw,
  Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StockOutOrderPrintData } from "./stock-out-order-print";

export type BranchItem = {
  id: number;
  name: string;
  address?: string | null;
  kvBranchId?: number | null;
};

export type ProductItem = {
  id: number;
  code?: string | null;
  name: string;
  unit?: string | null;
  basePrice?: number | null;
};

export type StockOutLineItem = {
  productId: number;
  productCode: string;
  productName: string;
  unit: string;
  quantity: number;
  price: number;
  amount: number;
  note?: string;
};

type Props = {
  branches: BranchItem[];
  products: ProductItem[];
  onSuccess: (order: StockOutOrderPrintData, shouldPrint: boolean, message?: string) => void;
  onCancel?: () => void;
};

export const StockOutOrderForm: React.FC<Props> = ({
  branches,
  products,
  onSuccess,
  onCancel
}) => {
  // Form Header State
  const [selectedBranchId, setSelectedBranchId] = useState<number>(() => {
    const tongKho = branches.find((b) => b.name.toUpperCase().includes("TỔNG KHO") || b.name.toUpperCase().includes("TONG KHO"));
    return tongKho?.id || branches[0]?.id || 0;
  });

  const [reportDate, setReportDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [dataTimestamp, setDataTimestamp] = useState<Date>(() => new Date());
  const [receiverName, setReceiverName] = useState<string>("");
  const [documentBasis, setDocumentBasis] = useState<string>("");
  const [note, setNote] = useState<string>("");

  // Items State
  const [lineItems, setLineItems] = useState<StockOutLineItem[]>([]);
  const [fetchingDailyGoods, setFetchingDailyGoods] = useState<boolean>(false);
  const [hasFetched, setHasFetched] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Manual Add Product Modal/Popover State
  const [showProductSearch, setShowProductSearch] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products.slice(0, 20);
    const q = searchQuery.toLowerCase();
    return products.filter(
      (p) =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.code && p.code.toLowerCase().includes(q))
    ).slice(0, 30);
  }, [products, searchQuery]);

  // Totals
  const totalQuantity = useMemo(
    () => lineItems.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0),
    [lineItems]
  );

  const totalAmount = useMemo(
    () => lineItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0),
    [lineItems]
  );

  // Lấy dữ liệu cuối ngày tự động từ API
  const handleFetchDailyGoods = async () => {
    if (!selectedBranchId) {
      setErrorMessage("Vui lòng chọn chi nhánh xuất kho.");
      return;
    }

    setFetchingDailyGoods(true);
    setErrorMessage(null);

    try {
      const res = await fetch(
        `/api/stock-out-orders/daily-goods?branchId=${selectedBranchId}&date=${reportDate}`
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Không thể lấy dữ liệu xuất kho cuối ngày.");
      }

      if (!data.items || data.items.length === 0) {
        setErrorMessage(`Không có phát sinh hàng xuất kho trong ngày ${reportDate} tại chi nhánh này.`);
        setLineItems([]);
      } else {
        setLineItems(
          data.items.map((item: { productId: number; productCode?: string; productName: string; unit?: string; quantity: number | string; price: number | string; amount: number | string }) => ({
            productId: item.productId,
            productCode: item.productCode || "",
            productName: item.productName,
            unit: item.unit || "",
            quantity: Number(item.quantity) || 0,
            price: Number(item.price) || 0,
            amount: Number(item.amount) || 0
          }))
        );
      }

      const ts = data.generatedAt ? new Date(data.generatedAt) : new Date();
      setDataTimestamp(ts);
      setHasFetched(true);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Đã xảy ra lỗi khi lấy dữ liệu");
    } finally {
      setFetchingDailyGoods(false);
    }
  };

  const updateItemQuantity = (index: number, quantity: number) => {
    const updated = [...lineItems];
    const q = Math.max(0, quantity);
    updated[index].quantity = q;
    updated[index].amount = q * updated[index].price;
    setLineItems(updated);
  };

  const updateItemPrice = (index: number, price: number) => {
    const updated = [...lineItems];
    const p = Math.max(0, price);
    updated[index].price = p;
    updated[index].amount = updated[index].quantity * p;
    setLineItems(updated);
  };

  const removeItem = (index: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  const addProductToOrder = (p: ProductItem) => {
    const existingIndex = lineItems.findIndex((item) => item.productId === p.id);
    if (existingIndex >= 0) {
      updateItemQuantity(existingIndex, lineItems[existingIndex].quantity + 1);
    } else {
      const price = Number(p.basePrice) || 0;
      setLineItems((prev) => [
        ...prev,
        {
          productId: p.id,
          productCode: p.code || "",
          productName: p.name,
          unit: p.unit || "",
          quantity: 1,
          price,
          amount: price
        }
      ]);
    }
    setShowProductSearch(false);
    setSearchQuery("");
  };

  const handleSaveOrder = async (shouldPrint: boolean) => {
    if (!selectedBranchId) {
      setErrorMessage("Vui lòng chọn chi nhánh xuất kho.");
      return;
    }

    if (lineItems.length === 0) {
      setErrorMessage("Vui lòng nạp hoặc thêm ít nhất một mặt hàng xuất kho.");
      return;
    }

    const invalidItem = lineItems.find((i) => i.quantity <= 0);
    if (invalidItem) {
      setErrorMessage(`Mặt hàng "${invalidItem.productName}" có số lượng phải lớn hơn 0.`);
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const now = new Date();
      // Thời gian xuất kho là thời điểm lấy dữ liệu hoặc thời điểm hiện tại khi tạo
      const effectiveIssueDate = dataTimestamp ? dataTimestamp.toISOString() : now.toISOString();

      const payload = {
        branchId: selectedBranchId,
        receiverName: receiverName.trim() || undefined,
        documentBasis: documentBasis.trim() || undefined,
        issueDate: effectiveIssueDate,
        reportDate,
        note: note.trim() || undefined,
        items: lineItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
          note: item.note
        }))
      };

      const res = await fetch("/api/stock-out-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Tạo phiếu xuất kho thất bại.");
      }

      const branchObj = branches.find((b) => b.id === selectedBranchId);

      const printData: StockOutOrderPrintData = {
        code: data.order.code,
        issueDate: data.order.issueDate,
        reportDate: data.order.reportDate,
        receiverName: data.order.receiverName,
        documentBasis: data.order.documentBasis,
        branchName: branchObj?.name || "TỔNG KHO YAGAMI",
        branchAddress: branchObj?.address || "Xã Ba Sao, Tỉnh Đồng Tháp",
        note: data.order.note,
        totalAmount: Number(data.order.totalAmount),
        totalQuantity: Number(data.order.totalQuantity),
        items: data.order.items.map((i: { productCode?: string | null; productName: string; unit?: string | null; quantity: number | string; price: number | string; amount: number | string }) => ({
          productCode: i.productCode,
          productName: i.productName,
          unit: i.unit,
          quantity: Number(i.quantity),
          price: Number(i.price),
          amount: Number(i.amount)
        }))
      };

      onSuccess(printData, shouldPrint, data.message);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Đã xảy ra lỗi khi tạo phiếu");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
      {/* Header Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            Lập phiếu xuất kho mới
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Dựng lại phiếu xuất kho theo mẫu phiếu nhập tạm thời từ dữ liệu báo cáo hàng hóa cuối ngày.
          </p>
        </div>

        {onCancel && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="text-xs h-9 text-slate-600 dark:text-slate-300"
          >
            Quay lại danh sách
          </Button>
        )}
      </div>

      {errorMessage && (
        <div className="flex items-start gap-3 rounded-xl bg-red-50 p-3.5 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-red-600" />
          <div>{errorMessage}</div>
        </div>
      )}

      {/* Main Parameters Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50/70 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800">
        {/* Branch Selection */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-slate-400" />
            Chi nhánh xuất kho <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(Number(e.target.value))}
            className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none transition focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white font-medium"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Date Selection */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            Ngày dữ liệu báo cáo <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
            className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none transition focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white font-medium"
          />
        </div>

        {/* Receiver Name */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-slate-400" />
            Họ và tên người nhận
          </label>
          <input
            type="text"
            placeholder="VD: Nguyễn Văn A..."
            value={receiverName}
            onChange={(e) => setReceiverName(e.target.value)}
            className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none transition focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </div>

        {/* Fetch Button action column */}
        <div className="flex flex-col justify-end">
          <Button
            type="button"
            onClick={handleFetchDailyGoods}
            disabled={fetchingDailyGoods}
            className="h-10 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center justify-center gap-2 rounded-xl shadow-sm"
          >
            <RefreshCw className={`h-4 w-4 ${fetchingDailyGoods ? "animate-spin" : ""}`} />
            {fetchingDailyGoods ? "Đang lấy dữ liệu..." : "Lấy dữ liệu cuối ngày"}
          </Button>
        </div>

        {/* Document Basis */}
        <div className="col-span-1 sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-slate-400" />
            Lý do xuất kho / Căn cứ chứng từ
          </label>
          <input
            type="text"
            placeholder="VD: Xuất bán cuối ngày theo báo cáo doanh thu, hoặc Lệnh điều chuyển số..."
            value={documentBasis}
            onChange={(e) => setDocumentBasis(e.target.value)}
            className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none transition focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </div>

        {/* Note */}
        <div className="col-span-1 sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-slate-400" />
            Ghi chú phiếu
          </label>
          <input
            type="text"
            placeholder="Ghi chú nội bộ cho phiếu xuất..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none transition focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </div>
      </div>

      {/* Timestamp Status Badge */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 p-3.5 rounded-xl">
        <div className="flex items-center gap-2.5 text-xs">
          <Clock className="h-4 w-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
          <div>
            <span className="text-slate-600 dark:text-slate-400">Thời gian của phiếu xuất kho: </span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {dataTimestamp.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}{" "}
              {dataTimestamp.toLocaleDateString("vi-VN")}
            </span>
            <span className="ml-2 text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-100/70 dark:bg-emerald-950/70 px-1.5 py-0.5 rounded font-medium">
              Thời điểm lấy dữ liệu
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowProductSearch(true)}
            className="h-8 px-2.5 text-xs text-slate-700 dark:text-slate-200 flex items-center gap-1.5 bg-white dark:bg-slate-900"
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm sản phẩm khác
          </Button>
        </div>
      </div>

      {/* Line Items Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800/80 text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase border-b border-slate-200 dark:border-slate-800">
              <th className="py-2.5 px-3 w-10 text-center">STT</th>
              <th className="py-2.5 px-3 w-28">Mã hàng</th>
              <th className="py-2.5 px-3">Tên hàng hóa</th>
              <th className="py-2.5 px-3 w-24 text-center">ĐVT</th>
              <th className="py-2.5 px-3 w-28 text-right">Số lượng xuất</th>
              <th className="py-2.5 px-3 w-32 text-right">Đơn giá bán (đ)</th>
              <th className="py-2.5 px-3 w-36 text-right">Thành tiền (đ)</th>
              <th className="py-2.5 px-3 w-12 text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {lineItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  {hasFetched ? (
                    <span>Không có mặt hàng nào được xuất trong ngày đã chọn.</span>
                  ) : (
                    <span>
                      Chưa có dữ liệu. Bấm nút <strong>&quot;Lấy dữ liệu cuối ngày&quot;</strong> ở trên để tự động nạp danh sách hàng xuất.
                    </span>
                  )}
                </td>
              </tr>
            ) : (
              lineItems.map((item, idx) => (
                <tr key={`${item.productId}-${idx}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                  <td className="py-2.5 px-3 font-mono font-medium text-slate-900 dark:text-white">
                    {item.productCode || "—"}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">
                    {item.productName}
                  </td>
                  <td className="py-2.5 px-3 text-center text-slate-500">{item.unit || "—"}</td>
                  <td className="py-2.5 px-3 text-right">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={item.quantity}
                      onChange={(e) => updateItemQuantity(idx, parseFloat(e.target.value) || 0)}
                      className="w-20 text-right font-semibold text-slate-900 dark:text-white h-7 px-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 focus:border-indigo-500"
                    />
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={item.price}
                      onChange={(e) => updateItemPrice(idx, parseFloat(e.target.value) || 0)}
                      className="w-28 text-right font-mono text-slate-700 dark:text-slate-300 h-7 px-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 focus:border-indigo-500"
                    />
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 dark:text-white">
                    {Number(item.amount).toLocaleString("vi-VN")} đ
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="text-slate-400 hover:text-red-500 p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {lineItems.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 dark:bg-slate-800/60 font-bold border-t border-slate-200 dark:border-slate-700 text-xs">
                <td colSpan={4} className="py-3 px-4 text-right uppercase text-slate-600 dark:text-slate-300">
                  Tổng cộng ({lineItems.length} mặt hàng):
                </td>
                <td className="py-3 px-3 text-right font-mono text-indigo-600 dark:text-indigo-400">
                  {totalQuantity.toLocaleString("vi-VN")}
                </td>
                <td className="py-3 px-3"></td>
                <td className="py-3 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 text-sm">
                  {totalAmount.toLocaleString("vi-VN")} đ
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
        <div className="text-xs text-slate-500 italic">
          * Đơn giá và thành tiền trên phiếu chỉ phục vụ quản lý nội bộ theo giá bán.
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={submitting}
              className="flex-1 sm:flex-initial text-xs h-10 px-4"
            >
              Hủy
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={() => handleSaveOrder(false)}
            disabled={submitting || lineItems.length === 0}
            className="flex-1 sm:flex-initial text-xs h-10 px-4 flex items-center gap-2 border-slate-300 dark:border-slate-700"
          >
            <Save className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            Lưu phiếu xuất kho
          </Button>

          <Button
            type="button"
            onClick={() => handleSaveOrder(true)}
            disabled={submitting || lineItems.length === 0}
            className="flex-1 sm:flex-initial text-xs h-10 px-5 bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-2 shadow-sm font-semibold"
          >
            <Printer className="h-4 w-4" />
            Lưu & In phiếu ngay
          </Button>
        </div>
      </div>

      {/* Modal / Search overlay to add extra product */}
      {showProductSearch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="h-4 w-4 text-indigo-600" />
                Thêm sản phẩm vào phiếu xuất
              </h3>
              <button
                type="button"
                onClick={() => setShowProductSearch(false)}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm mã hoặc tên sản phẩm..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500"
              />
            </div>

            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {filteredProducts.map((p) => (
                <div
                  key={p.id}
                  onClick={() => addProductToOrder(p)}
                  className="p-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer flex items-center justify-between rounded-lg transition"
                >
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white">{p.name}</span>
                    <span className="text-[11px] text-slate-400 block font-mono">
                      {p.code} • ĐVT: {p.unit || "—"}
                    </span>
                  </div>
                  <span className="font-mono text-indigo-600 dark:text-indigo-400 font-medium">
                    {Number(p.basePrice || 0).toLocaleString("vi-VN")} đ
                  </span>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowProductSearch(false)}
                className="text-xs"
              >
                Đóng
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
