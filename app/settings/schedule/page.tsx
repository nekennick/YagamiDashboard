import type { ComponentType } from "react";
import { CalendarClock, Clock3, Database } from "lucide-react";
import { DatabaseUnavailable, isDatabaseConnectionError } from "@/components/layout/database-unavailable";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatedPanel, FadeIn } from "@/components/ui/motion-primitives";
import { closeInterruptedRunningLogs } from "@/lib/kiotviet/sync";
import { getScheduleSettings } from "@/lib/schedule";
import { prisma } from "@/lib/prisma";
import { SchedulePanel } from "@/app/settings/schedule/panel";
import { ScheduleLogTable, type ScheduleLogRow } from "@/app/settings/schedule/log-table";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  try {
    await closeInterruptedRunningLogs();

    const [settings, recentLogs] = await Promise.all([
      getScheduleSettings(),
      prisma.syncLog.findMany({
        orderBy: { startedAt: "desc" },
        take: 10
      })
    ]);

    const successCount = recentLogs.filter((log) => log.status === "success").length;
    const errorCount = recentLogs.filter((log) => log.status === "error").length;
    const enabledGroups = settings.groups.filter((group) => group.enabled);
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
                Cấu hình chu kỳ riêng cho từng nhóm dữ liệu. Giao dịch có thể chạy thường xuyên, dữ liệu nền
                chạy buổi sáng, tồn kho chạy cuối ngày và lịch sử hóa đơn để thủ công.
              </p>
            </div>
            <div
              className={cn(
                "inline-flex w-fit items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold",
                settings.enabled
                  ? "bg-success-50 text-success-700 dark:bg-success-950/50 dark:text-success-300"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              )}
            >
              <span className={cn("h-2.5 w-2.5 rounded-full", settings.enabled ? "bg-success-500" : "bg-slate-400")} />
              {settings.enabled ? "Lịch đang bật" : "Lịch đang tắt"}
            </div>
          </div>
        </FadeIn>

        <div className="grid gap-4 md:grid-cols-3">
          <AnimatedPanel delay={0.03}>
            <MetricCard
              icon={Clock3}
              label="Nhóm đang bật"
              value={`${enabledGroups.length}/${settings.groups.length} nhóm`}
              note={enabledGroups.map((group) => group.label).join(", ") || "Chưa bật nhóm nào."}
            />
          </AnimatedPanel>
          <AnimatedPanel delay={0.06}>
            <MetricCard
              icon={CalendarClock}
              label="Lần tự động gần nhất"
              value={settings.lastRunAt ? formatDateTime(new Date(settings.lastRunAt)) : "Chưa có"}
              note="Mỗi nhóm vẫn có mốc chạy gần nhất riêng trong bảng cấu hình."
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

        <div className="space-y-4">
          <AnimatedPanel delay={0.04}>
            <SchedulePanel initialSettings={settings} />
          </AnimatedPanel>

          <AnimatedPanel delay={0.08}>
            <ScheduleLogTable recentLogs={logRows} />
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
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <Icon className="h-5 w-5" />
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
