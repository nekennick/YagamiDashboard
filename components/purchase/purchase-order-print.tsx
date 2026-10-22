"use client";

import React, { useRef } from "react";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { numberToVietnameseWords } from "@/lib/utils/number-to-words";

export type PrintTemplateConfig = {
  companyName?: string;
  warehouseName?: string;
  formNumber?: string;
  circular?: string;
  defaultAddress?: string;
  footerNote?: string;
  showLogo?: boolean;
  showSignatures?: boolean;
};

export const DEFAULT_PRINT_SETTINGS: PrintTemplateConfig = {
  companyName: "CÔNG TY TNHH YAGAMI KITCHEN",
  warehouseName: "TỔNG KHO YAGAMI",
  formNumber: "Mẫu số: 01 - VT",
  circular: "(Kèm theo Thông tư số 99/2025/TT-BTC ngày 27 tháng 10 năm 2025 của Bộ trưởng Bộ Tài chính)",
  defaultAddress: "Phường 2, Thành phố Cao Lãnh, Đồng Tháp",
  footerNote: "“Đơn giá và thành tiền trên phiếu chỉ phục vụ quản lý nội bộ theo giá bán; không phải giá nhập, giá vốn hoặc căn cứ ghi sổ kế toán.”",
  showLogo: true,
  showSignatures: true
};

export type PurchaseOrderPrintData = {
  code: string;
  purchaseDate: string | Date;
  delivererName?: string | null;
  supplierName?: string | null;
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
  order: PurchaseOrderPrintData;
  config?: PrintTemplateConfig;
  onClose?: () => void;
  autoPrint?: boolean;
};

