"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Settings2,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Printer,
  Code2,
  Sliders,
  ZoomIn,
  ZoomOut,
  X,
  FileSpreadsheet,
  Check,
  Eye,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Columns2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  StockOutPrintTemplateConfig,
  DEFAULT_STOCK_OUT_PRINT_SETTINGS,
  StockOutOrderPrintData
} from "./stock-out-order-print";
import { numberToVietnameseWords } from "@/lib/utils/number-to-words";
import { printHtmlElement } from "@/lib/utils/print";

type Props = {
  initialConfig?: StockOutPrintTemplateConfig;
  onSaved?: (newConfig: StockOutPrintTemplateConfig) => void;
  onClose?: () => void;
  sampleOrder?: StockOutOrderPrintData;
};

// Dữ liệu mẫu chuẩn sát thực tế khớp đúng với Hình 1 của người dùng
const DEFAULT_SAMPLE_ORDER: StockOutOrderPrintData = {
  code: "PX261024-3080",
  issueDate: "2026-10-24T07:26:00",
  receiverName: "Nguyễn Văn Tèo",
  documentBasis: "Xuất bán cuối ngày theo báo cáo doanh thu",
  branchName: "Tổng kho YAGAMI",
  branchAddress: "Tổ 3, Ấp 5B xã Ba Sao, tỉnh Đồng Tháp",
  note: "Phiếu xuất kho chuyển nội bộ nhà hàng cuối ngày",
  totalQuantity: 534.8,
  totalAmount: 91972400,
  items: [
    { stt: 1, productCode: "BMCuon", productName: "BA CHỈ BÒ MỸ CUỘN", quantity: 415, unit: "Kg", price: 185000, amount: 76775000 },
    { stt: 2, productCode: "BCH", productName: "Ba Chỉ Heo", quantity: 74, unit: "Kg", price: 130000, amount: 9620000 },
    { stt: 3, productCode: "BCHTCB", productName: "Ba chỉ heo tảng (Chiba)", quantity: 15.8, unit: "Kg", price: 108000, amount: 1706400 },
    { stt: 4, productCode: "bhtra", productName: "Bạc hà torani", quantity: 5, unit: "Chai", price: 185000, amount: 925000 },
    { stt: 5, productCode: "BTUOT", productName: "Bạch Tuột", quantity: 2, unit: "Kg", price: 145000, amount: 290000 },
    { stt: 6, productCode: "BBKS", productName: "Bánh Bao Kim Sa", quantity: 13, unit: "Hộp", price: 72000, amount: 936000 },
    { stt: 7, productCode: "BBTT", productName: "Bánh Bao Than Tre", quantity: 10, unit: "Hộp", price: 72000, amount: 720000 }
  ]
};

