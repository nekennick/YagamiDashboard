"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Loader2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedTableRow } from "@/components/ui/motion-primitives";

export type ScheduleLogRow = {
  id: string;
  syncType: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  totalRecords: number;
  errorMessage: string | null;
};

type RunningSyncEvent = CustomEvent<{
  syncTypes: string[];
  startedAt: string;
}>;

type FinishedSyncEvent = CustomEvent<{
  finishedAt: string;
  results: Array<{
    syncType: string;
    status: "success" | "error";
    totalRecords: number;
    message: string;
  }>;
}>;

export function ScheduleLogTable({ recentLogs }: { recentLogs: ScheduleLogRow[] }) {
  const [optimisticRows, setOptimisticRows] = useState<ScheduleLogRow[]>([]);
  const [runStartedAt, setRunStartedAt] = useState<string | null>(null);

  useEffect(() => {
    function handleStart(event: Event) {
      const detail = (event as RunningSyncEvent).detail;
      const startedAt = detail?.startedAt ?? new Date().toISOString();
      const syncTypes = detail?.syncTypes?.length ? detail.syncTypes : ["scheduledSync"];
      setRunStartedAt(startedAt);

      setOptimisticRows(
        syncTypes.map((syncType, index) => ({
          id: `queued-${syncType}-${startedAt}-${index}`,
          syncType,
          status: "queued",
          startedAt,
          finishedAt: null,
          totalRecords: 0,
          errorMessage: null,
        })),
      );
    }

    function handleFinish(event: Event) {
      const detail = (event as FinishedSyncEvent).detail;

      if (!detail?.results?.length) {
        setOptimisticRows([]);
        setRunStartedAt(null);
        return;
      }

      setOptimisticRows((current) =>
        current.map((row) => {
          if (row.status !== "running" && row.status !== "queued") {
            return row;
          }

          const result = detail.results.find((item) => item.syncType === row.syncType);

          if (!result) {
            return row;
          }

          return {
            ...row,
            id: `completed-${row.syncType}-${detail.finishedAt}`,
            status: result.status,
            finishedAt: detail.finishedAt,
            totalRecords: result.totalRecords,
            errorMessage: result.status === "error" ? result.message : null,
          };
        }),
      );
      window.setTimeout(() => {
        setOptimisticRows((current) => (current.every((row) => row.status !== "running") ? [] : current));
        setRunStartedAt(null);
      }, 3500);
    }

    window.addEventListener("yagami:schedule-sync-start", handleStart);
    window.addEventListener("yagami:schedule-sync-finish", handleFinish);

    return () => {
      window.removeEventListener("yagami:schedule-sync-start", handleStart);
      window.removeEventListener("yagami:schedule-sync-finish", handleFinish);
    };
  }, []);

  useEffect(() => {
    if (!runStartedAt) return;

    let cancelled = false;

    async function refreshRunningLogs() {
      try {
        const response = await fetch(`/api/schedule/logs?since=${encodeURIComponent(runStartedAt ?? "")}`, {
          cache: "no-store"
        });
        const data = (await response.json()) as { logs?: ScheduleLogRow[] };

        if (!response.ok || cancelled || !data.logs) return;

        setOptimisticRows((current) => mergeRowsWithDatabaseLogs(current, data.logs ?? []));
      } catch {
        // Keep the optimistic rows visible if the lightweight refresh fails.
      }
    }

    void refreshRunningLogs();
    const interval = window.setInterval(refreshRunningLogs, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [runStartedAt]);

  const rows = useMemo(() => {
    const optimisticIds = new Set(optimisticRows.map((row) => row.id));
    const sortedOptimisticRows = [...optimisticRows].sort((left, right) => {
      const leftTime = new Date(left.finishedAt ?? left.startedAt).getTime();
      const rightTime = new Date(right.finishedAt ?? right.startedAt).getTime();
      return rightTime - leftTime;
    });

    return [...sortedOptimisticRows, ...recentLogs.filter((row) => !optimisticIds.has(row.id))].slice(0, 10);
  }, [optimisticRows, recentLogs]);
  const hasRunningRows = optimisticRows.some((row) => row.status === "running" || row.status === "queued");
  const hasJustFinishedRows = optimisticRows.length > 0 && !hasRunningRows;

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Log đồng bộ gần đây</CardTitle>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Theo dõi thứ tự chạy, trạng thái, số bản ghi và thời lượng từng lượt đồng bộ.
            </p>
          </div>
          <span
            className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
              hasRunningRows
                ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                : "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300"
            }`}
          >
            {hasRunningRows ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {hasRunningRows ? "Đang chạy" : hasJustFinishedRows ? "Vừa hoàn tất" : "10 lượt mới nhất"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="text-left">
                <th className="px-5 py-4 font-semibold">STT</th>
                <th className="px-5 py-4 font-semibold">Loại dữ liệu</th>
                <th className="px-5 py-4 font-semibold">Trạng thái</th>
                <th className="px-5 py-4 text-right font-semibold">Bản ghi</th>
                <th className="px-5 py-4 font-semibold">Bắt đầu</th>
                <th className="px-5 py-4 font-semibold">Thời lượng</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-center text-slate-500 dark:text-slate-400" colSpan={6}>
                    Chưa có log đồng bộ.
                  </td>
                </tr>
              ) : (
                rows.map((log, index) => (
                  <AnimatedTableRow
                    key={log.id}
                    className={`border-b border-slate-100 last:border-0 dark:border-slate-800 ${
                      log.status === "running" || log.status === "queued" ? "bg-brand-50/50 dark:bg-brand-500/5" : ""
                    }`}
                    delay={Math.min(index, 12) * 0.015}
                  >
                    <td className="px-5 py-4 text-slate-500 dark:text-slate-400">{index + 1}</td>
                    <td className="px-5 py-4 font-semibold text-slate-900 dark:text-white">
                      {syncTypeLabel(log.syncType)}
                      {log.errorMessage ? (
                        <div className="mt-1 max-w-[280px] truncate text-xs font-medium text-error-600 dark:text-error-300">
                          {log.errorMessage}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-5 py-4">{statusBadge(log.status)}</td>
                    <td className="px-5 py-4 text-right font-semibold text-slate-900 dark:text-white">
                      {log.status === "running" || log.status === "queued" ? "..." : formatNumber(log.totalRecords)}
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">{formatDateTime(log.startedAt)}</td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {formatDuration(log.startedAt, log.finishedAt)}
                    </td>
                  </AnimatedTableRow>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function syncTypeLabel(syncType: string) {
  const labels: Record<string, string> = {
    branches: "Chi nhánh",
    products: "Sản phẩm",
    customers: "Khách hàng",
    orders: "Đơn đặt hàng",
    invoices: "Hóa đơn gần đây",
    invoiceHistory: "Lịch sử hóa đơn",
    inventory: "Tồn kho",
    scheduledSync: "Đồng bộ theo lịch",
  };

  return labels[syncType] ?? syncType;
}

function mergeRowsWithDatabaseLogs(currentRows: ScheduleLogRow[], databaseLogs: ScheduleLogRow[]) {
  const latestByType = new Map<string, ScheduleLogRow>();

  for (const log of databaseLogs) {
    const current = latestByType.get(log.syncType);

    if (!current || new Date(log.startedAt).getTime() > new Date(current.startedAt).getTime()) {
      latestByType.set(log.syncType, log);
    }
  }

  return currentRows.map((row) => latestByType.get(row.syncType) ?? row);
}

function statusBadge(status: string) {
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-2.5 py-1 text-xs font-semibold text-success-700 dark:bg-success-950/50 dark:text-success-300">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Thành công
      </span>
    );
  }

  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Đang chạy
      </span>
    );
  }

  if (status === "queued") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        <Clock3 className="h-3.5 w-3.5" />
        Chờ chạy
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-error-50 px-2.5 py-1 text-xs font-semibold text-error-700 dark:bg-error-950/50 dark:text-error-300">
      <XCircle className="h-3.5 w-3.5" />
      Lỗi
    </span>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Chưa xong";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(startedAt: string, finishedAt: string | null) {
  if (!finishedAt) {
    return (
      <span className="inline-flex items-center gap-2 text-brand-700 dark:text-brand-300">
        <Clock3 className="h-3.5 w-3.5 animate-pulse" />
        Đang chạy
      </span>
    );
  }

  const seconds = Math.max(1, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000));

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}
