"use client";

import { useMemo, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock3,
  Database,
  FileClock,
  History,
  Loader2,
  ShoppingCart,
  PackageCheck,
  Play,
  Save,
  Store,
  Users,
  Warehouse
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ScheduleSettings, ScheduledSyncType } from "@/lib/schedule";

const recommendedSyncTypes: ScheduledSyncType[] = ["branches", "products", "customers", "orders", "invoices", "inventory"];
const runOrder: ScheduledSyncType[] = ["branches", "products", "customers", "orders", "invoices", "invoiceHistory", "inventory"];

const syncTypeOptions: Array<{
  value: ScheduledSyncType;
  label: string;
  description: string;
  badge: string;
  recommended?: boolean;
  warning?: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  {
    value: "branches",
    label: "Chi nhánh",
    description: "Cập nhật danh sách kho/chi nhánh làm nền cho báo cáo.",
    badge: "Nền tảng",
    recommended: true,
    icon: Store
  },
  {
    value: "products",
    label: "Sản phẩm",
    description: "Đồng bộ tên hàng, mã hàng, nhóm hàng và đơn vị tính.",
    badge: "Nền tảng",
    recommended: true,
    icon: PackageCheck
  },
  {
    value: "customers",
    label: "Khách hàng",
    description: "Đồng bộ thông tin khách để liên kết hóa đơn và phân tích.",
    badge: "Nền tảng",
    recommended: true,
    icon: Users
  },
  {
    value: "orders",
    label: "Đơn đặt hàng",
    description: "Cập nhật tăng dần, mặc định lùi 2 ngày để bắt đơn chỉnh sửa.",
    badge: "Đơn mới",
    recommended: true,
    icon: ShoppingCart
  },
  {
    value: "invoices",
    label: "Hóa đơn gần đây",
    description: "Chỉ lấy phần mới + buffer, nhẹ hơn so với kéo lại 30 ngày.",
    badge: "Khuyến nghị",
    recommended: true,
    icon: FileClock
  },
  {
    value: "invoiceHistory",
    label: "Lịch sử hóa đơn",
    description: "Kéo lùi từng tháng để bổ sung dữ liệu cũ, phù hợp chạy thủ công hoặc chạy thưa.",
    badge: "Dữ liệu cũ",
    warning: "Nặng hơn, không nên chạy quá thường xuyên.",
    icon: History
  },
  {
    value: "inventory",
    label: "Tồn kho sau cùng",
    description: "Lấy snapshot tồn kho mới nhất sau khi sản phẩm/chi nhánh đã cập nhật.",
    badge: "Chạy cuối",
    recommended: true,
    icon: Warehouse
  }
];

const intervalOptions = [
  { value: 30, label: "30 phút", hint: "Nhanh, chỉ dùng khi cần số liệu rất sát." },
  { value: 60, label: "1 giờ", hint: "Cân bằng cho vận hành trong ngày." },
  { value: 180, label: "3 giờ", hint: "Nhẹ hơn, phù hợp máy local chạy ổn định." },
  { value: 1440, label: "Mỗi ngày", hint: "Phù hợp đồng bộ nền ít thay đổi." }
];

