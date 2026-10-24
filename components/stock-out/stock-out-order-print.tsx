"use client";

import React, { useRef } from "react";
import { Printer, X, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { numberToVietnameseWords } from "@/lib/utils/number-to-words";
import { printHtmlElement } from "@/lib/utils/print";

export type StockOutPrintTemplateConfig = {
  companyName?: string;
  warehouseName?: string;
  formNumber?: string;
  circular?: string;
  defaultAddress?: string;
  footerNote?: string;
  showPriceAndAmount?: boolean;
  showProductCode?: boolean;
  showSignatures?: boolean;
  signer1Title?: string;
  signer2Title?: string;
  signer3Title?: string;
  signer4Title?: string;
  fontSize?: "xs" | "sm" | "base";
  tableDensity?: "compact" | "normal" | "relaxed";
  headerLeftWidth?: number;
  headerLeftAlign?: "left" | "center" | "right";
  headerRightAlign?: "left" | "center" | "right";
  customCss?: string;
};

export const DEFAULT_STOCK_OUT_PRINT_SETTINGS: StockOutPrintTemplateConfig = {
  companyName: "CÔNG TY\nTNHH YAGAMI KITCHEN",
  warehouseName: "TỔNG KHO YAGAMI",
  formNumber: "Mẫu số: 01 - VT",
  circular: "(Kèm theo Thông tư số 99/2025/TT-BTC\nngày 27 tháng 10 năm 2025 của Bộ trưởng Bộ Tài chính)",
  defaultAddress: "Tổ 3, Ấp 5B",
  footerNote: "“Đơn giá và thành tiền trên phiếu chỉ phục vụ quản lý nội bộ theo giá bán; không phải giá nhập, giá vốn hoặc căn cứ ghi sổ kế toán.”",
  showPriceAndAmount: true,
  showProductCode: true,
  showSignatures: true,
  signer1Title: "Người lập phiếu",
  signer2Title: "Người nhận hàng",
  signer3Title: "Thủ kho",
  signer4Title: "Kế toán trưởng",
  fontSize: "sm",
  tableDensity: "normal",
  headerLeftWidth: 50,
  headerLeftAlign: "center",
  headerRightAlign: "center",
  customCss: ""
};

export type StockOutOrderPrintData = {
  code: string;
  issueDate: string | Date;
  reportDate?: string | null;
  receiverName?: string | null;
  documentBasis?: string | null;
  branchName?: string | null;
  branchAddress?: string | null;
  note?: string | null;
  totalAmount: number;
  totalQuantity: number;
  items: Array<{
    stt?: number;
    productCode?: string | null;
    productName: string;
    unit?: string | null;
    quantity: number;
    price: number;
    amount: number;
  }>;
};

type Props = {
  order: StockOutOrderPrintData;
  config?: StockOutPrintTemplateConfig;
  onClose?: () => void;
  onOpenCustomizer?: () => void;
  autoPrint?: boolean;
};

export const StockOutOrderPrint: React.FC<Props> = ({
  order,
  config = DEFAULT_STOCK_OUT_PRINT_SETTINGS,
  onClose,
  onOpenCustomizer,
  autoPrint = false
}) => {
  const printRef = useRef<HTMLDivElement>(null);

  const companyName = config?.companyName || "CÔNG TY\nTNHH YAGAMI KITCHEN";
  const warehouseName = config?.warehouseName || order.branchName || "TỔNG KHO YAGAMI";
  const formNumber = config?.formNumber || "Mẫu số: 01 - VT";
  const circular =
    config?.circular ||
    "(Kèm theo Thông tư số 99/2025/TT-BTC\nngày 27 tháng 10 năm 2025 của Bộ trưởng Bộ Tài chính)";
  const address = order.branchAddress || config?.defaultAddress || "Tổ 3, Ấp 5B";
  const footerNote =
    config?.footerNote ||
    "“Đơn giá và thành tiền trên phiếu chỉ phục vụ quản lý nội bộ theo giá bán; không phải giá nhập, giá vốn hoặc căn cứ ghi sổ kế toán.”";

  const showPrice = config?.showPriceAndAmount !== false;
  const showCode = config?.showProductCode !== false;
  const showSignatures = config?.showSignatures !== false;

  const density = config?.tableDensity || "normal";
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
    config?.fontSize === "xs"
      ? "11px"
      : config?.fontSize === "base"
        ? "14px"
        : "12px";

  const formattedDate = React.useMemo(() => {
    try {
      const d = new Date(order.issueDate);
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return String(order.issueDate);
    }
  }, [order.issueDate]);

  const handlePrint = React.useCallback(() => {
    if (printRef.current) {
      printHtmlElement(printRef.current, `Phiếu xuất kho - ${order.code}`);
    } else {
      window.print();
    }
  }, [order.code]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        handlePrint();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePrint]);

  React.useEffect(() => {
    if (autoPrint) {
      const timer = setTimeout(() => {
        handlePrint();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoPrint, handlePrint]);

  const words = numberToVietnameseWords(order.totalAmount);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-900/80 backdrop-blur-sm p-4 overflow-y-auto print:p-0 print:bg-white print:static print:z-auto">
      {/* Top Action Bar (ẩn khi in) */}
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between rounded-t-xl bg-slate-800 px-6 py-3.5 text-white shadow-xl print:hidden">
        <div className="flex items-center gap-2">
          <Printer className="h-5 w-5 text-indigo-400" />
          <span className="font-semibold text-sm">Xem trước mẫu in Phiếu xuất kho ({order.code})</span>
        </div>
        <div className="flex items-center gap-2.5">
          {onOpenCustomizer && (
            <Button
              type="button"
              variant="outline"
              onClick={onOpenCustomizer}
              className="flex items-center gap-1.5 h-9 px-3 text-xs bg-slate-700 border-slate-600 hover:bg-slate-600 text-amber-300 hover:text-amber-200"
            >
              <Palette className="h-3.5 w-3.5 text-amber-400" />
              Tùy biến mẫu in
            </Button>
          )}

          <Button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm h-9 px-4 text-xs font-medium"
          >
            <Printer className="h-4 w-4" />
            In phiếu ngay (Ctrl+P)
          </Button>

          {onClose && (
            <Button
              variant="outline"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 text-slate-300 hover:text-white bg-slate-700/60 border-slate-600 hover:bg-slate-700"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Printable Sheet (Chuẩn khổ A4) */}
      <div
        ref={printRef}
        className="print-sheet mx-auto w-full max-w-4xl bg-white text-black p-8 sm:p-12 shadow-2xl rounded-b-xl print:p-0 print:m-0 print:min-h-0 print:h-auto print:shadow-none print:rounded-none print:w-full print:max-w-none"
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

        {config?.customCss && (
          <style dangerouslySetInnerHTML={{ __html: config.customCss }} />
        )}

        {/* Header Section (Borderless Table with dynamic column widths & text alignment) */}
        <table
          className="w-full border-collapse mb-4"
          style={{ border: "none", borderSpacing: 0 }}
        >
          <tbody>
            <tr style={{ verticalAlign: "top", border: "none" }}>
              <td
                style={{
                  width: `${config?.headerLeftWidth || 50}%`,
                  textAlign: config?.headerLeftAlign || "center",
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
              <td
                style={{
                  width: `${100 - (config?.headerLeftWidth || 50)}%`,
                  textAlign: config?.headerRightAlign || "center",
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
          <div className="text-sm font-semibold mt-1">Mã phiếu: {order.code}</div>
          <div className="text-xs italic text-slate-700 mt-0.5">Ngày: {formattedDate}</div>
        </div>

        {/* Info Rows */}
        <div className="space-y-1.5 mb-5 text-slate-900 leading-relaxed text-xs">
          <div className="flex">
            <span className="w-40 font-medium">Họ và tên người nhận:</span>
            <span className="font-semibold">{order.receiverName || "...................................................................."}</span>
          </div>
          <div className="flex">
            <span className="w-40 font-medium">Lý do xuất kho:</span>
            <span>{order.documentBasis || "...................Số............Ngày.....Tháng......Năm.........của................................................................"}</span>
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
          {order.note && (
            <div className="flex">
              <span className="w-40 font-medium">Ghi chú:</span>
              <span className="italic">{order.note}</span>
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
            {order.items.map((item, idx) => (
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
                    {Number(order.totalAmount).toLocaleString("vi-VN")}
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
              <span className="font-mono text-sm">{Number(order.totalAmount).toLocaleString("vi-VN")} đ</span>
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
                <div>{config?.signer1Title || "Người lập phiếu"}</div>
                <div className="text-[11px] font-normal italic text-slate-600">(Ký, họ tên)</div>
                <div className="signatures-spacer h-16"></div>
              </div>
              <div>
                <div>{config?.signer2Title || "Người nhận hàng"}</div>
                <div className="text-[11px] font-normal italic text-slate-600">(Ký, họ tên)</div>
                <div className="signatures-spacer h-16"></div>
              </div>
              <div>
                <div>{config?.signer3Title || "Thủ kho"}</div>
                <div className="text-[11px] font-normal italic text-slate-600">(Ký, họ tên)</div>
                <div className="signatures-spacer h-16"></div>
              </div>
              <div>
                <div>{config?.signer4Title || "Kế toán trưởng"}</div>
                <div className="text-[11px] font-normal italic text-slate-600">(Ký, họ tên)</div>
                <div className="signatures-spacer h-16"></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
