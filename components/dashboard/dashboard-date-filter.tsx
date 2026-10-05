"use client";

import { CalendarDays } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const quickRanges = [
  { value: "today", label: "Hôm nay" },
  { value: "thisWeek", label: "Tuần này" },
  { value: "thisMonth", label: "Tháng này" },
  { value: "lastMonth", label: "Tháng trước" },
  { value: "thisQuarter", label: "Quý này" }
];

type DashboardDateFilterProps = {
  initialRange: string;
  initialFrom: string;
  initialTo: string;
};

export function DashboardDateFilter({ initialRange, initialFrom, initialTo }: DashboardDateFilterProps) {
  const router = useRouter();
  const [range, setRange] = useState(initialRange);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  useEffect(() => {
    setRange(initialRange);
    setFrom(initialFrom);
    setTo(initialTo);
  }, [initialFrom, initialRange, initialTo]);

  function apply(nextRange: string, nextFrom = from, nextTo = to) {
    const params = new URLSearchParams({ range: nextRange });

    if (nextRange === "custom") {
      if (nextFrom) params.set("from", nextFrom);
      if (nextTo) params.set("to", nextTo);
    }

    router.push(`/?${params.toString()}`);
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        apply("custom");
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {quickRanges.map((option) => (
          <button
            className={`h-9 rounded-xl border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:focus-visible:ring-slate-500 dark:focus-visible:ring-offset-slate-900 ${
              range === option.value
                ? "border-slate-300 bg-slate-100 text-slate-950 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
            key={option.value}
            onClick={() => {
              setRange(option.value);
              apply(option.value);
            }}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <label className="sr-only" htmlFor="dashboard-from">Từ ngày</label>
        <div className="relative">
          <input
            autoComplete="off"
            className="h-9 w-[150px] rounded-xl border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-900 outline-none transition focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus-visible:border-slate-500 dark:focus-visible:ring-slate-500 dark:focus-visible:ring-offset-slate-900"
            id="dashboard-from"
            name="from"
            onChange={(event) => {
              setRange("custom");
              setFrom(event.target.value);
            }}
            type="date"
            value={from}
          />
          <CalendarDays className="pointer-events-none absolute right-2.5 top-2 h-4 w-4" aria-hidden="true" />
        </div>
        <span>đến</span>
        <label className="sr-only" htmlFor="dashboard-to">Đến ngày</label>
        <div className="relative">
          <input
            autoComplete="off"
            className="h-9 w-[150px] rounded-xl border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-900 outline-none transition focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus-visible:border-slate-500 dark:focus-visible:ring-slate-500 dark:focus-visible:ring-offset-slate-900"
            id="dashboard-to"
            name="to"
            onChange={(event) => {
              setRange("custom");
              setTo(event.target.value);
            }}
            type="date"
            value={to}
          />
          <CalendarDays className="pointer-events-none absolute right-2.5 top-2 h-4 w-4" aria-hidden="true" />
        </div>
        <button className="sr-only" type="submit">Áp dụng khoảng ngày</button>
      </div>
    </form>
  );
}
