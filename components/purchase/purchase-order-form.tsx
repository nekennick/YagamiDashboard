"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Search,
  Trash2,
  Save,
  RotateCw,
  Building2,
  Calendar,
  User,
  Truck,
  FileText,
  AlertCircle,
  Eye,
  Send,
  X,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Pencil
} from "lucide-react";
import type { GoogleSheetPreviewResult } from "@/lib/google-sheets/purchase-sync";
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

export type PurchaseOrderRowItem = {
  id?: number;
  productId?: number;
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
  status?: string;
  branch?: { id?: number; name?: string; address?: string | null; kvBranchId?: number };
  supplier?: { id?: number; name?: string; phone?: string | null };
  items?: PurchaseOrderRowItem[];
};

export type CreatedPurchaseOrder = {
  id: number;
  code: string;
  purchaseDate: string | Date;
  delivererName?: string | null;
  supplierName?: string | null;
  branch?: { name: string; address?: string | null };
  supplier?: { name: string };
  note?: string | null;
  totalAmount: number | string;
  totalQuantity: number | string;
  items: Array<{
    productCode?: string | null;
    productName: string;
    unit?: string | null;
    quantity: number | string;
    price: number | string;
    amount: number | string;
  }>;
};

type Props = {
  branches: BranchItem[];
  products: ProductItem[];
  initialOrder?: PurchaseOrderRow | null;
  onSuccess: (order: CreatedPurchaseOrder, shouldPrint: boolean, message?: string) => void;
  onCancel?: () => void;
};

