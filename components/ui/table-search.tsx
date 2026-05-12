"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

export type TableSearchSuggestion = {
  label: string;
  value: string;
  meta?: string;
};

type TableSearchProps = {
  baseParams?: Record<string, string>;
  className?: string;
  label?: string;
  name?: string;
  placeholder: string;
  suggestions: TableSearchSuggestion[];
  value: string;
};

export function TableSearch({
  baseParams = {},
  className,
  label,
  name = "q",
  placeholder,
  suggestions,
  value
}: TableSearchProps) {
  const [query, setQuery] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const visibleSuggestions = useMemo(() => {
    const normalizedQuery = normalizeText(query);

    if (!normalizedQuery) {
      return [];
    }

    return suggestions
      .filter((suggestion) => normalizeText(`${suggestion.label} ${suggestion.value} ${suggestion.meta ?? ""}`).includes(normalizedQuery))
      .slice(0, 8);
  }, [query, suggestions]);

  return (
    <label className={className ?? "relative grid gap-1 text-sm"}>
      {label ? <span className="text-xs font-medium text-slate-600">{label}</span> : null}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          autoComplete="off"
          className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-10 text-sm outline-none transition-colors duration-200 focus:border-slate-400"
          name={name}
          onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(event.target.value.trim().length > 0);
          }}
          placeholder={placeholder}
          type="search"
          value={query}
        />
        {query ? (
          <a
            aria-label="Xóa tìm kiếm"
            className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-900"
            href={buildHref(baseParams)}
          >
            <X className="h-4 w-4" />
          </a>
        ) : null}
      </div>
      {isOpen ? (
        <div
          className={`absolute left-0 right-0 z-20 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg ${
            label ? "top-[68px]" : "top-[44px]"
          }`}
        >
          {visibleSuggestions.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-500">Không tìm thấy gợi ý phù hợp trong bảng hiện tại.</div>
          ) : (
            visibleSuggestions.map((suggestion, index) => (
              <a
                className="block px-3 py-2 transition-colors duration-200 hover:bg-slate-50"
                href={buildHref(baseParams, name, suggestion.value)}
                key={`${suggestion.value}-${index}`}
              >
                <div className="text-sm font-medium text-slate-900">{suggestion.label}</div>
                {suggestion.meta ? <div className="mt-1 text-xs text-slate-500">{suggestion.meta}</div> : null}
              </a>
            ))
          )}
        </div>
      ) : null}
    </label>
  );
}

function buildHref(baseParams: Record<string, string>, name?: string, value?: string) {
  const params = new URLSearchParams();

  for (const [key, paramValue] of Object.entries(baseParams)) {
    if (paramValue) {
      params.set(key, paramValue);
    }
  }

  if (name && value) {
    params.set(name, value);
  }

  const query = params.toString();
  return query ? `?${query}` : "?";
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
