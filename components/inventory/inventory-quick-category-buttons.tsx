"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";

type QuickFilter = { value: string; label: string; description: string };

export function InventoryQuickCategoryButtons({ filters, value }: { filters: readonly QuickFilter[]; value: string }) {
  const [loading, setLoading] = useState<string | null>(null);

  function selectFilter(filterValue: string) {
    setLoading(filterValue);
    const params = new URLSearchParams(window.location.search);
    params.set("category", filterValue);
    window.requestAnimationFrame(() => window.location.assign(`${window.location.pathname}?${params.toString()}`));
  }

  return <div className="mb-4 grid gap-3 sm:grid-cols-3" aria-label="Bộ lọc nhanh theo người phụ trách">
    {filters.map((filter, index) => {
      const active = value === filter.value;
      const colors = [
        "border-amber-200 bg-amber-50 text-amber-950 hover:border-amber-300 hover:bg-amber-100",
        "border-sky-200 bg-sky-50 text-sky-950 hover:border-sky-300 hover:bg-sky-100",
        "border-violet-200 bg-violet-50 text-violet-950 hover:border-violet-300 hover:bg-violet-100"
      ];
      return <button
        className={`relative flex min-h-16 items-center justify-between rounded-xl border px-5 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-400 ${colors[index % colors.length]} ${active ? "ring-2 ring-indigo-500 ring-offset-2" : ""}`}
        disabled={loading !== null}
        key={filter.value}
        onClick={() => selectFilter(filter.value)}
        type="button"
      >
        <span><span className="block text-lg font-bold">{filter.label}</span><span className="mt-0.5 block text-xs opacity-75">{filter.description}</span></span>
        {loading === filter.value ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <span className="text-xl font-semibold opacity-40">→</span>}
      </button>;
    })}
  </div>;
}
