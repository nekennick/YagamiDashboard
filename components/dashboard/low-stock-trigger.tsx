"use client";

import React, { useState } from "react";
import { LowStockDialog } from "./low-stock-dialog";
import { ArrowRight } from "lucide-react";

export function LowStockTrigger() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 active:scale-[0.99] transition-all dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60"
      >
        <span>Xem tất cả sản phẩm tồn kho thấp</span>
        <ArrowRight className="h-4 w-4" />
      </button>

      <LowStockDialog isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
