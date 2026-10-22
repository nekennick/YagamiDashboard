"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Search,
  Plus,
  Trash2,
  Printer,
  Save,
  RotateCw,
  Building2,
  Calendar,
  User,
  Truck,
  FileText,
  AlertCircle,
  CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { numberToVietnameseWords } from "@/lib/utils/number-to-words";

export type ProductItem = {
  id: number;
  code: string | null;
  name: string;
  unit: string | null;
  basePrice: number | null;
  categoryName: string | null;
};

export type BranchItem = {
  id: number;
  name: string;
  address?: string | null;
  kvBranchId: number;
};

export type SupplierItem = {
  id: number;
  code?: string | null;
  name: string;
  phone?: string | null;
  address?: string | null;
};

export type FormLineItem = {
  productId: number;
  productCode: string;
  productName: string;
  unit: string;
  quantity: number;
  price: number;
  amount: number;
};

type Props = {
  branches: BranchItem[];
  products: ProductItem[];
  onSuccess: (order: any, shouldPrint: boolean) => void;
  onCancel?: () => void;
};

export const PurchaseOrderForm: React.FC<Props> = ({
  branches,
  products,
  onSuccess,
  onCancel
}) => {
  // Form State
  const [selectedBranchId, setSelectedBranchId] = useState<number>(
    branches[0]?.id || 0
  );
  const [purchaseDate, setPurchaseDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [delivererName, setDelivererName] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [lineItems, setLineItems] = useState<FormLineItem[]>([]);

  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Supplier State & Sync
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [syncingSuppliers, setSyncingSuppliers] = useState(false);

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch Suppliers
  const loadSuppliers = async (sync = false) => {
    if (sync) setSyncingSuppliers(true);
    else setLoadingSuppliers(true);

    try {
      const res = await fetch(`/api/suppliers${sync ? "?sync=true" : ""}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.suppliers)) {
        setSuppliers(data.suppliers);
      }
    } catch (err) {
      console.error("Không thể tải danh sách nhà cung cấp", err);
    } finally {
      setLoadingSuppliers(false);
      setSyncingSuppliers(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  // Filter Products for Quick Search
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = normalize(searchQuery);
    const existingIds = new Set(lineItems.map((item) => item.productId));

    return products
      .filter((p) => !existingIds.has(p.id))
      .filter((p) => {
        const text = normalize(`${p.name} ${p.code || ""} ${p.categoryName || ""}`);
        return text.includes(query);
      })
      .slice(0, 8);
  }, [searchQuery, products, lineItems]);

  // Add Product to list
  const addProduct = (p: ProductItem) => {
    const basePrice = Number(p.basePrice || 0);
    const newItem: FormLineItem = {
      productId: p.id,
      productCode: p.code || "",
      productName: p.name,
      unit: p.unit || "Cái",
      quantity: 1,
      price: basePrice,
      amount: 1 * basePrice
    };

    setLineItems((prev) => [...prev, newItem]);
    setSearchQuery("");
    setIsSearchOpen(false);
    setErrorMessage(null);
  };

  // Update Line Item Quantity or Price
  const updateLineItem = (index: number, field: "quantity" | "price", value: number) => {
    setLineItems((prev) => {
      const next = [...prev];
      const item = { ...next[index] };
      if (field === "quantity") {
        item.quantity = Math.max(0, value);
      } else if (field === "price") {
        item.price = Math.max(0, value);
      }
      item.amount = item.quantity * item.price;
      next[index] = item;
      return next;
    });
  };

  // Remove Line Item
  const removeLineItem = (index: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Calculations
  const totals = useMemo(() => {
    let totalQty = 0;
    let totalAmount = 0;
    for (const item of lineItems) {
      totalQty += item.quantity;
      totalAmount += item.amount;
    }
    return {
      totalItems: lineItems.length,
      totalQty,
      totalAmount,
      words: numberToVietnameseWords(totalAmount)
    };
  }, [lineItems]);

  // Submit Handler
  const handleSubmit = async (shouldPrint: boolean) => {
    setErrorMessage(null);

    if (!selectedBranchId) {
      setErrorMessage("Vui lòng chọn chi nhánh/kho nhập.");
      return;
    }

    if (lineItems.length === 0) {
      setErrorMessage("Vui lòng chọn ít nhất một mặt hàng để nhập kho.");
      return;
    }

    for (const item of lineItems) {
      if (item.quantity <= 0) {
        setErrorMessage(`Mặt hàng "${item.productName}" có số lượng phải lớn hơn 0.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const supplierIdNum = selectedSupplierId ? Number(selectedSupplierId) : undefined;
      const supplierObj = suppliers.find((s) => s.id === supplierIdNum);

      const payload = {
        branchId: selectedBranchId,
        supplierId: supplierIdNum,
        supplierName: supplierObj?.name,
        delivererName: delivererName.trim() || undefined,
        purchaseDate: new Date(purchaseDate).toISOString(),
        note: note.trim() || undefined,
        items: lineItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price
        }))
      };

      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Tạo phiếu nhập thất bại");
      }

      onSuccess(data.order, shouldPrint);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Đã xảy ra lỗi");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner / Form Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <FileText className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          Lập phiếu nhập hàng mới
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Nhập số lượng hàng thực nhận. Đơn giá bán sẽ tự động được điền theo giá niêm yết KiotViet.
        </p>

        {errorMessage && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Master Details Grid */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Branch / Warehouse */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              Kho / Chi nhánh nhập <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(Number(e.target.value))}
              className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none transition focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Purchase Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              Ngày nhập hàng <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none transition focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          {/* Supplier */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5 text-slate-400" />
                Nhà cung cấp
              </label>
              <button
                type="button"
                onClick={() => loadSuppliers(true)}
                disabled={syncingSuppliers}
                className="text-[11px] text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 inline-flex items-center gap-1"
                title="Đồng bộ danh sách nhà cung cấp từ KiotViet"
              >
                <RotateCw className={`h-3 w-3 ${syncingSuppliers ? "animate-spin" : ""}`} />
                {syncingSuppliers ? "Đang sync..." : "Sync Kiot"}
              </button>
            </div>
            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none transition focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="">-- Chọn nhà cung cấp --</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.phone ? `(${s.phone})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Deliverer Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-slate-400" />
              Người giao hàng
            </label>
            <input
              type="text"
              placeholder="VD: Anh Minh / Tài xế xe"
              value={delivererName}
              onChange={(e) => setDelivererName(e.target.value)}
              className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none transition focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
        </div>

        {/* Note Row */}
        <div className="mt-3">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Ghi chú phiếu nhập
          </label>
          <input
            type="text"
            placeholder="Ghi chú thêm về lô hàng, số xe, hóa đơn đi kèm..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none transition focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </div>
      </div>

      {/* Product Selection & Items Table Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Chi tiết hàng hóa nhập ({lineItems.length} mặt hàng)
            </h3>
            <span className="text-xs text-slate-500">
              Tìm theo mã SKU hoặc tên sản phẩm để thêm vào phiếu
            </span>
          </div>

          {/* Quick Search Input */}
          <div className="relative w-full sm:w-96">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Gõ tên hoặc mã hàng để thêm nhanh..."
              value={searchQuery}
              onFocus={() => setIsSearchOpen(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-xs outline-none transition focus:bg-white focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />

            {/* Suggestions Dropdown */}
            {isSearchOpen && searchQuery.trim() && (
              <div className="absolute left-0 right-0 top-11 z-50 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-950">
                {filteredProducts.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    Không tìm thấy sản phẩm nào khớp hoặc đã thêm rồi.
                  </div>
                ) : (
                  filteredProducts.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => addProduct(p)}
                      className="flex items-center justify-between px-3.5 py-2.5 hover:bg-indigo-50 dark:hover:bg-slate-800 cursor-pointer border-b border-slate-100 dark:border-slate-800 last:border-none transition"
                    >
                      <div>
                        <div className="text-xs font-semibold text-slate-900 dark:text-white">
                          {p.name}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {p.code ? `Mã: ${p.code}` : ""} · ĐVT: {p.unit || "Cái"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                          {Number(p.basePrice || 0).toLocaleString("vi-VN")} đ
                        </div>
                        <span className="text-[10px] text-slate-400">Giá bán lẻ</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Table of items */}
        {lineItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
            <Search className="h-10 w-10 text-slate-300 stroke-1 mb-2" />
            <p className="text-xs font-medium">Chưa có sản phẩm nào trong phiếu nhập</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Sử dụng ô tìm kiếm phía trên để bắt đầu thêm hàng hóa
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-[11px] font-semibold text-slate-500 uppercase">
                  <th className="py-2.5 px-3 w-12 text-center">STT</th>
                  <th className="py-2.5 px-3 w-28">Mã hàng</th>
                  <th className="py-2.5 px-3">Tên sản phẩm</th>
                  <th className="py-2.5 px-3 w-20 text-center">ĐVT</th>
                  <th className="py-2.5 px-3 w-32 text-right">Số lượng nhập</th>
                  <th className="py-2.5 px-3 w-36 text-right">Đơn giá bán</th>
                  <th className="py-2.5 px-3 w-36 text-right">Thành tiền</th>
                  <th className="py-2.5 px-3 w-12 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {lineItems.map((item, idx) => (
                  <tr
                    key={item.productId}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="py-3 px-3 text-center text-slate-400 font-medium">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-3 font-mono font-medium text-slate-700 dark:text-slate-300">
                      {item.productCode || "-"}
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-900 dark:text-white">
                      {item.productName}
                    </td>
                    <td className="py-3 px-3 text-center text-slate-500">
                      {item.unit || "-"}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={item.quantity || ""}
                        onChange={(e) =>
                          updateLineItem(idx, "quantity", parseFloat(e.target.value) || 0)
                        }
                        className="w-24 h-8 rounded-lg border border-slate-200 bg-white px-2 text-right font-mono text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                    </td>
                    <td className="py-3 px-3 text-right">
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        value={item.price}
                        onChange={(e) =>
                          updateLineItem(idx, "price", parseFloat(e.target.value) || 0)
                        }
                        className="w-28 h-8 rounded-lg border border-slate-200 bg-white px-2 text-right font-mono text-xs text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {item.amount.toLocaleString("vi-VN")} đ
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => removeLineItem(idx)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary Footer */}
        {lineItems.length > 0 && (
          <div className="mt-6 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-medium text-slate-500">
                  Tổng số lượng hàng:{" "}
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {totals.totalQty.toLocaleString("vi-VN")}
                  </span>
                </div>
                <div className="text-xs italic text-slate-600 dark:text-slate-400">
                  <span className="font-semibold not-italic">Bằng chữ: </span>
                  {totals.words}
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs text-slate-500">Tổng tiền hàng (theo giá bán):</span>
                <div className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
                  {totals.totalAmount.toLocaleString("vi-VN")} đ
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-3 pb-8">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={submitting}
            className="h-10 px-5 text-xs font-semibold"
          >
            Hủy bỏ
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={() => handleSubmit(false)}
          disabled={submitting || lineItems.length === 0}
          className="h-10 px-5 text-xs font-semibold flex items-center gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-900 dark:text-indigo-300"
        >
          <Save className="h-4 w-4" />
          {submitting ? "Đang lưu..." : "Chỉ lưu phiếu"}
        </Button>

        <Button
          type="button"
          onClick={() => handleSubmit(true)}
          disabled={submitting || lineItems.length === 0}
          className="h-10 px-6 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md flex items-center gap-2"
        >
          <Printer className="h-4 w-4" />
          {submitting ? "Đang xử lý & in..." : "Lưu & In ngay (KiotViet)"}
        </Button>
      </div>
    </div>
  );
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
