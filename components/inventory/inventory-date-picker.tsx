"use client";

import { CalendarDays, ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

type InventoryDatePickerProps = {
  value: string;
  max: string;
};

export function InventoryDatePicker({ value, max }: InventoryDatePickerProps) {
  const [selectedDate, setSelectedDate] = useState(value);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setSelectedDate(value);
  }, [value]);

  function changeDate(nextDate: string) {
    if (!isValidDate(nextDate) || nextDate > max) return;

    setSelectedDate(nextDate);
    setIsLoading(true);
    const params = new URLSearchParams(window.location.search);
    params.set("date", nextDate);
    window.requestAnimationFrame(() => window.location.assign(`${window.location.pathname}?${params.toString()}`));
  }

  return (
    <div aria-label="Chọn ngày kết tồn" className={`flex h-10 min-w-[220px] items-center rounded-md border border-slate-200 bg-white transition-opacity ${isLoading ? "opacity-70" : ""}`}>
      <button
        aria-label="Xem ngày trước"
        className="inline-flex h-full w-9 items-center justify-center rounded-l-md text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={isLoading}
        onClick={() => changeDate(addDays(selectedDate, -1))}
        type="button"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div className="relative min-w-[140px] flex-1">
        <input
          aria-label="Ngày kết tồn"
          className="h-9 w-full cursor-pointer bg-transparent px-2 pr-7 text-center text-sm outline-none [&::-webkit-calendar-picker-indicator]:opacity-0"
          disabled={isLoading}
          max={max}
          name="date"
          onChange={(event) => changeDate(event.target.value)}
          onClick={(event) => {
            try {
              event.currentTarget.showPicker?.();
            } catch {
              // Browsers that do not support showPicker still open the native picker normally.
            }
          }}
          type="date"
          value={selectedDate}
        />
        {isLoading ? <LoaderCircle className="pointer-events-none absolute right-1.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-500" /> : <CalendarDays className="pointer-events-none absolute right-1.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />}
      </div>
      <button
        aria-label="Xem ngày sau"
        className="inline-flex h-full w-9 items-center justify-center rounded-r-md text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={isLoading || selectedDate >= max}
        onClick={() => changeDate(addDays(selectedDate, 1))}
        type="button"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function addDays(value: string, amount: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
}
