"use client";

import { useState } from "react";
import { TableSearch, TableSearchSuggestion } from "@/components/ui/table-search";
import { warehouseFilterOptions, warehouseSelectClassName } from "@/lib/warehouse-filter";

type CustomerFiltersProps = {
  initialQuery: string;
  initialActivity: string;
  initialRange: string;
  initialFrom: string;
  initialTo: string;
  initialWarehouse: string;
  searchSuggestions: TableSearchSuggestion[];
};

export function CustomerFilters({
  initialQuery,
  initialActivity,
  initialRange,
  initialFrom,
  initialTo,
  initialWarehouse,
  searchSuggestions
}: CustomerFiltersProps) {
  const [range, setRange] = useState(initialRange);

  return (
    <form className="flex flex-col gap-3 lg:flex-row lg:items-end" method="GET">
      <div className="flex-grow min-w-0">
        <TableSearch
          baseParams={{
            ...(initialActivity !== "all" ? { activity: initialActivity } : {}),
            ...(range !== "all" ? { range } : {}),
            ...(initialFrom ? { from: initialFrom } : {}),
            ...(initialTo ? { to: initialTo } : {}),
            ...(initialWarehouse ? { warehouse: initialWarehouse } : {})
          }}
          placeholder="Tìm theo tên, mã hoặc số điện thoại"
          suggestions={searchSuggestions}
          value={initialQuery}
        />
      </div>

        <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">
            Trạng thái hoạt động
          </span>
          <select
            className="h-12 w-[180px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-slate-400 dark:focus:border-slate-600 transition"
            defaultValue={initialActivity}
            name="activity"
          >
            <option value="all">Tất cả khách hàng</option>
            <option value="active">Có mua hàng</option>
            <option value="inactive">Chưa có hóa đơn</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">
            Kho phụ trách
          </span>
          <select className={`${warehouseSelectClassName()} h-12 w-[180px] rounded-xl`} defaultValue={initialWarehouse} name="warehouse">
            <option value="">Tất cả kho</option>
            {warehouseFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">
            Khoảng thời gian
          </span>
          <select
            className="h-12 w-[180px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-slate-400 dark:focus:border-slate-600 transition"
            value={range}
            onChange={(e) => setRange(e.target.value)}
            name="range"
          >
            <option value="all">Tất cả thời gian</option>
            <option value="today">Hôm nay</option>
            <option value="7d">7 ngày qua</option>
            <option value="30d">30 ngày qua</option>
            <option value="thisMonth">Tháng này</option>
            <option value="lastMonth">Tháng trước</option>
            <option value="3m">3 tháng qua</option>
            <option value="6m">6 tháng qua</option>
            <option value="year">Năm nay</option>
            <option value="custom">Tùy chỉnh ngày</option>
          </select>
        </div>

        {range === "custom" && (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">
                Từ ngày
              </span>
              <input
                className="h-12 w-[160px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-slate-400 dark:focus:border-slate-600 transition"
                defaultValue={initialFrom}
                name="from"
                type="date"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">
                Đến ngày
              </span>
              <input
                className="h-12 w-[160px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-slate-400 dark:focus:border-slate-600 transition"
                defaultValue={initialTo}
                name="to"
                type="date"
              />
            </div>
          </>
        )}

        <button
          className="h-12 self-end rounded-xl bg-slate-900 dark:bg-slate-100 px-6 text-sm font-semibold text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 transition duration-200 shadow-sm"
          type="submit"
        >
          Lọc
        </button>
      </div>
    </form>
  );
}
