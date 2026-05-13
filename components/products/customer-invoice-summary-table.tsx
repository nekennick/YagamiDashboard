"use client";

import { Fragment, useState } from "react";

export type CustomerInvoiceSummaryRow = {
  customerKey: string;
  customerName: string;
  customerCode: string | null;
  quantity: number;
  revenue: number;
  invoiceCount: number;
  invoices: CustomerInvoiceDetailRow[];
};

export type CustomerInvoiceDetailRow = {
  id: number;
  code: string;
  date: string;
  customerName: string;
  customerCode: string | null;
  branchName: string;
  quantity: string;
  price: string;
  discount: string;
  subtotal: string;
};

type CustomerInvoiceSummaryTableProps = {
  rows: CustomerInvoiceSummaryRow[];
};

export function CustomerInvoiceSummaryTable({ rows }: CustomerInvoiceSummaryTableProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-sm text-slate-500">
        Không có dữ liệu tóm tắt theo khách hàng với bộ lọc hiện tại.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <thead>
          <tr className="border-b bg-slate-50 text-left">
            <th className="px-3 py-2 font-medium">STT</th>
            <th className="px-3 py-2 font-medium">Khách hàng</th>
            <th className="px-3 py-2 text-right font-medium">Tổng số lượng trong kỳ</th>
            <th className="px-3 py-2 text-right font-medium">Doanh thu</th>
            <th className="px-3 py-2 text-right font-medium">Hóa đơn</th>
            <th className="px-3 py-2 text-right font-medium">Đối soát</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const isOpen = openKey === row.customerKey;

            return (
              <Fragment key={row.customerKey}>
                <tr className="border-b last:border-0">
                  <td className="px-3 py-2 text-slate-500">{index + 1}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{row.customerName}</div>
                    <div className="mt-1 text-xs text-slate-500">{row.customerCode ?? "Không có mã khách"}</div>
                  </td>
                  <td className="px-3 py-2 text-right">{formatNumber(row.quantity)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(row.revenue)}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(row.invoiceCount)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-50"
                      onClick={() => setOpenKey(isOpen ? null : row.customerKey)}
                      type="button"
                    >
                      {isOpen ? "Ẩn hóa đơn" : "Xem hóa đơn chi tiết"}
                    </button>
                  </td>
                </tr>
                {isOpen ? (
                  <tr className="border-b bg-slate-50/60">
                    <td className="px-3 py-3" colSpan={6}>
                      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                        <table className="w-full min-w-[1040px] border-collapse text-xs">
                          <thead>
                            <tr className="border-b bg-slate-50 text-left">
                              <th className="px-3 py-2 font-medium">STT</th>
                              <th className="px-3 py-2 font-medium">Hóa đơn</th>
                              <th className="px-3 py-2 font-medium">Ngày</th>
                              <th className="px-3 py-2 font-medium">Khách hàng</th>
                              <th className="px-3 py-2 font-medium">Chi nhánh</th>
                              <th className="px-3 py-2 text-right font-medium">SL</th>
                              <th className="px-3 py-2 text-right font-medium">Đơn giá</th>
                              <th className="px-3 py-2 text-right font-medium">Giảm giá</th>
                              <th className="px-3 py-2 text-right font-medium">Thành tiền</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.invoices.length === 0 ? (
                              <tr>
                                <td className="px-3 py-6 text-center text-slate-500" colSpan={9}>
                                  Không có hóa đơn chi tiết cho khách này.
                                </td>
                              </tr>
                            ) : (
                              row.invoices.map((invoice, invoiceIndex) => (
                                <tr className="border-b last:border-0" key={invoice.id}>
                                  <td className="px-3 py-2 text-slate-500">{invoiceIndex + 1}</td>
                                  <td className="px-3 py-2 font-medium text-slate-900">{invoice.code}</td>
                                  <td className="px-3 py-2">{invoice.date}</td>
                                  <td className="px-3 py-2">
                                    <div>{invoice.customerName}</div>
                                    <div className="mt-1 text-slate-500">{invoice.customerCode ?? "Không có mã khách"}</div>
                                  </td>
                                  <td className="px-3 py-2">{invoice.branchName}</td>
                                  <td className="px-3 py-2 text-right">{invoice.quantity}</td>
                                  <td className="px-3 py-2 text-right">{invoice.price}</td>
                                  <td className="px-3 py-2 text-right">{invoice.discount}</td>
                                  <td className="px-3 py-2 text-right">{invoice.subtotal}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value);
}