export const StockOutPrintCustomizer: React.FC<Props> = ({
  initialConfig,
  onSaved,
  onClose,
  sampleOrder = DEFAULT_SAMPLE_ORDER
}) => {
  const [config, setConfig] = useState<StockOutPrintTemplateConfig>(
    initialConfig || DEFAULT_STOCK_OUT_PRINT_SETTINGS
  );
  const [activeTab, setActiveTab] = useState<"visual" | "code">("visual");
  const [jsonCode, setJsonCode] = useState<string>("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(90);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const previewSheetRef = useRef<HTMLDivElement>(null);
  const headerTableRef = useRef<HTMLTableElement>(null);
  const [isDraggingHeader, setIsDraggingHeader] = useState(false);

  // Kéo di chuyển độ rộng 2 cột Header trực tiếp trên trang giấy
  const handleMouseDownHeaderResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingHeader(true);

    const table = headerTableRef.current;
    if (!table) return;
    const rect = table.getBoundingClientRect();

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const relativeX = moveEvent.clientX - rect.left;
      const percentage = Math.round((relativeX / rect.width) * 100);
      const clamped = Math.max(25, Math.min(75, percentage));
      setConfig((prev) => ({ ...prev, headerLeftWidth: clamped }));
    };

    const handleMouseUp = () => {
      setIsDraggingHeader(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Sync state to JSON code editor (chỉ sync khi không đang gõ ở tab Code để tránh giật con trỏ)
  useEffect(() => {
    if (activeTab !== "code") {
      setJsonCode(JSON.stringify(config, null, 2));
      setJsonError(null);
    }
  }, [config, activeTab]);

  const handleTabChange = (tab: "visual" | "code") => {
    if (tab === "code") {
      setJsonCode(JSON.stringify(config, null, 2));
      setJsonError(null);
    } else if (tab === "visual" && !jsonError) {
      try {
        const parsed = JSON.parse(jsonCode);
        setConfig(parsed);
      } catch {
        // bỏ qua lỗi nếu đang sửa dở
      }
    }
    setActiveTab(tab);
  };

  // Handle live JSON code change
  const handleJsonChange = (val: string) => {
    setJsonCode(val);
    try {
      const parsed = JSON.parse(val);
      setJsonError(null);
      setConfig(parsed);
    } catch (err: unknown) {
      setJsonError(err instanceof Error ? err.message : "Cú pháp JSON không hợp lệ");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      let configToSave = config;
      if (activeTab === "code") {
        try {
          configToSave = JSON.parse(jsonCode);
          setConfig(configToSave);
        } catch (err) {
          throw new Error("Mã JSON trong tab Code chưa đúng cú pháp: " + (err instanceof Error ? err.message : ""));
        }
      }

      const res = await fetch("/api/settings/print-template?type=stock_out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "stock_out", ...configToSave })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Lỗi lưu cài đặt mẫu in");

      setMessage({ text: "Đã lưu cài đặt mẫu in thành công!", type: "success" });
      if (onSaved) onSaved(configToSave);
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
    if (confirm("Khôi phục toàn bộ mẫu in về cấu hình mặc định ban đầu?")) {
      setConfig(DEFAULT_STOCK_OUT_PRINT_SETTINGS);
      setMessage({ text: "Đã khôi phục cấu hình mặc định", type: "success" });
    }
  };

  const handleTestPrint = () => {
    if (previewSheetRef.current) {
      printHtmlElement(previewSheetRef.current, `Mẫu in thử - Phiếu xuất kho`);
    }
  };

  // Live Sheet Calculations
  const companyName = config.companyName || "CÔNG TY\nTNHH YAGAMI KITCHEN";
  const warehouseName = config.warehouseName || sampleOrder.branchName || "TỔNG KHO YAGAMI";
  const formNumber = config.formNumber || "Mẫu số: 01 - VT";
  const circular =
    config.circular ||
    "(Kèm theo Thông tư số 99/2025/TT-BTC\nngày 27 tháng 10 năm 2025 của Bộ trưởng Bộ Tài chính)";
  const address = config.defaultAddress?.trim() || sampleOrder.branchAddress || "Tổ 3, Ấp 5B";
  const reason = config.defaultReason?.trim() || sampleOrder.documentBasis || "Xuất bán cuối ngày theo báo cáo doanh thu";
  const footerNote =
    config.footerNote !== undefined
      ? config.footerNote
      : "“Đơn giá và thành tiền trên phiếu chỉ phục vụ quản lý nội bộ theo giá bán; không phải giá nhập, giá vốn hoặc căn cứ ghi sổ kế toán.”";

  const showPrice = config.showPriceAndAmount !== false;
  const showCode = config.showProductCode !== false;
  const showSignatures = config.showSignatures !== false;

  const density = config.tableDensity || "normal";
  const densityStyles = {
    compact: {
      thPadding: "3px 6px",
      tdPadding: "3px 6px",
      fontSize: "11px",
      lineHeight: "1.2"
    },
    normal: {
      thPadding: "6px 8px",
      tdPadding: "6px 8px",
      fontSize: "12px",
      lineHeight: "1.35"
    },
    relaxed: {
      thPadding: "10px 12px",
      tdPadding: "10px 12px",
      fontSize: "13.5px",
      lineHeight: "1.6"
    }
  }[density];

  const baseFontSize =
    config.fontSize === "xs"
      ? "11px"
      : config.fontSize === "base"
      ? "14px"
      : "12px";

  const formattedDate = "24/10/2026 07:26";
  const words = numberToVietnameseWords(sampleOrder.totalAmount);

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-slate-950 text-white overflow-hidden">
      {/* Top Navbar */}
      <header className="flex h-14 items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 sm:px-6 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <Settings2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold flex items-center gap-2">
              Tùy biến mẫu in Phiếu xuất kho
              <span className="flex items-center gap-1 text-[11px] font-normal text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Live Review thời gian thực
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              Chỉnh sửa thông tin, bố cục, code CSS và xem trước kết quả trực tiếp ngay khi gõ.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="h-8 px-3 text-xs bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 flex items-center gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Khôi phục mặc định
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTestPrint}
            className="h-8 px-3 text-xs bg-slate-800 border-slate-700 text-indigo-300 hover:text-indigo-200 hover:bg-slate-700 flex items-center gap-1.5"
          >
            <Printer className="h-3.5 w-3.5" />
            In thử mẫu này
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="h-8 px-4 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm flex items-center gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Đang lưu..." : "Lưu mẫu in"}
          </Button>

          {onClose && (
            <button
              onClick={onClose}
              className="ml-2 h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Đóng trình tùy biến"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {/* Status Alert Banner */}
      {message && (
        <div
          className={`flex items-center justify-between px-6 py-2 text-xs font-medium border-b ${
            message.type === "success"
              ? "bg-emerald-950/60 text-emerald-300 border-emerald-800"
              : "bg-red-950/60 text-red-300 border-red-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-400" />
            )}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Main Split-Screen Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* ================= LEFT PANEL: EDITOR ================= */}
        <div className="w-full md:w-[460px] lg:w-[500px] xl:w-[540px] flex-shrink-0 flex flex-col border-r border-slate-800 bg-slate-900/60">
          {/* Tab Switcher */}
          <div className="flex items-center border-b border-slate-800 bg-slate-900/80 px-4 pt-2">
            <button
              type="button"
              onClick={() => handleTabChange("visual")}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
                activeTab === "visual"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Sliders className="h-4 w-4" />
              Thiết lập trực quan
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("code")}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
                activeTab === "code"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Code2 className="h-4 w-4" />
              Chế độ mã (Live Code & CSS)
            </button>
          </div>

          {/* Tab 1: Visual Form */}
          {activeTab === "visual" && (
            <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs text-slate-300">
              {/* Nhóm 1: Thông tin đầu phiếu */}
              <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                <h4 className="font-semibold text-slate-100 flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-indigo-400" />
                  Thông tin đơn vị & Pháp lý
                </h4>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Tên công ty / Đơn vị chủ quản (Cho phép Enter xuống dòng như Hình 2)
                  </label>
                  <textarea
                    rows={2}
                    value={config.companyName || ""}
                    onChange={(e) => setConfig({ ...config, companyName: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white focus:border-indigo-500 outline-none leading-relaxed"
                    placeholder={"CÔNG TY\nTNHH YAGAMI KITCHEN"}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Kho / Chi nhánh xuất mặc định
                    </label>
                    <input
                      type="text"
                      value={config.warehouseName || ""}
                      onChange={(e) => setConfig({ ...config, warehouseName: e.target.value })}
                      className="w-full h-8 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-white focus:border-indigo-500 outline-none"
                      placeholder="TỔNG KHO YAGAMI"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Mẫu số chứng từ
                    </label>
                    <input
                      type="text"
                      value={config.formNumber || ""}
                      onChange={(e) => setConfig({ ...config, formNumber: e.target.value })}
                      className="w-full h-8 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-white focus:border-indigo-500 outline-none"
                      placeholder="Mẫu số: 01 - VT"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Thông tư / Căn cứ ban hành (Cho phép Enter xuống dòng như Hình 2)
                  </label>
                  <textarea
                    rows={2}
                    value={config.circular || ""}
                    onChange={(e) => setConfig({ ...config, circular: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white focus:border-indigo-500 outline-none leading-relaxed"
                    placeholder={"(Kèm theo Thông tư số 99/2025/TT-BTC\nngày 27 tháng 10 năm 2025 của Bộ trưởng Bộ Tài chính)"}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Địa chỉ kho mặc định
                  </label>
                  <input
                    type="text"
                    value={config.defaultAddress || ""}
                    onChange={(e) => setConfig({ ...config, defaultAddress: e.target.value })}
                    className="w-full h-8 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-white focus:border-indigo-500 outline-none"
                    placeholder="Tổ 3, Ấp 5B xã Ba Sao, tỉnh Đồng Tháp"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Lý do xuất kho mặc định (khi phiếu không nhập riêng)
                  </label>
                  <input
                    type="text"
                    value={config.defaultReason || ""}
                    onChange={(e) => setConfig({ ...config, defaultReason: e.target.value })}
                    className="w-full h-8 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-white focus:border-indigo-500 outline-none"
                    placeholder="VD: Xuất bán cuối ngày theo báo cáo doanh thu"
                  />
                </div>
              </div>

              {/* Nhóm 1B: Cấu trúc bảng đầu phiếu (Bảng không viền) */}
              <div className="space-y-3.5 rounded-xl border border-indigo-900/60 bg-indigo-950/20 p-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-slate-100 flex items-center gap-2">
                    <Columns2 className="h-4 w-4 text-indigo-400" />
                    Bố cục Bảng đầu phiếu (Không viền)
                  </h4>
                  <span className="text-[11px] font-mono text-indigo-300 bg-indigo-900/60 px-2 py-0.5 rounded-md border border-indigo-800">
                    {config.headerLeftWidth || 50}% - {100 - (config.headerLeftWidth || 50)}%
                  </span>
                </div>

                {/* Alignment controls */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                      Canh lề Cột Trái (Đơn vị)
                    </label>
                    <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5">
                      {(["left", "center", "right"] as const).map((align) => (
                        <button
                          key={align}
                          type="button"
                          onClick={() => setConfig({ ...config, headerLeftAlign: align })}
                          className={`flex-1 py-1 text-center rounded text-xs flex items-center justify-center gap-1 transition ${
                            (config.headerLeftAlign || "center") === align
                              ? "bg-indigo-600 text-white font-medium shadow-sm"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          {align === "left" && <AlignLeft className="h-3 w-3" />}
                          {align === "center" && <AlignCenter className="h-3 w-3" />}
                          {align === "right" && <AlignRight className="h-3 w-3" />}
                          <span className="text-[11px]">{align === "left" ? "Trái" : align === "center" ? "Giữa" : "Phải"}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                      Canh lề Cột Phải (Mẫu số)
                    </label>
                    <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5">
                      {(["left", "center", "right"] as const).map((align) => (
                        <button
                          key={align}
                          type="button"
                          onClick={() => setConfig({ ...config, headerRightAlign: align })}
                          className={`flex-1 py-1 text-center rounded text-xs flex items-center justify-center gap-1 transition ${
                            (config.headerRightAlign || "center") === align
                              ? "bg-indigo-600 text-white font-medium shadow-sm"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          {align === "left" && <AlignLeft className="h-3 w-3" />}
                          {align === "center" && <AlignCenter className="h-3 w-3" />}
                          {align === "right" && <AlignRight className="h-3 w-3" />}
                          <span className="text-[11px]">{align === "left" ? "Trái" : align === "center" ? "Giữa" : "Phải"}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Column Width Slider & Presets */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-medium text-slate-400">
                      Tỷ lệ độ rộng 2 cột (Kéo slider hoặc kéo vạch phân cách trên giấy)
                    </label>
                  </div>
                  <input
                    type="range"
                    min={25}
                    max={75}
                    value={config.headerLeftWidth || 50}
                    onChange={(e) => setConfig({ ...config, headerLeftWidth: Number(e.target.value) })}
                    className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg appearance-none"
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[11px] text-slate-500">Mốc nhanh:</span>
                    <div className="flex items-center gap-1.5">
                      {[
                        { label: "50 - 50", val: 50 },
                        { label: "45 - 55", val: 45 },
                        { label: "40 - 60", val: 40 },
                        { label: "55 - 45", val: 55 }
                      ].map((preset) => (
                        <button
                          key={preset.val}
                          type="button"
                          onClick={() => setConfig({ ...config, headerLeftWidth: preset.val })}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono border transition ${
                            (config.headerLeftWidth || 50) === preset.val
                              ? "border-indigo-500 bg-indigo-600/30 text-indigo-300 font-semibold"
                              : "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-indigo-300/80 italic">
                    💡 Mẹo: Bấm giữ và kéo trực tiếp thanh phân cách giữa 2 cột ngay trên trang giấy xem trước để điều chỉnh độ rộng cột.
                  </p>
                </div>
              </div>

              {/* Nhóm 2: Bố cục, Cỡ chữ & Mật độ */}
              <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                <h4 className="font-semibold text-slate-100 flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-indigo-400" />
                  Bố cục bảng & Cỡ chữ in
                </h4>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Cỡ chữ in
                    </label>
                    <select
                      value={config.fontSize || "sm"}
                      onChange={(e) => setConfig({ ...config, fontSize: e.target.value as "xs" | "sm" | "base" })}
                      className="w-full h-8 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-white outline-none focus:border-indigo-500"
                    >
                      <option value="xs">Nhỏ gọn (11px)</option>
                      <option value="sm">Chuẩn A4 (12px)</option>
                      <option value="base">Rõ nét (14px)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Mật độ dòng bảng
                    </label>
                    <select
                      value={config.tableDensity || "normal"}
                      onChange={(e) => setConfig({ ...config, tableDensity: e.target.value as "compact" | "normal" | "relaxed" })}
                      className="w-full h-8 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-white outline-none focus:border-indigo-500"
                    >
                      <option value="compact">Gọn gàng (Nhiều hàng)</option>
                      <option value="normal">Chuẩn cân đối</option>
                      <option value="relaxed">Thoải mái / Rộng</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2 pt-1 border-t border-slate-800/80">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showProductCode !== false}
                      onChange={(e) => setConfig({ ...config, showProductCode: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
                    />
                    <span>Hiển thị cột Mã hàng</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showPriceAndAmount !== false}
                      onChange={(e) => setConfig({ ...config, showPriceAndAmount: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
                    />
                    <span>Hiển thị cột Đơn giá & Thành tiền (Quản lý nội bộ)</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.showSignatures !== false}
                      onChange={(e) => setConfig({ ...config, showSignatures: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
                    />
                    <span>Hiển thị khung 4 chữ ký chân trang</span>
                  </label>
                </div>
              </div>

              {/* Nhóm 3: Chức danh chữ ký */}
              {config.showSignatures !== false && (
                <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                  <h4 className="font-semibold text-slate-100 flex items-center gap-2">
                    <Check className="h-4 w-4 text-indigo-400" />
                    Chức danh 4 ô ký tên
                  </h4>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">Ô ký 1</label>
                      <input
                        type="text"
                        value={config.signer1Title || "Người lập phiếu"}
                        onChange={(e) => setConfig({ ...config, signer1Title: e.target.value })}
                        className="w-full h-8 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-white focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">Ô ký 2</label>
                      <input
                        type="text"
                        value={config.signer2Title || "Người nhận hàng"}
                        onChange={(e) => setConfig({ ...config, signer2Title: e.target.value })}
                        className="w-full h-8 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-white focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">Ô ký 3</label>
                      <input
                        type="text"
                        value={config.signer3Title || "Thủ kho"}
                        onChange={(e) => setConfig({ ...config, signer3Title: e.target.value })}
                        className="w-full h-8 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-white focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">Ô ký 4</label>
                      <input
                        type="text"
                        value={config.signer4Title || "Kế toán trưởng"}
                        onChange={(e) => setConfig({ ...config, signer4Title: e.target.value })}
                        className="w-full h-8 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-white focus:border-indigo-500 outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Nhóm 4: Ghi chú chân trang */}
              <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                <h4 className="font-semibold text-slate-100">Ghi chú chân trang nội bộ</h4>
                <textarea
                  rows={2}
                  value={config.footerNote ?? ""}
                  onChange={(e) => setConfig({ ...config, footerNote: e.target.value })}
                  placeholder="Nhập ghi chú lưu ý trên bản in..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-xs text-white focus:border-indigo-500 outline-none leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* Tab 2: Live Code & CSS */}
          {activeTab === "code" && (
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-slate-400 flex items-center gap-1.5">
                  <Code2 className="h-4 w-4 text-indigo-400" />
                  JSON Configuration (Gõ mã trực tiếp):
                </span>
                {jsonError ? (
                  <span className="text-red-400 font-mono text-[11px]">✕ {jsonError}</span>
                ) : (
                  <span className="text-emerald-400 font-mono text-[11px]">✓ Cú pháp hợp lệ</span>
                )}
              </div>

              <textarea
                value={jsonCode}
                onChange={(e) => handleJsonChange(e.target.value)}
                rows={12}
                spellCheck={false}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3.5 font-mono text-xs text-indigo-300 focus:border-indigo-500 outline-none leading-relaxed shadow-inner"
              />

              <div className="space-y-1.5 pt-2">
                <label className="block font-mono text-slate-400 text-xs">
                  Tùy chỉnh CSS Nâng cao (.print-sheet):
                </label>
                <p className="text-[11px] text-slate-500">
                  CSS này sẽ được chèn trực tiếp vào bản xem trước và bản in giấy.
                </p>
                <textarea
                  value={config.customCss || ""}
                  onChange={(e) => setConfig({ ...config, customCss: e.target.value })}
                  rows={6}
                  placeholder={`.print-sheet {\n  font-family: 'Times New Roman', serif;\n}\n.print-sheet th {\n  background-color: #f1f5f9;\n}`}
                  spellCheck={false}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-amber-300 focus:border-indigo-500 outline-none shadow-inner"
                />
              </div>
            </div>
          )}
        </div>

        {/* ================= RIGHT PANEL: LIVE REVIEW ================= */}
        <div className="flex-1 flex flex-col bg-slate-950/90 overflow-hidden">
          {/* Canvas Toolbar */}
          <div className="flex h-10 items-center justify-between border-b border-slate-800 bg-slate-900/40 px-5 text-xs text-slate-400">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-slate-300 font-medium">
                <Eye className="h-3.5 w-3.5 text-indigo-400" />
                Khung xem trước A4 (210 x 297mm)
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-[11px] text-slate-500">
                Font: Times New Roman / Noto Sans
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px]">Tỷ lệ:</span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(60, z - 10))}
                className="h-7 w-7 rounded-md hover:bg-slate-800 flex items-center justify-center text-slate-300"
                title="Thu nhỏ"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="w-10 text-center font-mono text-white text-[11px] font-semibold">{zoom}%</span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(130, z + 10))}
                className="h-7 w-7 rounded-md hover:bg-slate-800 flex items-center justify-center text-slate-300"
                title="Phóng to"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(90)}
                className="ml-1 text-[11px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Mặc định
              </button>
            </div>
          </div>

          {/* Canvas Scroll Area */}
          <div className="flex-1 overflow-auto p-6 sm:p-10 flex justify-center items-start bg-slate-900/50">
            <div
              style={{
                transform: `scale(${zoom / 100})`,
                transformOrigin: "top center",
                transition: "transform 0.15s ease-out"
              }}
              className="my-2"
            >
              {/* Paper Sheet Preview */}
              <div
                ref={previewSheetRef}
                className="print-sheet w-[210mm] min-h-[297mm] bg-white text-black p-10 shadow-2xl rounded-sm print:w-full print:min-h-0 print:h-auto print:p-0 print:m-0 print:shadow-none print:rounded-none"
                style={{
                  fontFamily: "'Times New Roman', Times, serif, 'Noto Sans', sans-serif",
                  fontSize: baseFontSize,
                  color: "#000000",
                  backgroundColor: "#ffffff"
                }}
              >
                {/* Embedded Sheet Typography & Density Styles */}
                <style>{`
                  .print-sheet, .print-sheet * {
                    color: #000000 !important;
                    -webkit-text-fill-color: #000000 !important;
                  }
                  @media print {
                    .print-sheet {
                      min-height: 0 !important;
                      height: auto !important;
                      padding: 0 !important;
                      margin: 0 !important;
                    }
                  }
                  .print-sheet table.sheet-items-table th {
                    padding: ${densityStyles.thPadding} !important;
                    font-size: ${densityStyles.fontSize} !important;
                    line-height: ${densityStyles.lineHeight} !important;
                    background-color: #f1f5f9 !important;
                    color: #000000 !important;
                  }
                  .print-sheet table.sheet-items-table td {
                    padding: ${densityStyles.tdPadding} !important;
                    font-size: ${densityStyles.fontSize} !important;
                    line-height: ${densityStyles.lineHeight} !important;
                    color: #000000 !important;
                  }
                  .print-sheet table.sheet-items-table tbody tr {
                    height: ${density === "compact" ? "24px" : density === "relaxed" ? "44px" : "32px"} !important;
                  }
                  .print-sheet .signatures-spacer {
                    height: ${density === "compact" ? "36px" : density === "relaxed" ? "80px" : "55px"} !important;
                  }
                `}</style>

                {/* Custom CSS Injection */}
                {config.customCss && (
                  <style dangerouslySetInnerHTML={{ __html: config.customCss }} />
                )}

                {/* Header Section (Bảng không viền có thể kéo chỉnh độ rộng cột và căn giữa như Hình 2) */}
                <table
                  ref={headerTableRef}
                  className="w-full border-collapse mb-4 relative select-none"
                  style={{ border: "none", borderSpacing: 0 }}
                >
                  <tbody>
                    <tr style={{ verticalAlign: "top", border: "none" }}>
                      {/* Cột trái: Đơn vị / Kho */}
                      <td
                        style={{
                          width: `${config.headerLeftWidth || 50}%`,
                          textAlign: config.headerLeftAlign || "center",
                          border: "none",
                          padding: "0 10px 0 0"
                        }}
                      >
                        <div className="font-bold uppercase tracking-wider text-sm whitespace-pre-line leading-relaxed">
                          {companyName}
                        </div>
                        <div className="font-bold uppercase text-xs mt-1 whitespace-pre-line">
                          {warehouseName}
                        </div>
                      </td>

                      {/* Thanh phân cách kéo độ rộng cột trực tiếp trên bản in (Hidden when printing) */}
                      <td
                        className="print:hidden w-0 p-0 relative"
                        style={{ border: "none" }}
                      >
                        <div
                          onMouseDown={handleMouseDownHeaderResize}
                          className={`group absolute -top-1 -bottom-1 -left-2 w-4 z-30 cursor-col-resize flex flex-col items-center justify-center hover:bg-indigo-500/10 rounded transition ${
                            isDraggingHeader ? "bg-indigo-500/20" : ""
                          }`}
                          title="Bấm giữ và kéo sang trái/phải để thay đổi độ rộng 2 cột"
                        >
                          <div className="w-0.5 h-full bg-slate-300 group-hover:bg-indigo-500 rounded-full transition-colors flex items-center justify-center">
                            <div className="w-3.5 h-6 bg-white border border-slate-300 group-hover:border-indigo-500 rounded shadow-sm flex items-center justify-center text-[9px] text-slate-500 group-hover:text-indigo-600 font-mono select-none">
                              ⋮⋮
                            </div>
                          </div>
                          {isDraggingHeader && (
                            <div className="absolute -top-7 whitespace-nowrap bg-slate-900 text-white text-[10px] px-2 py-0.5 rounded shadow-lg border border-slate-700 font-mono">
                              {config.headerLeftWidth || 50}% | {100 - (config.headerLeftWidth || 50)}%
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Cột phải: Mẫu số & Căn cứ thông tư */}
                      <td
                        style={{
                          width: `${100 - (config.headerLeftWidth || 50)}%`,
                          textAlign: config.headerRightAlign || "center",
                          border: "none",
                          padding: "0 0 0 10px"
                        }}
                      >
                        <div className="font-bold text-xs">{formNumber}</div>
                        <div className="italic text-[11px] text-slate-700 whitespace-pre-line mt-1 leading-normal">
                          {circular}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Title */}
                <div className="text-center my-4">
                  <h1 className="text-2xl font-bold tracking-wide uppercase">PHIẾU XUẤT KHO</h1>
                  <div className="text-sm font-semibold mt-1">Mã phiếu: {sampleOrder.code}</div>
                  <div className="text-xs italic text-slate-700 mt-0.5">Ngày: {formattedDate}</div>
                </div>

                {/* Info Rows */}
                <div className="space-y-1.5 mb-5 text-slate-900 leading-relaxed text-xs">
                  <div className="flex">
                    <span className="w-40 font-medium">Họ và tên người nhận:</span>
                    <span className="font-semibold">{sampleOrder.receiverName}</span>
                  </div>
                  <div className="flex">
                    <span className="w-40 font-medium">Lý do xuất kho:</span>
                    <span>{reason}</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div className="flex">
                      <span className="w-40 font-medium">Chi nhánh xuất:</span>
                      <span className="font-semibold">{warehouseName}</span>
                    </div>
                    <div className="flex text-right">
                      <span className="font-medium mr-2">Địa chỉ:</span>
                      <span>{address}</span>
                    </div>
                  </div>
                  {sampleOrder.note && (
                    <div className="flex">
                      <span className="w-40 font-medium">Ghi chú:</span>
                      <span className="italic">{sampleOrder.note}</span>
                    </div>
                  )}
                </div>

                {/* Items Table */}
                <table className="sheet-items-table w-full border-collapse border border-slate-900">
                  <thead>
                    <tr className="bg-slate-100 font-bold text-center border-b border-slate-900">
                      <th className="border border-slate-900 w-10">STT</th>
                      {showCode && (
                        <th className="border border-slate-900 w-28 text-left">Mã hàng</th>
                      )}
                      <th className="border border-slate-900 text-left">Tên hàng</th>
                      <th className="border border-slate-900 w-20 text-right">Số lượng</th>
                      <th className="border border-slate-900 w-16 text-center">ĐVT</th>
                      {showPrice && (
                        <>
                          <th className="border border-slate-900 w-24 text-right">Đơn giá</th>
                          <th className="border border-slate-900 w-28 text-right">Thành tiền</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {sampleOrder.items.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-400">
                        <td className="border border-slate-900 text-center">{idx + 1}</td>
                        {showCode && (
                          <td className="border border-slate-900 font-mono font-medium text-left">
                            {item.productCode || "-"}
                          </td>
                        )}
                        <td className="border border-slate-900 text-left font-medium">
                          {item.productName}
                        </td>
                        <td className="border border-slate-900 text-right font-semibold">
                          {Number(item.quantity).toLocaleString("vi-VN")}
                        </td>
                        <td className="border border-slate-900 text-center">
                          {item.unit || "-"}
                        </td>
                        {showPrice && (
                          <>
                            <td className="border border-slate-900 text-right font-mono">
                              {Number(item.price).toLocaleString("vi-VN")}
                            </td>
                            <td className="border border-slate-900 text-right font-mono font-semibold">
                              {Number(item.amount).toLocaleString("vi-VN")}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                    {/* Total Row */}
                    <tr className="border-t border-slate-900 font-bold bg-slate-50">
                      <td colSpan={showCode ? 3 : 2} className="border border-slate-900 text-right uppercase">
                        Tổng cộng:
                      </td>
                      <td className="border border-slate-900"></td>
                      <td className="border border-slate-900"></td>
                      {showPrice && (
                        <>
                          <td className="border border-slate-900"></td>
                          <td className="border border-slate-900 text-right font-mono font-bold">
                            {Number(sampleOrder.totalAmount).toLocaleString("vi-VN")}
                          </td>
                        </>
                      )}
                    </tr>
                  </tbody>
                </table>

                {/* Footer Internal Note */}
                {footerNote && (
                  <div className="mt-3 text-[11px] italic text-slate-800 leading-normal">
                    {footerNote}
                  </div>
                )}

                {/* Total in words */}
                {showPrice && (
                  <div className="mt-3 text-xs space-y-1">
                    <div className="flex font-semibold">
                      <span className="w-48">Tổng tiền hàng:</span>
                      <span className="font-mono text-sm">{Number(sampleOrder.totalAmount).toLocaleString("vi-VN")} đ</span>
                    </div>
                    <div className="flex">
                      <span className="w-48 font-semibold">Tổng tiền hàng (bằng chữ):</span>
                      <span className="italic font-medium">{words}</span>
                    </div>
                  </div>
                )}

                {/* Signatures Section */}
                {showSignatures && (
                  <div className="mt-8 text-xs">
                    <div className="text-right italic mb-2 pr-4">
                      Ngày.....tháng.....năm.......
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center font-bold">
                      <div>
                        <div>{config.signer1Title || "Người lập phiếu"}</div>
                        <div className="text-[11px] font-normal italic text-slate-600">(Ký, họ tên)</div>
                        <div className="signatures-spacer h-16"></div>
                      </div>
                      <div>
                        <div>{config.signer2Title || "Người nhận hàng"}</div>
                        <div className="text-[11px] font-normal italic text-slate-600">(Ký, họ tên)</div>
                        <div className="signatures-spacer h-16"></div>
                      </div>
                      <div>
                        <div>{config.signer3Title || "Thủ kho"}</div>
                        <div className="text-[11px] font-normal italic text-slate-600">(Ký, họ tên)</div>
                        <div className="signatures-spacer h-16"></div>
                      </div>
                      <div>
                        <div>{config.signer4Title || "Kế toán trưởng"}</div>
                        <div className="text-[11px] font-normal italic text-slate-600">(Ký, họ tên)</div>
                        <div className="signatures-spacer h-16"></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
