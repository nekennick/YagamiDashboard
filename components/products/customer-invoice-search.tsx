"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

export type CustomerSearchOption = {
  id: number;
  code: string | null;
  name: string;
};

type CustomerInvoiceSearchProps = {
  customers: CustomerSearchOption[];
  selectedCustomerId: string;
  keyword: string;
  period: string;
  fromDate: string;
  toDate: string;
};

export function CustomerInvoiceSearch({
  customers,
  selectedCustomerId,
  keyword,
  period,
  fromDate,
  toDate
}: CustomerInvoiceSearchProps) {
  const selectedCustomer = customers.find((customer) => String(customer.id) === selectedCustomerId) ?? null;
  const [customerQuery, setCustomerQuery] = useState(selectedCustomer ? displayCustomer(selectedCustomer) : "");
  const [isOpen, setIsOpen] = useState(false);

  const suggestions = useMemo(() => {
    const normalizedQuery = normalizeText(customerQuery);

    if (!normalizedQuery) {
      return [];
    }

    return customers
      .filter((customer) => normalizeText(`${customer.name} ${customer.code ?? ""}`).includes(normalizedQuery))
      .slice(0, 8);
  }, [customerQuery, customers]);

  return (
    <form className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_minmax(240px,1fr)_auto]">
      <input name="period" type="hidden" value={period} />
      <input name="fromDate" type="hidden" value={fromDate} />
      <input name="toDate" type="hidden" value={toDate} />
      <input name="invoiceCustomer" type="hidden" value={selectedCustomerId} />

      <div className="relative grid gap-1 text-sm">
        <span className="text-xs font-medium text-slate-600">Khách hàng</span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            autoComplete="off"
            className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-10 text-sm outline-none transition-colors duration-200 focus:border-slate-400"
            onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
            onChange={(event) => {
              setCustomerQuery(event.target.value);
              setIsOpen(event.target.value.trim().length > 0);
            }}
            placeholder="Gõ tên hoặc mã khách"
            type="search"
            value={customerQuery}
          />
          {customerQuery ? (
            <a
              aria-label="Xóa khách hàng"
              className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-900"
              href={buildHref({ period, fromDate, toDate, keyword })}
            >
              <X className="h-4 w-4" />
            </a>
          ) : null}
        </div>
        {isOpen ? (
          <div className="absolute left-0 right-0 top-[68px] z-20 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
            <a
              className="block border-b border-slate-100 px-3 py-2 text-sm text-slate-700 transition-colors duration-200 hover:bg-slate-50"
              href={buildHref({ period, fromDate, toDate, keyword })}
            >
              Tất cả khách hàng
            </a>
            {suggestions.length === 0 ? (
              <div className="px-3 py-3 text-sm text-slate-500">Không tìm thấy khách hàng phù hợp.</div>
            ) : (
              suggestions.map((customer) => (
                <a
                  className="block px-3 py-2 transition-colors duration-200 hover:bg-slate-50"
                  href={buildHref({ period, fromDate, toDate, customerId: String(customer.id), keyword })}
                  key={customer.id}
                >
                  <div className="text-sm font-medium text-slate-900">{customer.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{customer.code ?? "Không có mã khách"}</div>
                </a>
              ))
            )}
          </div>
        ) : null}
        {selectedCustomer ? (
          <div className="text-xs text-slate-500">
            Đang lọc: <span className="font-medium text-slate-700">{displayCustomer(selectedCustomer)}</span>
          </div>
        ) : null}
      </div>

      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-slate-600">Tìm hóa đơn/khách</span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition-colors duration-200 focus:border-slate-400"
            defaultValue={keyword}
            name="invoiceQ"
            placeholder="Mã hóa đơn, mã khách, tên khách"
          />
        </div>
      </label>

      <button className="h-10 self-end rounded-md bg-slate-900 px-4 text-sm font-medium text-white transition-colors duration-200 hover:bg-slate-800">
        Lọc bảng
      </button>
    </form>
  );
}

function displayCustomer(customer: CustomerSearchOption) {
  return `${customer.name}${customer.code ? ` (${customer.code})` : ""}`;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function buildHref({
  period,
  fromDate,
  toDate,
  customerId,
  keyword
}: {
  period: string;
  fromDate: string;
  toDate: string;
  customerId?: string;
  keyword?: string;
}) {
  const params = new URLSearchParams();
  params.set("period", period);
  params.set("fromDate", fromDate);
  params.set("toDate", toDate);

  if (customerId) {
    params.set("invoiceCustomer", customerId);
  }

  if (keyword) {
    params.set("invoiceQ", keyword);
  }

  return `?${params.toString()}`;
}