export const PurchaseOrderPrint: React.FC<Props> = ({
  order,
  config,
  onClose,
  autoPrint = false
}) => {
  const printRef = useRef<HTMLDivElement>(null);

  const companyName = config?.companyName || "CÔNG TY TNHH YAGAMI KITCHEN";
  const warehouseName = config?.warehouseName || order.branchName || "TỔNG KHO YAGAMI";
  const formNumber = config?.formNumber || "Mẫu số: 01 - VT";
  const circular =
    config?.circular ||
    "(Kèm theo Thông tư số 99/2025/TT-BTC ngày 27 tháng 10 năm 2025 của Bộ trưởng Bộ Tài chính)";
  const address = order.branchAddress || config?.defaultAddress || "Phường 2, Thành phố Cao Lãnh, Đồng Tháp";
  const footerNote =
    config?.footerNote ||
    "“Đơn giá và thành tiền trên phiếu chỉ phục vụ quản lý nội bộ theo giá bán; không phải giá nhập, giá vốn hoặc căn cứ ghi sổ kế toán.”";

  const formattedDate = React.useMemo(() => {
    try {
      const d = new Date(order.purchaseDate);
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return String(order.purchaseDate);
    }
  }, [order.purchaseDate]);

  const handlePrint = () => {
    window.print();
  };

  React.useEffect(() => {
    if (autoPrint) {
      const timer = setTimeout(() => {
        window.print();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoPrint]);

  const words = numberToVietnameseWords(order.totalAmount);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-900/70 backdrop-blur-sm p-4 overflow-y-auto print:p-0 print:bg-white print:static print:z-auto">
      {/* Top Action Bar (hidden when printing) */}
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between rounded-t-xl bg-slate-800 px-6 py-3.5 text-white shadow-xl print:hidden">
        <div className="flex items-center gap-2">
          <Printer className="h-5 w-5 text-indigo-400" />
          <span className="font-semibold text-sm">Xem trước mẫu in Phiếu nhập hàng ({order.code})</span>
        </div>
        <div className="flex items-center gap-3">
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

      {/* Printable Sheet (Standard A4 page format) */}
      <div
        ref={printRef}
        className="print-sheet mx-auto w-full max-w-4xl bg-white text-slate-900 p-8 sm:p-12 shadow-2xl rounded-b-xl print:p-0 print:shadow-none print:rounded-none print:w-full print:max-w-none"
        style={{ fontFamily: "'Times New Roman', Times, serif, 'Noto Sans', sans-serif" }}
      >
        {/* Header Section */}
        <div className="grid grid-cols-2 gap-4 pb-4">
          <div className="text-left text-sm leading-relaxed">
            <div className="font-bold uppercase tracking-wider">{companyName}</div>
            <div className="font-bold uppercase">{warehouseName}</div>
          </div>
          <div className="text-right text-xs leading-normal">
            <div className="font-bold">{formNumber}</div>
            <div className="italic text-[11px] text-slate-700">{circular}</div>
          </div>
        </div>

        {/* Title */}
        <div className="text-center my-4">
          <h1 className="text-2xl font-bold tracking-wide uppercase">PHIẾU NHẬP HÀNG</h1>
          <div className="text-sm font-semibold mt-1">Mã phiếu: {order.code}</div>
          <div className="text-xs italic text-slate-700 mt-0.5">Ngày: {formattedDate}</div>
        </div>

        {/* Info Rows */}
        <div className="text-xs space-y-1.5 mb-5 text-slate-900 leading-relaxed">
          <div className="flex">
            <span className="w-40 font-medium">Họ và tên người giao:</span>
            <span className="font-semibold">{order.delivererName || order.supplierName || "...................................................................."}</span>
          </div>
          <div className="flex">
            <span className="w-40 font-medium">Theo:</span>
            <span>...................Số............Ngày.....Tháng......Năm.........của................................................................</span>
          </div>
          <div className="flex">
            <span className="w-40 font-medium">Chi nhánh nhập:</span>
            <span className="font-semibold">{warehouseName}</span>
          </div>
          <div className="flex">
            <span className="w-40 font-medium">Địa chỉ:</span>
            <span>{address}</span>
          </div>
          {order.note && (
            <div className="flex">
              <span className="w-40 font-medium">Ghi chú:</span>
              <span className="italic">{order.note}</span>
            </div>
          )}
        </div>

        {/* Items Table */}
        <table className="w-full border-collapse border border-slate-900 text-xs">
          <thead>
            <tr className="bg-slate-100 font-bold text-center border-b border-slate-900">
              <th className="border border-slate-900 py-1.5 px-2 w-10">STT</th>
              <th className="border border-slate-900 py-1.5 px-2 w-28 text-left">Mã hàng</th>
              <th className="border border-slate-900 py-1.5 px-3 text-left">Tên hàng</th>
              <th className="border border-slate-900 py-1.5 px-2 w-20 text-right">Số lượng</th>
              <th className="border border-slate-900 py-1.5 px-2 w-16 text-center">ĐVT</th>
              <th className="border border-slate-900 py-1.5 px-2 w-24 text-right">Đơn giá</th>
              <th className="border border-slate-900 py-1.5 px-3 w-28 text-right">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, idx) => (
              <tr key={idx} className="border-b border-slate-400">
                <td className="border border-slate-900 py-1.5 px-2 text-center">{idx + 1}</td>
                <td className="border border-slate-900 py-1.5 px-2 font-mono font-medium text-left">{item.productCode || "-"}</td>
                <td className="border border-slate-900 py-1.5 px-3 text-left font-medium">{item.productName}</td>
                <td className="border border-slate-900 py-1.5 px-2 text-right font-semibold">
                  {Number(item.quantity).toLocaleString("vi-VN")}
                </td>
                <td className="border border-slate-900 py-1.5 px-2 text-center">{item.unit || "-"}</td>
                <td className="border border-slate-900 py-1.5 px-2 text-right font-mono">
                  {Number(item.price).toLocaleString("vi-VN")}
                </td>
                <td className="border border-slate-900 py-1.5 px-3 text-right font-mono font-semibold">
                  {Number(item.amount).toLocaleString("vi-VN")}
                </td>
              </tr>
            ))}
            {/* Total Row */}
            <tr className="border-t border-slate-900 font-bold bg-slate-50">
              <td colSpan={3} className="border border-slate-900 py-1.5 px-3 text-right uppercase">
                Tổng cộng:
              </td>
              <td className="border border-slate-900 py-1.5 px-2 text-right font-mono font-bold">
                {Number(order.totalQuantity).toLocaleString("vi-VN")}
              </td>
              <td className="border border-slate-900"></td>
              <td className="border border-slate-900"></td>
              <td className="border border-slate-900 py-1.5 px-3 text-right font-mono font-bold">
                {Number(order.totalAmount).toLocaleString("vi-VN")}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Footer Internal Note */}
        <div className="mt-3 text-[11px] italic text-slate-800 leading-normal">
          {footerNote}
        </div>

        {/* Total in words */}
        <div className="mt-3 text-xs space-y-1">
          <div className="flex font-semibold">
            <span className="w-48">Tổng tiền hàng:</span>
            <span className="font-mono text-sm">{Number(order.totalAmount).toLocaleString("vi-VN")} đ</span>
          </div>
          <div className="flex italic text-slate-900">
            <span className="w-48 not-italic font-semibold">Tổng tiền hàng (bằng chữ):</span>
            <span className="font-semibold">{words}</span>
          </div>
        </div>

        {/* Signatures Section */}
        <div className="mt-8 grid grid-cols-4 gap-2 text-center text-xs break-inside-avoid">
          <div>
            <div className="font-bold">Người lập phiếu</div>
            <div className="italic text-[11px] text-slate-600 mt-0.5">(Ký, họ tên)</div>
            <div className="h-16"></div>
          </div>
          <div>
            <div className="font-bold">Người giao hàng</div>
            <div className="italic text-[11px] text-slate-600 mt-0.5">(Ký, họ tên)</div>
            <div className="h-16"></div>
          </div>
          <div>
            <div className="font-bold">Thủ kho</div>
            <div className="italic text-[11px] text-slate-600 mt-0.5">(Ký, họ tên)</div>
            <div className="h-16"></div>
          </div>
          <div>
            <div className="text-[11px] italic text-slate-700 mb-0.5">Ngày.....tháng.....năm.......</div>
            <div className="font-bold">Kế toán trưởng</div>
            <div className="italic text-[11px] text-slate-600 mt-0.5">(Ký, họ tên)</div>
            <div className="h-16"></div>
          </div>
        </div>
      </div>

      {/* Embedded CSS for flawless print layout */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-sheet,
          .print-sheet * {
            visibility: visible;
          }
          .print-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 10mm 15mm !important;
            box-shadow: none !important;
            background: white !important;
            color: black !important;
          }
          @page {
            size: A4 portrait;
            margin: 0;
          }
        }
      `}</style>
    </div>
  );
};
