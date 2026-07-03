"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Database, History, Loader2, PackageCheck, Play, Save, ShoppingCart, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ScheduleGroupId, ScheduleGroupSetting, ScheduleSettings, ScheduledSyncType } from "@/lib/schedule";

const intervalOptions = [
  { value: 15, label: "15 phút" },
  { value: 30, label: "30 phút" },
  { value: 60, label: "1 giờ" },
  { value: 180, label: "3 giờ" },
  { value: 360, label: "6 giờ" },
  { value: 720, label: "12 giờ" },
  { value: 1440, label: "Mỗi ngày" }
];

const groupIcons = {
  transaction: ShoppingCart,
  foundation: PackageCheck,
  inventory: Warehouse,
  history: History
} satisfies Record<ScheduleGroupId, typeof ShoppingCart>;

const syncTypeLabels: Record<ScheduledSyncType, string> = {
  branches: "Chi nhánh",
  products: "Sản phẩm",
  customers: "Khách hàng",
  orders: "Đơn đặt",
  invoices: "Hóa đơn",
  invoiceHistory: "Lịch sử hóa đơn",
  inventory: "Tồn kho"
};

export function SchedulePanel({ initialSettings }: { initialSettings: ScheduleSettings }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [groups, setGroups] = useState<ScheduleGroupSetting[]>(initialSettings.groups);
  const [saving, setSaving] = useState(false);
  const [runningGroupId, setRunningGroupId] = useState<ScheduleGroupId | "all" | null>(null);
  const [message, setMessage] = useState("Lịch đồng bộ đã sẵn sàng.");

  async function saveSettings(nextGroups = groups) {
    setSaving(true);
    setMessage("Đang lưu lịch đồng bộ...");

    try {
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, groups: nextGroups })
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "Không thể lưu lịch đồng bộ.");
      }

      setMessage(data.message ?? "Đã lưu lịch đồng bộ.");
      router.refresh();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể lưu lịch đồng bộ.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function runGroup(groupId: ScheduleGroupId | "all") {
    const runGroups = groupId === "all" ? groups.filter((group) => group.enabled) : groups.filter((group) => group.id === groupId);
    const syncTypes = runGroups.flatMap((group) => group.syncTypes);

    if (syncTypes.length === 0) {
      setMessage("Không có nhóm dữ liệu nào đang bật để chạy.");
      return;
    }

    setRunningGroupId(groupId);
    window.dispatchEvent(
      new CustomEvent("yagami:schedule-sync-start", {
        detail: {
          syncTypes,
          startedAt: new Date().toISOString()
        }
      })
    );
    setMessage(groupId === "all" ? "Đang chạy các nhóm đang bật..." : `Đang chạy nhóm ${runGroups[0]?.label ?? ""}...`);

    try {
      const saved = await saveSettings();

      if (!saved) {
        window.dispatchEvent(new CustomEvent("yagami:schedule-sync-finish"));
        return;
      }

      const response = await fetch("/api/schedule/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(groupId === "all" ? {} : { groupId })
      });
      const data = (await response.json()) as {
        message?: string;
        results?: Array<{
          syncType: ScheduledSyncType;
          status: "success" | "error";
          totalRecords: number;
          message: string;
        }>;
      };

      if (!response.ok) {
        throw new Error(data.message ?? "Không thể chạy đồng bộ.");
      }

      setMessage(data.message ?? "Đã chạy đồng bộ.");
      window.dispatchEvent(
        new CustomEvent("yagami:schedule-sync-finish", {
          detail: {
            results: data.results ?? [],
            finishedAt: new Date().toISOString()
          }
        })
      );
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể chạy đồng bộ.";
      setMessage(message);
      window.dispatchEvent(
        new CustomEvent("yagami:schedule-sync-finish", {
          detail: {
            results: syncTypes.map((syncType) => ({ syncType, status: "error", totalRecords: 0, message })),
            finishedAt: new Date().toISOString()
          }
        })
      );
      router.refresh();
    } finally {
      setRunningGroupId(null);
    }
  }

  function updateGroup(groupId: ScheduleGroupId, patch: Partial<ScheduleGroupSetting>) {
    setGroups((current) => current.map((group) => (group.id === groupId ? { ...group, ...patch } : group)));
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Cấu hình lịch</CardTitle>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Mỗi nhóm có chu kỳ riêng. Hệ thống vẫn chỉ chạy một lượt tại một thời điểm để tránh khóa SQLite.
            </p>
          </div>
          <button
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-semibold transition-colors",
              enabled
                ? "border-success-200 bg-success-50 text-success-700 dark:border-success-900/60 dark:bg-success-950/40 dark:text-success-300"
                : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            )}
            onClick={() => setEnabled((value) => !value)}
            type="button"
          >
            <span className={cn("h-2.5 w-2.5 rounded-full", enabled ? "bg-success-500" : "bg-slate-400")} />
            {enabled ? "Đang bật" : "Đang tắt"}
          </button>
        </div>

        <div className="rounded-xl border border-brand-100 bg-brand-50/80 p-3 text-sm text-brand-900 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-100">
          <div className="flex items-start gap-3">
            <Database className="mt-0.5 h-4 w-4 shrink-0 text-brand-500 dark:text-brand-300" />
            <p>
              Gợi ý vận hành: giao dịch chạy thường xuyên, dữ liệu nền chạy buổi sáng, tồn kho chạy cuối ngày,
              lịch sử hóa đơn để thủ công.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="min-w-[860px]">
          <div className="grid grid-cols-[1.15fr_88px_120px_110px_150px_112px] bg-slate-100 px-4 py-3 text-xs font-semibold uppercase text-slate-500 dark:bg-slate-800/80 dark:text-slate-300">
            <div>Nhóm đồng bộ</div>
            <div>Trạng thái</div>
            <div>Chu kỳ</div>
            <div>Giờ chạy</div>
            <div>Lần gần nhất</div>
            <div className="text-right">Hành động</div>
          </div>

          {groups.map((group) => {
            const Icon = groupIcons[group.id];
            const running = runningGroupId === group.id || runningGroupId === "all";

            return (
              <div
                className="grid grid-cols-[1.15fr_88px_120px_110px_150px_112px] items-center gap-2 border-t border-slate-100 px-4 py-3 text-sm dark:border-slate-800"
                key={group.id}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-950 dark:text-white">{group.label}</div>
                      <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {group.syncTypes.map((syncType) => syncTypeLabels[syncType]).join(", ")}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  className={cn(
                    "h-8 rounded-full px-3 text-xs font-semibold",
                    group.enabled
                      ? "bg-success-50 text-success-700 dark:bg-success-950/50 dark:text-success-300"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"
                  )}
                  onClick={() => updateGroup(group.id, { enabled: !group.enabled })}
                  type="button"
                >
                  {group.enabled ? "Bật" : "Tắt"}
                </button>

                <select
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  onChange={(event) => updateGroup(group.id, { intervalMinutes: Number(event.target.value) })}
                  value={group.intervalMinutes}
                >
                  {intervalOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <input
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  disabled={group.intervalMinutes !== 1440}
                  onChange={(event) => updateGroup(group.id, { startTime: event.target.value })}
                  type="time"
                  value={group.startTime}
                />

                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {group.lastRunAt ? formatDateTime(group.lastRunAt) : "Chưa có"}
                </div>

                <div className="flex justify-end">
                  <button
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    disabled={saving || Boolean(runningGroupId)}
                    onClick={() => runGroup(group.id)}
                    type="button"
                  >
                    {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    Chạy
                  </button>
                </div>
              </div>
            );
          })}
          </div>
        </div>

        <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {message}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button disabled={saving || Boolean(runningGroupId)} onClick={() => saveSettings()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Lưu lịch
          </Button>
          <Button disabled={saving || Boolean(runningGroupId)} onClick={() => runGroup("all")} variant="secondary">
            {runningGroupId === "all" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Chạy các nhóm đang bật
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