export const PurchaseOrderForm: React.FC<Props> = ({
  branches,
  products,
  initialOrder,
  onSuccess,
  onCancel
}) => {
  const isEditing = Boolean(initialOrder);

  // Form State
  const [selectedBranchId, setSelectedBranchId] = useState<number>(() => {
    if (initialOrder?.branch?.id) return initialOrder.branch.id;
    return getDefaultBranchId(branches);
  });
  const [purchaseDate, setPurchaseDate] = useState<string>(() => {
    if (initialOrder?.purchaseDate) {
      try {
        return new Date(initialOrder.purchaseDate).toISOString().split("T")[0];
      } catch {
        return new Date().toISOString().split("T")[0];
      }
    }
    return new Date().toISOString().split("T")[0];
  });
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(
    initialOrder?.supplier?.id ? String(initialOrder.supplier.id) : ""
  );
  const [delivererName, setDelivererName] = useState<string>(initialOrder?.delivererName || "");
  const [note, setNote] = useState<string>(initialOrder?.note || "");
  const [lineItems, setLineItems] = useState<FormLineItem[]>(() => {
    if (initialOrder?.items && initialOrder.items.length > 0) {
      return initialOrder.items.map((i) => ({
        productId: i.productId || 0,
        productCode: i.productCode || "",
        productName: i.productName,
        unit: i.unit || "Cái",
        quantity: Number(i.quantity) || 0,
        price: Number(i.price) || 0,
        amount: Number(i.amount) || 0
      }));
    }
    return [];
  });

  // When initialOrder changes (e.g. user selects a different draft to edit)
  useEffect(() => {
    if (initialOrder) {
      if (initialOrder.branch?.id) {
        setSelectedBranchId(initialOrder.branch.id);
      }
      if (initialOrder.purchaseDate) {
        try {
          const d = new Date(initialOrder.purchaseDate);
          setPurchaseDate(d.toISOString().split("T")[0]);
        } catch {
          // ignore
        }
      }
      setSelectedSupplierId(initialOrder.supplier?.id ? String(initialOrder.supplier.id) : "");
      setDelivererName(initialOrder.delivererName || "");
      setNote(initialOrder.note || "");
      if (Array.isArray(initialOrder.items)) {
        setLineItems(
          initialOrder.items.map((i) => ({
            productId: i.productId || 0,
            productCode: i.productCode || "",
            productName: i.productName,
            unit: i.unit || "Cái",
            quantity: Number(i.quantity) || 0,
            price: Number(i.price) || 0,
            amount: Number(i.amount) || 0
          }))
        );
      }
    } else {
      setSelectedBranchId(getDefaultBranchId(branches));
    }
  }, [initialOrder, branches]);

  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setIsSearchOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Supplier State & Sync
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);
  const [syncingSuppliers, setSyncingSuppliers] = useState(false);

  // Excel Import State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importNotice, setImportNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [importResult, setImportResult] = useState<{
    totalRows: number;
    validCount: number;
    skippedCount: number;
    validItems: Array<{
      productId: number;
      productCode: string;
      productName: string;
      unit: string;
      quantity: number;
      price: number;
      amount: number;
      occurrences: number;
    }>;
    skippedItems: Array<{
      rowNumber: number;
      code: string;
      productName?: string;
      quantity?: number;
      reason: string;
    }>;
  } | null>(null);

  // Google Sheet Sync State
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [showSheetModal, setShowSheetModal] = useState(false);
  const [sheetResult, setSheetResult] = useState<GoogleSheetPreviewResult | null>(null);
  const [activeSheetTab, setActiveSheetTab] = useState<"new" | "synced" | "skipped">("new");
  const [sheetUrlInput, setSheetUrlInput] = useState("");
  const [isEditingSheetUrl, setIsEditingSheetUrl] = useState(false);
  const [isSavingSheetUrl, setIsSavingSheetUrl] = useState(false);
  const [applySheetSuggestedInfo, setApplySheetSuggestedInfo] = useState(true);
  const [pendingSheetSyncItems, setPendingSheetSyncItems] = useState<
    Array<{
      sheetRowId: string;
      rawMaPhieu?: string;
      productCode?: string;
      productName?: string;
      quantity?: number;
      receivedDate?: string;
      receivedTime?: string;
      staffName?: string;
    }>
  >([]);

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);

  // Handle Excel File Upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsImporting(true);
    setErrorMessage(null);
    setImportNotice(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/purchase-orders/import", {
        method: "POST",
        body: formData
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Không thể đọc file Excel.");
      }

      setImportResult(data);
      setShowImportModal(true);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Đã xảy ra lỗi khi đọc file Excel.");
    } finally {
      setIsImporting(false);
    }
  };

  // Confirm and Apply Excel Import Items
  const handleApplyImport = () => {
    if (!importResult || !importResult.validItems.length) return;

    let mergedCount = 0;
    let addedCount = 0;

    setLineItems((prev) => {
      const next = [...prev];
      const indexMap = new Map<number, number>();
      next.forEach((item, idx) => indexMap.set(item.productId, idx));

      for (const item of importResult.validItems) {
        if (indexMap.has(item.productId)) {
          // Mã đã tồn tại trong phiếu: Cộng dồn số lượng
          const idx = indexMap.get(item.productId)!;
          const current = next[idx];
          const newQty = current.quantity + item.quantity;
          next[idx] = {
            ...current,
            quantity: newQty,
            amount: newQty * current.price
          };
          mergedCount++;
        } else {
          // Mã chưa có: Thêm mới
          next.push({
            productId: item.productId,
            productCode: item.productCode,
            productName: item.productName,
            unit: item.unit,
            quantity: item.quantity,
            price: item.price,
            amount: item.amount
          });
          indexMap.set(item.productId, next.length - 1);
          addedCount++;
        }
      }
      return next;
    });

    setShowImportModal(false);
    const summaryMsg = `Đã nhập thành công ${addedCount} mặt hàng mới${
      mergedCount > 0 ? ` và cộng dồn ${mergedCount} mặt hàng đã có sẵn` : ""
    } từ file Excel!`;
    setImportNotice({ type: "success", message: summaryMsg });
    setTimeout(() => setImportNotice(null), 6000);
  };

  // Handle Google Sheet Sync
  const handleFetchGoogleSheet = async (customUrl?: string) => {
    setIsSyncingSheet(true);
    setErrorMessage(null);
    try {
      const url = customUrl ? `/api/purchase-orders/google-sheet?url=${encodeURIComponent(customUrl)}` : "/api/purchase-orders/google-sheet";
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Không thể tải dữ liệu từ Google Sheet.");
      }
      setSheetResult(data);
      setSheetUrlInput(data.sheetUrl || "");
      setActiveSheetTab(data.newValidCount > 0 ? "new" : data.alreadySyncedCount > 0 ? "synced" : "skipped");
      setShowSheetModal(true);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Đã xảy ra lỗi khi đồng bộ Google Sheet.");
    } finally {
      setIsSyncingSheet(false);
    }
  };

  const handleSaveSheetUrl = async () => {
    if (!sheetUrlInput.trim()) return;
    setIsSavingSheetUrl(true);
    try {
      const res = await fetch("/api/purchase-orders/google-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sheetUrlInput.trim() })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Không thể lưu đường dẫn Google Sheet.");
      }
      setSheetResult(data);
      setIsEditingSheetUrl(false);
      setActiveSheetTab(data.newValidCount > 0 ? "new" : data.alreadySyncedCount > 0 ? "synced" : "skipped");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Đã xảy ra lỗi khi lưu URL Google Sheet.");
    } finally {
      setIsSavingSheetUrl(false);
    }
  };

  const handleApplyGoogleSheet = () => {
    if (!sheetResult || !sheetResult.validItems.length) return;

    let mergedCount = 0;
    let addedCount = 0;
    const newSyncItems: typeof pendingSheetSyncItems = [];

    setLineItems((prev) => {
      const next = [...prev];
      const indexMap = new Map<number, number>();
      next.forEach((item, idx) => indexMap.set(item.productId, idx));

      for (const item of sheetResult.validItems) {
        for (let i = 0; i < item.sheetRowIds.length; i++) {
          newSyncItems.push({
            sheetRowId: item.sheetRowIds[i],
            rawMaPhieu: item.rawMaPhieuList[i] || item.rawMaPhieuList[0],
            productCode: item.productCode,
            productName: item.productName,
            quantity: item.quantity,
            receivedDate: item.suggestedDate,
            staffName: item.suggestedDeliverer
          });
        }

        if (indexMap.has(item.productId)) {
          const idx = indexMap.get(item.productId)!;
          const current = next[idx];
          const newQty = current.quantity + item.quantity;
          next[idx] = {
            ...current,
            quantity: newQty,
            amount: newQty * current.price
          };
          mergedCount++;
        } else {
          next.push({
            productId: item.productId,
            productCode: item.productCode,
            productName: item.productName,
            unit: item.unit,
            quantity: item.quantity,
            price: item.price,
            amount: item.amount
          });
          indexMap.set(item.productId, next.length - 1);
          addedCount++;
        }
      }
      return next;
    });

    setPendingSheetSyncItems((prev) => [...prev, ...newSyncItems]);

    if (applySheetSuggestedInfo) {
      if (!delivererName.trim() && sheetResult.suggestedDeliverer) {
        setDelivererName(sheetResult.suggestedDeliverer);
      }
    }

    setShowSheetModal(false);
    const summaryMsg = `Đã đồng bộ ${addedCount} mặt hàng mới${
      mergedCount > 0 ? ` (cộng dồn ${mergedCount} mặt hàng trùng)` : ""
    } từ Google Sheet!${
      sheetResult.alreadySyncedCount > 0
        ? ` (Tự động bỏ qua ${sheetResult.alreadySyncedCount} dòng đã nhập trước đây)`
        : ""
    }`;
    setImportNotice({ type: "success", message: summaryMsg });
    setTimeout(() => setImportNotice(null), 7000);
  };

  // Fetch Suppliers
  const loadSuppliers = async (sync = false) => {
    if (sync) setSyncingSuppliers(true);

    try {
      const res = await fetch(`/api/suppliers${sync ? "?sync=true" : ""}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.suppliers)) {
        setSuppliers(data.suppliers);
      }
    } catch (err) {
      console.error("Không thể tải danh sách nhà cung cấp", err);
    } finally {
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

  // Open Review Modal before pushing to KiotViet
  const handleOpenReview = () => {
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

    setShowReviewModal(true);
  };

  // Submit Handler: isDraft = true -> Lưu phiếu tạm (POST/PUT), isDraft = false -> Đẩy lên KiotViet
  const handleSubmit = async (isDraft: boolean) => {
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
        isDraft,
        items: lineItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price
        })),
        sheetSyncItems: pendingSheetSyncItems.length > 0 ? pendingSheetSyncItems : undefined
      };

      const url = initialOrder ? `/api/purchase-orders/${initialOrder.id}` : "/api/purchase-orders";
      const method = initialOrder ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || (isDraft ? "Lưu phiếu tạm thất bại" : "Tạo phiếu nhập thất bại"));
      }

      setShowReviewModal(false);
      onSuccess(data.order, false, data.message);
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              {isEditing ? `Chỉnh sửa phiếu tạm: ${initialOrder?.code}` : "Lập phiếu nhập hàng mới"}
              {isEditing && (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                  Phiếu tạm
                </span>
              )}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {isEditing
                ? "Chỉnh sửa số lượng, giá bán hoặc danh sách hàng hóa. Bạn có thể lưu lại tiếp hoặc đẩy lên KiotViet."
                : "Nhập số lượng hàng thực nhận. Đơn giá bán sẽ tự động được điền theo giá niêm yết KiotViet."}
            </p>
          </div>
        </div>

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
                  {b.name}{b.address ? ` - ${b.address}` : ""}
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
          {/* Quick Search Input & Import Excel (Bên trái) */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            <div ref={searchContainerRef} className="relative w-full sm:w-[380px]">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Gõ tên hoặc mã hàng để thêm nhanh..."
                value={searchQuery}
                onFocus={() => setIsSearchOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setIsSearchOpen(false);
                }}
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

            {/* Nút Nhập file Excel & File mẫu */}
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                disabled={isImporting}
                onClick={() => fileInputRef.current?.click()}
                className="h-10 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 text-xs font-semibold gap-2 shadow-sm shrink-0"
              >
                {isImporting ? (
                  <RotateCw className="h-4 w-4 animate-spin text-emerald-600" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                )}
                <span>{isImporting ? "Đang đọc..." : "Nhập Excel"}</span>
              </Button>

              {/* Nút Đồng bộ Google Sheet */}
              <Button
                type="button"
                variant="outline"
                disabled={isSyncingSheet}
                onClick={() => handleFetchGoogleSheet()}
                className="h-10 px-3.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60 text-xs font-semibold gap-2 shadow-sm shrink-0 transition"
                title="Đồng bộ các dòng mới chưa nhập từ Google Sheet"
              >
                {isSyncingSheet ? (
                  <RotateCw className="h-4 w-4 animate-spin text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400 fill-current" viewBox="0 0 24 24">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H6v-2h6v2zm0-4H6v-2h6v2zm0-4H6V7h6v2zm6 8h-4v-2h4v2zm0-4h-4v-2h4v2zm0-4h-4V7h4v2z" />
                  </svg>
                )}
                <span>{isSyncingSheet ? "Đang kết nối..." : "Đồng bộ Google Sheet"}</span>
              </Button>

              <a
                href="/api/purchase-orders/import-template"
                download="Mau_Nhap_Hang_Yagami.xlsx"
                title="Tải file Excel mẫu gồm cột Mã hàng và Số lượng"
                className="h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 text-xs font-medium flex items-center gap-1.5 transition shrink-0"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                <span className="hidden md:inline">File mẫu</span>
              </a>
            </div>
          </div>

          <div className="sm:text-right">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Chi tiết hàng hóa nhập ({lineItems.length} mặt hàng)
            </h3>
            <span className="text-xs text-slate-500">
              Tìm theo mã SKU hoặc nhập từ file Excel để thêm nhanh
            </span>
          </div>
        </div>

        {/* Thông báo kết quả Import Excel */}
        {importNotice && (
          <div
            className={`mt-4 flex items-center justify-between p-3.5 rounded-xl border text-xs animate-in fade-in ${
              importNotice.type === "success"
                ? "bg-emerald-50/80 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300"
                : "bg-red-50/80 border-red-200 text-red-800 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300"
            }`}
          >
            <div className="flex items-center gap-2">
              {importNotice.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              )}
              <span>{importNotice.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setImportNotice(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 ml-3"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

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
          onClick={() => handleSubmit(true)}
          disabled={submitting || lineItems.length === 0}
          className="h-10 px-5 text-xs font-semibold flex items-center gap-2 border-amber-300 bg-amber-50/50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
          title="Lưu lại dưới dạng phiếu tạm nội bộ (chưa trừ kho hay đồng bộ lên KiotViet)"
        >
          <Save className="h-4 w-4" />
          {submitting ? "Đang lưu..." : isEditing ? "Lưu cập nhật phiếu tạm" : "Lưu phiếu tạm"}
        </Button>

        <Button
          type="button"
          onClick={handleOpenReview}
          disabled={submitting || lineItems.length === 0}
          className="h-10 px-6 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md flex items-center gap-2"
        >
          <Eye className="h-4 w-4" />
          Xem lại &amp; Đẩy lên KiotViet
        </Button>
      </div>

      {/* Review Modal before pushing to KiotViet */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                  <Eye className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Xem lại danh sách hàng nhập
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                      Chuẩn bị đẩy lên KiotViet
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Kiểm tra lại số lượng và đơn giá. Bấm &quot;Xác nhận &amp; Đẩy lên KiotViet&quot; để tạo phiếu chính thức.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                disabled={submitting}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {errorMessage && (
                <div className="flex items-start gap-2.5 rounded-xl bg-red-50 p-3.5 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-red-600" />
                  <div>
                    <span className="font-bold block mb-0.5">Không thể đẩy phiếu lên KiotViet:</span>
                    <span>{errorMessage}</span>
                  </div>
                </div>
              )}

              {/* Meta Info summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800">
                <div>
                  <span className="text-slate-400 block text-[11px]">Kho nhập</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {branches.find((b) => b.id === selectedBranchId)?.name || "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Ngày nhập</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {purchaseDate}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Nhà cung cấp</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {suppliers.find((s) => s.id === Number(selectedSupplierId))?.name || "Chưa chọn"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Người giao hàng</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {delivererName || "—"}
                  </span>
                </div>
                {note && (
                  <div className="col-span-2 sm:col-span-4 mt-1 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                    <span className="text-slate-400 text-[11px]">Ghi chú: </span>
                    <span className="italic text-slate-700 dark:text-slate-300">{note}</span>
                  </div>
                )}
              </div>

              {/* Items Table */}
              <div className="rounded-xl border border-slate-200 overflow-hidden dark:border-slate-800">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800/80 text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase border-b border-slate-200 dark:border-slate-800">
                      <th className="py-2.5 px-3 w-10 text-center">STT</th>
                      <th className="py-2.5 px-3 w-28">Mã hàng</th>
                      <th className="py-2.5 px-4">Tên hàng hóa</th>
                      <th className="py-2.5 px-3 w-16 text-center">ĐVT</th>
                      <th className="py-2.5 px-3 w-28 text-right">Số lượng nhập</th>
                      <th className="py-2.5 px-3 w-32 text-right">Đơn giá bán</th>
                      <th className="py-2.5 px-4 w-36 text-right">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {lineItems.map((item, idx) => (
                      <tr key={item.productId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 text-center text-slate-400 font-medium">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-mono font-medium text-slate-700 dark:text-slate-300">{item.productCode || "-"}</td>
                        <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-white">{item.productName}</td>
                        <td className="py-2.5 px-3 text-center text-slate-500">{item.unit || "-"}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {Number(item.quantity).toLocaleString("vi-VN")}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                          {Number(item.price).toLocaleString("vi-VN")} đ
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {Number(item.amount).toLocaleString("vi-VN")} đ
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals Summary */}
              <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      Tổng cộng: <span className="font-bold text-slate-900 dark:text-white">{totals.totalItems} mặt hàng</span> · Tổng số lượng: <span className="font-bold text-slate-900 dark:text-white">{totals.totalQty.toLocaleString("vi-VN")}</span>
                    </div>
                    <div className="text-xs italic text-slate-600 dark:text-slate-400">
                      <span className="font-semibold not-italic">Bằng chữ: </span>
                      {totals.words}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[11px] text-slate-500 block">Tổng tiền hàng (theo giá bán):</span>
                    <div className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
                      {totals.totalAmount.toLocaleString("vi-VN")} đ
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 rounded-b-2xl">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowReviewModal(false)}
                disabled={submitting}
                className="h-10 px-5 text-xs font-semibold"
              >
                Quay lại chỉnh sửa
              </Button>
              <Button
                type="button"
                onClick={() => handleSubmit(false)}
                disabled={submitting}
                className="h-10 px-6 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md flex items-center gap-2"
              >
                <Send className="h-4 w-4" />
                {submitting ? "Đang đẩy lên KiotViet..." : "Xác nhận & Đẩy lên KiotViet"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Excel Import Preview Modal */}
      {showImportModal && importResult && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between p-6 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                  <FileSpreadsheet className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Xem trước dữ liệu nhập từ Excel
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Kiểm tra danh sách mặt hàng và số lượng trước khi thêm vào phiếu nhập
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href="/api/purchase-orders/import-template"
                  download="Mau_Nhap_Hang_Yagami.xlsx"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 text-xs font-medium transition"
                >
                  <Download className="h-3.5 w-3.5 text-slate-500" />
                  <span>File mẫu</span>
                </a>
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                  <span className="text-[11px] font-medium text-slate-500 block">Tổng số dòng đọc được</span>
                  <span className="text-xl font-bold text-slate-900 dark:text-white mt-1 block">
                    {importResult.totalRows} <span className="text-xs font-normal text-slate-400">dòng</span>
                  </span>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                  <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 block">Mặt hàng hợp lệ</span>
                  <span className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-1 block">
                    {importResult.validCount} <span className="text-xs font-normal text-emerald-600/70">sản phẩm</span>
                  </span>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
                  <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 block">Dòng không hợp lệ / Bỏ qua</span>
                  <span className="text-xl font-bold text-amber-700 dark:text-amber-400 mt-1 block">
                    {importResult.skippedCount} <span className="text-xs font-normal text-amber-600/70">dòng</span>
                  </span>
                </div>
              </div>

              {/* Warning box for skipped items */}
              {importResult.skippedCount > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/20 text-xs">
                  <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-300 mb-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <span>Chi tiết các dòng bị bỏ qua ({importResult.skippedCount} dòng):</span>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1 pr-1 text-slate-700 dark:text-slate-300">
                    {importResult.skippedItems.map((item, idx) => (
                      <div key={idx} className="flex items-start justify-between py-1 border-b border-amber-100/60 dark:border-amber-900/30 last:border-none text-[11px]">
                        <div>
                          <span className="font-semibold text-slate-900 dark:text-white">Dòng {item.rowNumber}:</span>{" "}
                          <code className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-800 font-mono">
                            {item.code}
                          </code>
                          {item.productName && <span className="text-slate-500 ml-1.5">({item.productName})</span>}
                        </div>
                        <span className="text-amber-700 dark:text-amber-400 font-medium ml-2 text-right">
                          {item.reason}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Valid Items Table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <span>Danh sách sản phẩm sẽ thêm vào phiếu:</span>
                    <span className="text-slate-400 font-normal">({importResult.validItems.length} mặt hàng)</span>
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    * Các mã đã có trong phiếu sẽ tự động được cộng dồn số lượng
                  </span>
                </div>

                {importResult.validItems.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                    Không tìm thấy mặt hàng hợp lệ nào trong file Excel đã chọn.
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/80 text-[11px] font-semibold text-slate-500 border-b border-slate-200 dark:border-slate-700 z-10 backdrop-blur-sm">
                          <tr>
                            <th className="py-2.5 px-3 w-10 text-center">STT</th>
                            <th className="py-2.5 px-3">Mã hàng</th>
                            <th className="py-2.5 px-3">Tên sản phẩm</th>
                            <th className="py-2.5 px-3 text-center">ĐVT</th>
                            <th className="py-2.5 px-3 text-center">SL nhập</th>
                            <th className="py-2.5 px-3 text-right">Đơn giá bán lẻ</th>
                            <th className="py-2.5 px-3 text-right">Thành tiền</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {importResult.validItems.map((item, idx) => (
                            <tr key={item.productId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                              <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                              <td className="py-2.5 px-3 font-mono font-medium text-slate-900 dark:text-white">
                                {item.productCode}
                                {item.occurrences > 1 && (
                                  <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 font-sans">
                                    Gộp {item.occurrences} dòng
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200">{item.productName}</td>
                              <td className="py-2.5 px-3 text-center text-slate-500">{item.unit}</td>
                              <td className="py-2.5 px-3 text-center font-bold text-indigo-600 dark:text-indigo-400">{item.quantity}</td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                                {item.price.toLocaleString("vi-VN")} đ
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                                {item.amount.toLocaleString("vi-VN")} đ
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 rounded-b-3xl">
              <div className="text-xs text-slate-600 dark:text-slate-300 text-center sm:text-left">
                Tổng cộng nhập:{" "}
                <span className="font-bold text-slate-900 dark:text-white">
                  {importResult.validItems.reduce((acc, i) => acc + i.quantity, 0).toLocaleString("vi-VN")}
                </span>{" "}
                mặt hàng (Ước tính:{" "}
                <span className="font-bold font-mono text-indigo-600 dark:text-indigo-400">
                  {importResult.validItems.reduce((acc, i) => acc + i.amount, 0).toLocaleString("vi-VN")} đ
                </span>
                )
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowImportModal(false)}
                  className="h-10 px-4 text-xs font-semibold"
                >
                  Hủy bỏ
                </Button>
                <Button
                  type="button"
                  onClick={handleApplyImport}
                  disabled={importResult.validItems.length === 0}
                  className="h-10 px-5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md flex items-center gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Xác nhận thêm vào phiếu nhập</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Xem Trước Đồng Bộ Google Sheet */}
      {showSheetModal && sheetResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-3xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 rounded-t-3xl">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400">
                  <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H6v-2h6v2zm0-4H6v-2h6v2zm0-4H6V7h6v2zm6 8h-4v-2h4v2zm0-4h-4v-2h4v2zm0-4h-4V7h4v2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Đồng bộ hàng nhập từ Google Sheet
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-500 truncate max-w-xs sm:max-w-md">
                      {sheetResult.sheetUrl}
                    </span>
                    <a
                      href={sheetResult.sheetUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Mở file Google Sheet trong tab mới"
                      className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 p-0.5 rounded transition"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => setIsEditingSheetUrl(!isEditingSheetUrl)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-[11px] underline flex items-center gap-1"
                    >
                      <Pencil className="h-3 w-3" />
                      <span>{isEditingSheetUrl ? "Đóng" : "Đổi link"}</span>
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isSyncingSheet}
                  onClick={() => handleFetchGoogleSheet()}
                  className="h-8 px-2.5 text-xs font-medium rounded-xl gap-1.5"
                  title="Quét lại dữ liệu từ Google Sheet"
                >
                  <RotateCw className={`h-3.5 w-3.5 ${isSyncingSheet ? "animate-spin text-emerald-600" : "text-slate-500"}`} />
                  <span>Quét lại</span>
                </Button>
                <button
                  type="button"
                  onClick={() => setShowSheetModal(false)}
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Edit URL Drawer / Input */}
            {isEditingSheetUrl && (
              <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 animate-in slide-in-from-top-2 duration-150">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Đường dẫn Google Sheet (Chế độ xem công khai: Bất kỳ ai có đường liên kết):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={sheetUrlInput}
                    onChange={(e) => setSheetUrlInput(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=..."
                    className="flex-1 h-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs outline-none focus:border-emerald-500"
                  />
                  <Button
                    type="button"
                    disabled={isSavingSheetUrl || !sheetUrlInput.trim()}
                    onClick={handleSaveSheetUrl}
                    className="h-9 px-4 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {isSavingSheetUrl ? "Đang lưu..." : "Lưu & Quét lại"}
                  </Button>
                </div>
              </div>
            )}

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div
                  onClick={() => setActiveSheetTab("new")}
                  className={`rounded-2xl border p-4 cursor-pointer transition ${
                    activeSheetTab === "new"
                      ? "border-emerald-500 bg-emerald-50/80 dark:border-emerald-600 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20"
                      : "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20 hover:border-emerald-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                      Mới cần nhập
                    </span>
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                  <span className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-1 block">
                    {sheetResult.newValidCount}{" "}
                    <span className="text-xs font-normal text-emerald-600/70">mặt hàng</span>
                  </span>
                  <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 block mt-0.5">
                    Tổng SL: {sheetResult.validItems.reduce((acc, i) => acc + i.quantity, 0).toLocaleString("vi-VN")}
                  </span>
                </div>

                <div
                  onClick={() => setActiveSheetTab("synced")}
                  className={`rounded-2xl border p-4 cursor-pointer transition ${
                    activeSheetTab === "synced"
                      ? "border-slate-400 bg-slate-100 dark:border-slate-600 dark:bg-slate-800 ring-2 ring-slate-400/20"
                      : "border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/50 hover:border-slate-300"
                  }`}
                >
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                    Đã nhập trước đây (Bỏ qua)
                  </span>
                  <span className="text-2xl font-black text-slate-700 dark:text-slate-300 mt-1 block">
                    {sheetResult.alreadySyncedCount}{" "}
                    <span className="text-xs font-normal text-slate-400">dòng</span>
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Tự động nhận diện để tránh trùng
                  </span>
                </div>

                <div
                  onClick={() => setActiveSheetTab("skipped")}
                  className={`rounded-2xl border p-4 cursor-pointer transition ${
                    activeSheetTab === "skipped"
                      ? "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/40 ring-2 ring-amber-400/20"
                      : "border-amber-200 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20 hover:border-amber-300"
                  }`}
                >
                  <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 block">
                    Bỏ qua / Không hợp lệ
                  </span>
                  <span className="text-2xl font-black text-amber-700 dark:text-amber-400 mt-1 block">
                    {sheetResult.skippedCount}{" "}
                    <span className="text-xs font-normal text-amber-600/70">dòng</span>
                  </span>
                  <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80 block mt-0.5">
                    {sheetResult.skippedCount > 0 ? "Mã sai hoặc thiếu số lượng" : "Không có dòng lỗi"}
                  </span>
                </div>
              </div>

              {/* Tab Navigation */}
              <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveSheetTab("new")}
                  className={`pb-2.5 text-xs font-bold transition border-b-2 flex items-center gap-1.5 ${
                    activeSheetTab === "new"
                      ? "border-emerald-600 text-emerald-700 dark:text-emerald-400 dark:border-emerald-400"
                      : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Hàng mới sẽ nhập ({sheetResult.newValidCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSheetTab("synced")}
                  className={`pb-2.5 text-xs font-bold transition border-b-2 flex items-center gap-1.5 ${
                    activeSheetTab === "synced"
                      ? "border-slate-600 text-slate-900 dark:text-white dark:border-slate-300"
                      : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <span>Đã nhập trước đó ({sheetResult.alreadySyncedCount})</span>
                </button>

                {sheetResult.skippedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveSheetTab("skipped")}
                    className={`pb-2.5 text-xs font-bold transition border-b-2 flex items-center gap-1.5 ${
                      activeSheetTab === "skipped"
                        ? "border-amber-600 text-amber-700 dark:text-amber-400 dark:border-amber-400"
                        : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>Dòng lỗi ({sheetResult.skippedCount})</span>
                  </button>
                )}
              </div>

              {/* Tab 1: New Valid Items */}
              {activeSheetTab === "new" && (
                <div>
                  {sheetResult.validItems.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-500 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 space-y-2">
                      <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
                      <p className="font-semibold text-slate-700 dark:text-slate-200">
                        Tuyệt vời! Tất cả các dòng trên Google Sheet đều đã được nhập trước đây.
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Không còn mặt hàng mới nào đang chờ nhập.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                      <div className="max-h-72 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/80 text-[11px] font-semibold text-slate-500 border-b border-slate-200 dark:border-slate-700 z-10 backdrop-blur-sm">
                            <tr>
                              <th className="py-2.5 px-3 w-10 text-center">STT</th>
                              <th className="py-2.5 px-3">Mã phiếu (Sheet)</th>
                              <th className="py-2.5 px-3">Mã hàng</th>
                              <th className="py-2.5 px-3">Tên sản phẩm</th>
                              <th className="py-2.5 px-3 text-center">ĐVT</th>
                              <th className="py-2.5 px-3 text-center">SL nhập</th>
                              <th className="py-2.5 px-3 text-right">Đơn giá</th>
                              <th className="py-2.5 px-3 text-right">Thành tiền</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {sheetResult.validItems.map((item, idx) => (
                              <tr key={item.productId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                                <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                                <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                                  {item.rawMaPhieuList.join(", ") || "—"}
                                </td>
                                <td className="py-2.5 px-3 font-mono font-medium text-slate-900 dark:text-white">
                                  {item.productCode}
                                  {item.occurrences > 1 && (
                                    <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-sans">
                                      Gộp {item.occurrences} dòng
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">{item.productName}</td>
                                <td className="py-2.5 px-3 text-center text-slate-500">{item.unit}</td>
                                <td className="py-2.5 px-3 text-center font-bold text-emerald-600 dark:text-emerald-400">
                                  {item.quantity.toLocaleString("vi-VN")}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                                  {item.price.toLocaleString("vi-VN")} đ
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                                  {item.amount.toLocaleString("vi-VN")} đ
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Already Synced Items */}
              {activeSheetTab === "synced" && (
                <div>
                  {sheetResult.alreadySyncedItems.length === 0 ? (
                    <div className="py-10 text-center text-xs text-slate-400 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                      Chưa có dòng nào được đánh dấu là đã nhập trước đây.
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                      <div className="max-h-72 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/80 text-[11px] font-semibold text-slate-500 border-b border-slate-200 dark:border-slate-700 z-10 backdrop-blur-sm">
                            <tr>
                              <th className="py-2.5 px-3 w-10 text-center">STT</th>
                              <th className="py-2.5 px-3">Mã phiếu (Sheet)</th>
                              <th className="py-2.5 px-3">Mã hàng</th>
                              <th className="py-2.5 px-3">Tên sản phẩm</th>
                              <th className="py-2.5 px-3 text-center">SL</th>
                              <th className="py-2.5 px-3">Thời gian ghi nhận</th>
                              <th className="py-2.5 px-3 text-center">Trạng thái</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {sheetResult.alreadySyncedItems.map((item, idx) => (
                              <tr key={idx} className="opacity-70 hover:opacity-100 transition">
                                <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                                <td className="py-2 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                                  {item.maPhieu || "—"}
                                </td>
                                <td className="py-2 px-3 font-mono text-slate-700 dark:text-slate-300">{item.productCode}</td>
                                <td className="py-2 px-3 text-slate-700 dark:text-slate-300">{item.productName || "—"}</td>
                                <td className="py-2 px-3 text-center font-medium text-slate-600 dark:text-slate-400">
                                  {item.quantity.toLocaleString("vi-VN")}
                                </td>
                                <td className="py-2 px-3 text-slate-500 text-[11px]">{item.receivedDate || "—"}</td>
                                <td className="py-2 px-3 text-center">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    Đã nhập
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Skipped Items */}
              {activeSheetTab === "skipped" && (
                <div>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/20 text-xs">
                    <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 text-slate-700 dark:text-slate-300">
                      {sheetResult.skippedItems.map((item, idx) => (
                        <div key={idx} className="flex items-start justify-between py-1.5 border-b border-amber-100/60 dark:border-amber-900/30 last:border-none text-[11px]">
                          <div>
                            <span className="font-semibold text-slate-900 dark:text-white">Dòng {item.rowNumber}:</span>{" "}
                            {item.maPhieu && <span className="text-slate-500 font-mono mr-1.5">[{item.maPhieu}]</span>}
                            <code className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-800 font-mono">
                              {item.code}
                            </code>
                            {item.productName && <span className="text-slate-500 ml-1.5">({item.productName})</span>}
                          </div>
                          <span className="text-amber-700 dark:text-amber-400 font-semibold ml-2 text-right">
                            {item.reason}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Suggestion & Options */}
              {sheetResult.newValidCount > 0 && sheetResult.suggestedDeliverer && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="applySuggested"
                      checked={applySheetSuggestedInfo}
                      onChange={(e) => setApplySheetSuggestedInfo(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <label htmlFor="applySuggested" className="text-slate-700 dark:text-slate-300 cursor-pointer">
                      Tự động điền người giao hàng từ Google Sheet:{" "}
                      <span className="font-bold text-slate-900 dark:text-white">{sheetResult.suggestedDeliverer}</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 rounded-b-3xl">
              <div className="text-xs text-slate-600 dark:text-slate-300 text-center sm:text-left">
                Tổng cộng:{" "}
                <span className="font-bold text-slate-900 dark:text-white">
                  {sheetResult.validItems.reduce((acc, i) => acc + i.quantity, 0).toLocaleString("vi-VN")}
                </span>{" "}
                mặt hàng (Ước tính:{" "}
                <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {sheetResult.validItems.reduce((acc, i) => acc + i.amount, 0).toLocaleString("vi-VN")} đ
                </span>
                )
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowSheetModal(false)}
                  className="h-10 px-4 text-xs font-semibold"
                >
                  Đóng
                </Button>
                <Button
                  type="button"
                  onClick={handleApplyGoogleSheet}
                  disabled={sheetResult.validItems.length === 0}
                  className="h-10 px-5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md flex items-center gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Xác nhận thêm vào phiếu nhập ({sheetResult.validItems.length})</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
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

function getDefaultBranchId(branches: BranchItem[]): number {
  if (!branches || branches.length === 0) return 0;
  // Ưu tiên chọn chi nhánh Tổng kho Cao Lãnh
  const caoLanh = branches.find((b) => {
    const text = normalize(`${b.name} ${b.address || ""}`);
    return text.includes("cao lanh") || (text.includes("tong kho") && !text.includes("binh duong"));
  });
  return caoLanh ? caoLanh.id : branches[0].id;
}