export function SchedulePanel({ initialSettings }: { initialSettings: ScheduleSettings }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [intervalMinutes, setIntervalMinutes] = useState(initialSettings.intervalMinutes);
  const [startTime, setStartTime] = useState(initialSettings.startTime);
  const [syncTypes, setSyncTypes] = useState<ScheduledSyncType[]>(initialSettings.syncTypes);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("Lịch đồng bộ đã sẵn sàng.");

  const selectedRunOrder = useMemo(
    () => runOrder.filter((syncType) => syncTypes.includes(syncType)),
    [syncTypes]
  );
  const selectedLabels = selectedRunOrder
    .map((syncType) => syncTypeOptions.find((option) => option.value === syncType)?.label)
    .filter(Boolean)
    .join(" -> ");
  const selectedInterval = intervalOptions.find((option) => option.value === intervalMinutes) ?? intervalOptions[1];
  const isRecommended =
    syncTypes.length === recommendedSyncTypes.length &&
    recommendedSyncTypes.every((syncType) => syncTypes.includes(syncType));

  async function saveSettings() {
    setSaving(true);
    setMessage("Đang lưu lịch đồng bộ...");

    try {
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, intervalMinutes, startTime, syncTypes })
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
        throw new Error(data.message ?? "Không thể lưu lịch đồng bộ.");
      }

      setMessage(data.message ?? "Đã lưu lịch đồng bộ.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể lưu lịch đồng bộ.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    setRunning(true);
    window.dispatchEvent(
      new CustomEvent("yagami:schedule-sync-start", {
        detail: {
          syncTypes: selectedRunOrder,
          startedAt: new Date().toISOString()
        }
      })
    );
    setMessage("Đang chuẩn bị chạy theo lịch hiện tại...");

    try {
      const saved = await saveSettings();

      if (!saved) {
        window.dispatchEvent(new CustomEvent("yagami:schedule-sync-finish"));
        return;
      }

      setMessage("Đang chạy đồng bộ theo lịch hiện tại...");
      const response = await fetch("/api/schedule/run", { method: "POST" });
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

      setMessage(data.message ?? "Đã chạy đồng bộ theo lịch.");
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
      setMessage(error instanceof Error ? error.message : "Không thể chạy đồng bộ.");
      window.dispatchEvent(
        new CustomEvent("yagami:schedule-sync-finish", {
          detail: {
            results: selectedRunOrder.map((syncType) => ({
              syncType,
              status: "error",
              totalRecords: 0,
              message: error instanceof Error ? error.message : "Không thể chạy đồng bộ."
            })),
            finishedAt: new Date().toISOString()
          }
        })
      );
      router.refresh();
    } finally {
      setRunning(false);
    }
  }

  function toggleSyncType(syncType: ScheduledSyncType) {
    setSyncTypes((current) => {
      if (!current.includes(syncType)) {
        return [...current, syncType];
      }

      if (current.length === 1) {
        setMessage("Lịch tự động cần ít nhất một nhóm dữ liệu để đồng bộ.");
        return current;
      }

      return current.filter((item) => item !== syncType);
    });
  }

  function applyRecommendedPreset() {
    setSyncTypes(recommendedSyncTypes);
    setMessage("Đã chọn cấu hình khuyến nghị: hóa đơn/đơn đặt tăng dần và tồn kho chạy sau cùng.");
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Cấu hình lịch</CardTitle>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Lịch chỉ chạy khi webapp đang mở. Hệ thống sẽ tự sắp xếp thứ tự an toàn khi thực thi.
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
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-500 dark:text-brand-300" />
            <div>
              <div className="font-semibold">Khuyến nghị đang đúng cho lịch tự động</div>
              <p className="mt-1 text-brand-800/80 dark:text-brand-100/75">
                Hóa đơn và đơn đặt sẽ đồng bộ tăng dần, có buffer 2 ngày để bắt dữ liệu chỉnh sửa. Tồn kho là snapshot hiện tại nên luôn chạy sau cùng.
              </p>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">Chu kỳ tự động</div>
              <p className="text-sm text-slate-500 dark:text-slate-400">{selectedInterval.hint}</p>
            </div>
            <Clock3 className="h-5 w-5 text-slate-400" />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {intervalOptions.map((option) => (
              <button
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  intervalMinutes === option.value
                    ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600"
                )}
                key={option.value}
                onClick={() => setIntervalMinutes(option.value)}
                type="button"
              >
                <div className="font-semibold">{option.label}</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{option.hint}</div>
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/40">
            <label className="block text-sm font-semibold text-slate-900 dark:text-white" htmlFor="auto-sync-start-time">
              Giờ bắt đầu trong ngày
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition-colors focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white sm:w-40"
                id="auto-sync-start-time"
                onChange={(event) => setStartTime(event.target.value)}
                type="time"
                value={startTime}
              />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Áp dụng khi chọn chu kỳ mỗi ngày, ví dụ 17:00 thì lịch sẽ chạy sau 17h và chỉ chạy một lần trong ngày.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">Dữ liệu cần đồng bộ</div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Preset khuyến nghị bỏ lịch sử hóa đơn để lịch tự động nhẹ và ổn định hơn.
              </p>
            </div>
            <button
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-brand-200 bg-white px-3 text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50 dark:border-brand-500/30 dark:bg-slate-900 dark:text-brand-300 dark:hover:bg-brand-500/10"
              onClick={applyRecommendedPreset}
              type="button"
            >
              <Database className="h-4 w-4" />
              Chọn khuyến nghị
            </button>
          </div>

          <div className="grid gap-3">
            {syncTypeOptions.map((option) => {
              const Icon = option.icon;
              const checked = syncTypes.includes(option.value);

              return (
                <button
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                    checked
                      ? "border-brand-500 bg-brand-50/80 dark:bg-brand-500/10"
                      : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
                  )}
                  key={option.value}
                  onClick={() => toggleSyncType(option.value)}
                  type="button"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      checked
                        ? "bg-brand-500 text-white"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white">{option.label}</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          option.warning
                            ? "bg-warning-50 text-warning-700 dark:bg-warning-950/50 dark:text-warning-300"
                            : "bg-success-50 text-success-700 dark:bg-success-950/50 dark:text-success-300"
                        )}
                      >
                        {option.badge}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm text-slate-500 dark:text-slate-400">{option.description}</span>
                    {option.warning ? (
                      <span className="mt-1 block text-xs font-medium text-warning-700 dark:text-warning-300">
                        {option.warning}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "mt-1 h-5 w-5 rounded-full border transition-colors",
                      checked ? "border-brand-500 bg-brand-500 shadow-focus-ring" : "border-slate-300 dark:border-slate-600"
                    )}
                  >
                    {checked ? <CheckCircle2 className="h-5 w-5 text-white" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/40">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Thứ tự sẽ chạy
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{selectedLabels}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span
              className={cn(
                "rounded-full px-2 py-1 font-semibold",
                isRecommended
                  ? "bg-success-50 text-success-700 dark:bg-success-950/50 dark:text-success-300"
                  : "bg-warning-50 text-warning-700 dark:bg-warning-950/50 dark:text-warning-300"
              )}
            >
              {isRecommended ? "Đúng cấu hình khuyến nghị" : "Đã tùy chỉnh so với khuyến nghị"}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Lần tự động gần nhất: {initialSettings.lastRunAt ? formatDateTime(initialSettings.lastRunAt) : "Chưa có"}
            </span>
          </div>
        </div>

        <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {message}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button disabled={saving || running} onClick={saveSettings}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Lưu lịch
          </Button>
          <Button disabled={saving || running} onClick={runNow} variant="secondary">
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Chạy thử ngay
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
