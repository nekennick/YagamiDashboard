"use client";

import React, { useState, useEffect } from "react";
import { Settings2, Save, RotateCcw, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFAULT_PRINT_SETTINGS, PrintTemplateConfig } from "./purchase-order-print";

type Props = {
  onSaved?: (newConfig: PrintTemplateConfig) => void;
};

export const PurchasePrintSettings: React.FC<Props> = ({ onSaved }) => {
  const [config, setConfig] = useState<PrintTemplateConfig>(DEFAULT_PRINT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/print-template");
      const data = await res.json();
      if (res.ok && data.settings) {
        setConfig(data.settings);
      }
    } catch (err) {
      console.error("Lỗi tải cài đặt in", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/print-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Lỗi lưu cài đặt");

      setMessage({ text: "Đã cập nhật mẫu in thành công!", type: "success" });
      if (onSaved) onSaved(config);
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : "Đã xảy ra lỗi khi lưu",
        type: "error"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(DEFAULT_PRINT_SETTINGS);
  };

  if (loading) {
    return <div className="p-8 text-center text-xs text-slate-500">Đang tải cấu hình mẫu in...</div>;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            Tùy biến mẫu in Phiếu nhập hàng
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Điều chỉnh tiêu đề đơn vị, kho, căn cứ pháp lý và dòng ghi chú nội bộ trên bản in giấy.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            className="h-8 px-3 text-xs flex items-center gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Khôi phục mặc định
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="h-8 px-4 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Đang lưu..." : "Lưu cài đặt"}
          </Button>
        </div>
      </div>

      {message && (
        <div
          className={`mt-4 flex items-center gap-2 rounded-xl p-3 text-xs font-medium border ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
              : "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Company Name */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Tên công ty / Đơn vị chủ quản
          </label>
          <input
            type="text"
            value={config.companyName || ""}
            onChange={(e) => setConfig({ ...config, companyName: e.target.value })}
            className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </div>

        {/* Warehouse Name */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Tên kho nhập mặc định
          </label>
          <input
            type="text"
            value={config.warehouseName || ""}
            onChange={(e) => setConfig({ ...config, warehouseName: e.target.value })}
            className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </div>

        {/* Form Number */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Mẫu số chứng từ
          </label>
          <input
            type="text"
            value={config.formNumber || ""}
            onChange={(e) => setConfig({ ...config, formNumber: e.target.value })}
            className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </div>

        {/* Circular */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Thông tư / Căn cứ pháp lý
          </label>
          <input
            type="text"
            value={config.circular || ""}
            onChange={(e) => setConfig({ ...config, circular: e.target.value })}
            className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </div>

        {/* Default Address */}
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Địa chỉ kho mặc định
          </label>
          <input
            type="text"
            value={config.defaultAddress || ""}
            onChange={(e) => setConfig({ ...config, defaultAddress: e.target.value })}
            className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </div>

        {/* Footer Note */}
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Ghi chú chân trang / Lưu ý nội bộ
          </label>
          <textarea
            rows={2}
            value={config.footerNote || ""}
            onChange={(e) => setConfig({ ...config, footerNote: e.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </div>
      </div>
    </div>
  );
};
