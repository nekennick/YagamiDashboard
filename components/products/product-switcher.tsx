"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

export type ProductSwitchOption = {
  id: number;
  code: string | null;
  name: string;
  categoryName: string | null;
  unit: string | null;
};

type ProductSwitcherProps = {
  currentProductId: number;
  currentProductName: string;
  fromDate: string;
  period: string;
  products: ProductSwitchOption[];
  toDate: string;
};

export function ProductSwitcher({ currentProductId, currentProductName, fromDate, period, products, toDate }: ProductSwitcherProps) {
  const [query, setQuery] = useState(currentProductName);
  const [isOpen, setIsOpen] = useState(false);
  const suggestions = useMemo(() => {
    const normalizedQuery = normalizeText(query);

    if (!normalizedQuery || query === currentProductName) {
      return [];
    }

    return products
      .filter((product) => product.id !== currentProductId)
      .filter((product) => normalizeText(`${product.name} ${product.code ?? ""} ${product.categoryName ?? ""}`).includes(normalizedQuery))
      .slice(0, 8);
  }, [currentProductId, currentProductName, products, query]);

  return (
    <div className="relative z-[80] w-full max-w-3xl">
      <label className="grid gap-1">
        <span className="sr-only">Đổi sản phẩm</span>
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            autoComplete="off"
            className="w-full rounded-xl border border-transparent bg-transparent py-2 pl-3 pr-12 text-2xl font-semibold tracking-normal text-slate-900 outline-none transition duration-200 hover:border-slate-200 hover:bg-white focus:border-indigo-500 focus:bg-white dark:text-white dark:hover:border-slate-700 dark:hover:bg-slate-950 dark:focus:bg-slate-950"
            onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
            onChange={(event) => {
              setQuery(event.target.value);
              setIsOpen(event.target.value.trim().length > 0 && event.target.value !== currentProductName);
            }}
            placeholder="Gõ tên hoặc mã sản phẩm"
            type="search"
            value={query}
          />
          {query !== currentProductName ? (
            <button
              aria-label="Xóa tìm kiếm sản phẩm"
              className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              onClick={() => {
                setQuery(currentProductName);
                setIsOpen(false);
              }}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </label>
      {isOpen ? (
        <div className="absolute left-0 right-0 top-[48px] z-[100] overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl">
          {suggestions.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-500">Không tìm thấy sản phẩm phù hợp.</div>
          ) : (
            suggestions.map((product) => (
              <a
                className="block px-3 py-2 transition-colors duration-200 hover:bg-slate-50"
                href={buildProductHref(product.id, { period, fromDate, toDate })}
                key={product.id}
              >
                <div className="text-sm font-medium text-slate-900">{product.name}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {product.code ?? "Không có mã"} · {product.categoryName ?? "Chưa phân nhóm"} · {product.unit ?? "Chưa có đơn vị"}
                </div>
              </a>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function buildProductHref(productId: number, params: { period: string; fromDate: string; toDate: string }) {
  const searchParams = new URLSearchParams();
  searchParams.set("period", params.period);
  searchParams.set("fromDate", params.fromDate);
  searchParams.set("toDate", params.toDate);
  return `/products/${productId}?${searchParams.toString()}`;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
