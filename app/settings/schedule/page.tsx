import type { ComponentType } from "react";
import { CalendarClock, CheckCircle2, Clock3, Database, XCircle } from "lucide-react";
import { DatabaseUnavailable, isDatabaseConnectionError } from "@/components/layout/database-unavailable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedPanel, AnimatedTableRow, FadeIn } from "@/components/ui/motion-primitives";
import { getScheduleSettings } from "@/lib/schedule";
import { prisma } from "@/lib/prisma";
import { SchedulePanel } from "@/app/settings/schedule/panel";
import { ScheduleLogTable, type ScheduleLogRow } from "@/app/settings/schedule/log-table";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  try {
    const [settings, recentLogs] = await Promise.all([
      getScheduleSettings(),
      prisma.syncLog.findMany({
        orderBy: { startedAt: "desc" },
        take: 10
      })
    ]);

    const successCount = recentLogs.filter((log) => log.status === "success").length;
    const errorCount = recentLogs.filter((log) => log.status === "error").length;
    const logRows: ScheduleLogRow[] = recentLogs.map((log) => ({
      id: String(log.id),
      syncType: log.syncType,
      status: log.status,
      startedAt: log.startedAt.toISOString(),
      finishedAt: log.finishedAt?.toISOString() ?? null,
      totalRecords: log.totalRecords,
      errorMessage: log.errorMessage
    }));

    return (
      <div className="space-y-6">
        <FadeIn>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                Yagami Dashboard
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 dark:text-white">
                Lịch đồng bộ tự động
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
                Cấu hình lịch lấy dữ liệu KiotViet về SQLite local. Lịch tự động nên ưu tiên hóa đơn/đơn đặt tăng dần
                và tồn kho chạy sau cùng để số liệu vận hành luôn mới mà không kéo quá nặng.
              </p>
            </div>
            <div className={cn("inline-flex w-fit items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold", settings.enabled ? "bg-success-50 text-success-700 dark:bg-success-950/50 dark:text-success-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300")}>
              <span className={cn("h-2.5 w-2.5 rounded-full", settings.enabled ? "bg-success-500" : "bg-slate-400")} />
              {settings.enabled ? "Lịch đang bật" : "Lịch đang tắt"}
            </div>
          </div>
        </FadeIn>

        <div className="grid gap-4 md:grid-cols-3">
          <AnimatedPanel delay={0.03}>
            <MetricCard
              icon={Clock3}
              label="Chu kỳ hiện tại"
              value={formatInterval(settings.intervalMinutes, settings.startTime)}
              note="Kiểm tra mỗi phút, chạy khi đủ chu kỳ."
            />
          </AnimatedPanel>
          <AnimatedPanel delay={0.06}>
            <MetricCard
              icon={CalendarClock}
              label="Lần tự động gần nhất"
              value={settings.lastRunAt ? formatDateTime(new Date(settings.lastRunAt)) : "Chưa có"}
              note="Tính theo lần chạy thành công hoặc đã thực thi lịch."
            />
          </AnimatedPanel>
          <AnimatedPanel delay={0.09}>
            <MetricCard
              icon={Database}
              label="Kết quả gần đây"
              value={`${successCount}/${recentLogs.length || 0} thành công`}
              note={errorCount > 0 ? `${errorCount} lần lỗi cần kiểm tra.` : "Không có lỗi trong log mới nhất."}
            />
          </AnimatedPanel>
        </div>

        <div className="grid gap-4 xl:grid-cols-[520px_1fr]">
          <AnimatedPanel delay={0.04}>
            <SchedulePanel initialSettings={settings} />
          </AnimatedPanel>

          <AnimatedPanel delay={0.08}>
            <ScheduleLogTable recentLogs={logRows} />
          </AnimatedPanel>

          <AnimatedPanel className="hidden" delay={0.08}>
            <Card className="overflow-hidden">
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Log đồng bộ gần đây</CardTitle>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Theo dõi thứ tự chạy, trạng thái, số bản ghi và thời lượng từng lượt đồng bộ.
                    </p>
                  </div>
                  <span className="w-fit rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
                    10 lượt mới nhất
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
                      {recentLogs.length === 0 ? (
                        <tr>
                          <td className="px-5 py-10 text-center text-slate-500 dark:text-slate-400" colSpan={6}>
                            Chưa có log đồng bộ.
                          </td>
                        </tr>
                      ) : (
                        recentLogs.map((log, index) => (
                          <AnimatedTableRow
                            key={log.id}
                            className="border-b border-slate-100 last:border-0 dark:border-slate-800"
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
                              {formatNumber(log.totalRecords)}
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
          </AnimatedPanel>
        </div>
      </div>
    );
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return <DatabaseUnavailable error={error} />;
    }

    throw error;
  }
}

function MetricCard({
  icon: Icon,
  label,
  value,
  note
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-600 dark:text-slate-400">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">{value}</div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{note}</p>
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
    inventory: "Tồn kho"
  };

  return labels[syncType] ?? syncType;
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
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
        <Clock3 className="h-3.5 w-3.5" />
        Đang chạy
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

function formatInterval(value: number, startTime?: string) {
  if (value === 1440) {
    return `Mỗi ngày lúc ${startTime ?? "17:00"}`;
  }

  if (value >= 60) {
    return `${value / 60} giờ`;
  }

  return `${value} phút`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}

function formatDateTime(date: Date | null) {
  if (!date) {
    return "Chưa xong";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatDuration(startedAt: Date, finishedAt: Date | null) {
  if (!finishedAt) {
    return "Đang chạy";
  }

  const seconds = Math.max(1, Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000));

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}
