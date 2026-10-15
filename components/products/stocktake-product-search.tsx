"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

export type StocktakeProductOption = {
  id: number;
  code: string | null;
  name: string;
  categoryName: string | null;
  unit: string | null;
};

type StocktakeProductSearchProps = {
  products: StocktakeProductOption[];
  selectedProduct: StocktakeProductOption | null;
};

export function StocktakeProductSearch({ products, selectedProduct }: StocktakeProductSearchProps) {
  const [query, setQuery] = useState(selectedProduct?.name ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const normalizedQuery = normalizeText(query);
  const selectedMatches = Boolean(selectedProduct && normalizedQuery && matchesProduct(selectedProduct, normalizedQuery));
  const suggestions = useMemo(() => {
    if (!normalizedQuery || query === selectedProduct?.name) return [];

    return products
      .filter((product) => product.id !== selectedProduct?.id)
      .filter((product) => matchesProduct(product, normalizedQuery))
      .slice(0, 8);
  }, [normalizedQuery, products, query, selectedProduct?.id, selectedProduct?.name]);

  return (
    <div className="relative z-30 w-full max-w-2xl">
      <label className="grid gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
        Sản phẩm cần kiểm tồn
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            autoComplete="off"
            className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-12 pr-12 text-sm outline-none transition focus:border-indigo-500 [&::-webkit-search-cancel-button]:appearance-none dark:border-slate-700 dark:bg-slate-900"
            onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
            onChange={(event) => {
              setQuery(event.target.value);
              setIsOpen(event.target.value.trim().length > 0 && event.target.value !== selectedProduct?.name);
            }}
            onFocus={() => setIsOpen(query.trim().length > 0 && query !== selectedProduct?.name)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (selectedMatches) {
                setIsOpen(false);
                return;
              }
              const firstMatch = suggestions[0];
              if (firstMatch) window.location.href = `/stocktake?productId=${firstMatch.id}`;
            }}
            placeholder="Tìm theo tên hoặc mã sản phẩm"
            type="search"
            value={query}
          />
          {query ? <a aria-label="Xóa sản phẩm đang chọn" className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white" href="/stocktake" onClick={() => setIsOpen(false)}><X className="h-4 w-4" /></a> : null}
        </div>
      </label>
      {isOpen ? <div className="absolute left-0 right-0 top-[76px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        {selectedMatches ? <div className="px-4 py-3 text-sm font-medium text-indigo-700 dark:text-indigo-300">Sản phẩm cần tìm đang hiển thị.</div> : suggestions.length === 0 ? <div className="px-4 py-3 text-sm text-slate-500">Không tìm thấy sản phẩm phù hợp.</div> : suggestions.map((product) => (
          <a className="block px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800" href={`/stocktake?productId=${product.id}`} key={product.id}>
            <div className="text-sm font-medium text-slate-900 dark:text-white">{product.name}</div>
            <div className="mt-1 text-xs text-slate-500">{product.code ?? "Không có mã"} · {product.categoryName ?? "Chưa phân nhóm"} · {product.unit ?? "Chưa có đơn vị"}</div>
          </a>
        ))}
      </div> : null}
    </div>
  );
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function matchesProduct(product: StocktakeProductOption, normalizedQuery: string) {
  return normalizeText(`${product.name} ${product.code ?? ""} ${product.categoryName ?? ""}`).includes(normalizedQuery);
}
