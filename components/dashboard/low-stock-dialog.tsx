"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { Search, X, AlertTriangle, Loader2 } from "lucide-react";

interface LowStockItem {
  productId: number;
  branchId: number;
  onHand: string | number;
  product: {
    code: string | null;
    name: string;
  };
  branch: {
    name: string;
  };
}

interface LowStockDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LowStockDialog({ isOpen, onClose }: LowStockDialogProps) {
  const [items, setItems] = useState<LowStockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setError(null);
      setSearchQuery("");
      setPageSize(20); // Reset về mặc định 20 khi mở lại
      
      fetch("/api/inventory/low-stock")
        .then((res) => {
          if (!res.ok) throw new Error("Không thể lấy dữ liệu tồn kho");
          return res.json();
        })
        .then((data) => {
          setItems(data);
          setLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setError("Có lỗi xảy ra khi tải dữ liệu. Vui lòng thử lại.");
          setLoading(false);
        });
    }
  }, [isOpen]);

  // Đóng dialog bằng phím ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const filteredItems = items.filter(
    (item) =>
      item.product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.product.code &&
        item.product.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
      item.branch.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const displayedItems = filteredItems.slice(0, pageSize);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          
          {/* Blur Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999]"
          />

          {/* Dialog Container */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 z-[10000]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-500">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Tất cả sản phẩm tồn kho thấp
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Danh sách chi tiết được sắp xếp từ thấp đến cao
                  </p>
                </div>
              </div>
              
              <button
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Filter Search Bar */}
            <div className="border-b border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/20">
              <div className="relative">
                <span className="absolute -translate-y-1/2 left-4 top-1/2 pointer-events-none text-slate-400">
                  <Search className="h-4.5 w-4.5" />
                </span>
                <input
                  type="text"
                  placeholder="Tìm kiếm theo tên sản phẩm, mã hoặc chi nhánh..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
                />
              </div>
            </div>

            {/* Content Area */}
            <div className="p-6">
              {loading ? (
                // Loading State
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500 dark:text-slate-400">
                  <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
                  <span className="text-sm font-semibold">Đang tải dữ liệu tồn kho...</span>
                </div>
              ) : error ? (
                // Error State
                <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 text-center text-sm text-red-600 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400">
                  {error}
                </div>
              ) : filteredItems.length === 0 ? (
                // Empty State
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Không tìm thấy sản phẩm tồn kho thấp nào phù hợp.
                </div>
              ) : (
                // Table Data
                <div className="overflow-x-auto rounded-xl border border-slate-150 dark:border-slate-850">
                  <div className="overflow-y-auto max-h-[50vh] custom-scrollbar">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-950 border-b border-slate-150 dark:border-slate-850">
                        <tr className="text-xs uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400">
                          <th className="px-4 py-3.5 w-16 text-center">STT</th>
                          <th className="px-4 py-3.5">Mã sản phẩm</th>
                          <th className="px-4 py-3.5">Tên sản phẩm</th>
                          <th className="px-4 py-3.5">Chi nhánh</th>
                          <th className="px-4 py-3.5 text-right w-28">Tồn kho</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                        {displayedItems.map((item, index) => {
                          const onHandNum = Number(item.onHand);
                          return (
                            <tr
                              key={`${item.productId}-${item.branchId}`}
                              className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors"
                            >
                              <td className="px-4 py-3 text-center text-xs text-slate-400 font-mono">
                                {index + 1}
                              </td>
                              <td className="px-4 py-3 font-semibold text-xs text-slate-600 dark:text-slate-400 font-mono">
                                {item.product.code ?? "—"}
                              </td>
                              <td className="px-4 py-3 font-bold text-slate-850 dark:text-white">
                                {item.product.name}
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                                {item.branch.name}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span
                                  className={`inline-flex items-center justify-end font-extrabold text-sm px-2.5 py-0.5 rounded-full ${
                                    onHandNum <= 0
                                      ? "bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400"
                                      : onHandNum <= 5
                                      ? "bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400"
                                      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                  }`}
                                >
                                  {onHandNum.toLocaleString("vi-VN")}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/20">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Hiển thị:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 focus:border-brand-500 focus:outline-hidden dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                  >
                    <option value={20}>20 dòng</option>
                    <option value={50}>50 dòng</option>
                    <option value={100}>100 dòng</option>
                    <option value={999999}>Tất cả</option>
                  </select>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Đang xem {displayedItems.length} / {filteredItems.length} sản phẩm
                </span>
              </div>
              <button
                onClick={onClose}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 active:scale-[0.98] transition-all dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                Đóng
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
