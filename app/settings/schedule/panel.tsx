"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScheduleSettings, ScheduledSyncType } from "@/lib/schedule";

const syncTypeOptions: Array<{ value: ScheduledSyncType; label: string }> = [
  { value: "branches", label: "Chi nhánh" },
  { value: "products", label: "Sản phẩm" },
  { value: "customers", label: "Khách hàng" },
  { value: "invoices", label: "Hóa đơn 30 ngày" },
  { value: "invoiceHistory", label: "Lịch sử hóa đơn" },
  { value: "inventory", label: "Tồn kho" }
];

const intervalOptions = [
  { value: 30, label: "30 phút" },
  { value: 60, label: "1 giờ" },
  { value: 180, label: "3 giờ" },
  { value: 1440, label: "Mỗi ngày" }
];

export function SchedulePanel({ initialSettings }: { initialSettings: ScheduleSettings }) {
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [intervalMinutes, setIntervalMinutes] = useState(initialSettings.intervalMinutes);
  const [syncTypes, setSyncTypes] = useState<ScheduledSyncType[]>(initialSettings.syncTypes);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("Cấu hình lịch sync đã sẵn sàng.");

  async function saveSettings() {
    setSaving(true);
    setMessage("Đang lưu lịch đồng bộ...");

    try {
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, intervalMinutes, syncTypes })
      });
      const data = (await response.json()) as { message?: string };
      setMessage(data.message ?? "Đã lưu lịch đồng bộ.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể lưu lịch đồng bộ.");
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    setRunning(true);
    setMessage("Đang chạy sync theo lịch hiện tại...");

    try {
      await saveSettings();
      const response = await fetch("/api/schedule/run", { method: "POST" });
      const data = (await response.json()) as { message?: string };
      setMessage(data.message ?? "Đã chạy sync theo lịch.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể chạy sync.");
    } finally {
      setRunning(false);
    }
  }

  function toggleSyncType(syncType: ScheduledSyncType) {
    setSyncTypes((current) =>
      current.includes(syncType) ? current.filter((item) => item !== syncType) : [...current, syncType]
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cấu hình lịch</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <label className="flex items-center gap-3 rounded-md border border-slate-200 p-3 text-sm">
          <input checked={enabled} onChange={(event) => setEnabled(event.target.checked)} type="checkbox" />
          <span className="font-medium">Bật đồng bộ tự động</span>
        </label>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700" htmlFor="intervalMinutes">
            Chu kỳ
          </label>
          <select
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400"
            id="intervalMinutes"
            onChange={(event) => setIntervalMinutes(Number(event.target.value))}
            value={intervalMinutes}
          >
            {intervalOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium text-slate-700">Dữ liệu cần sync</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {syncTypeOptions.map((option) => (
              <label key={option.value} className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm">
                <input
                  checked={syncTypes.includes(option.value)}
                  onChange={() => toggleSyncType(option.value)}
                  type="checkbox"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button disabled={saving || running} onClick={saveSettings}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Lưu lịch
          </Button>
          <Button disabled={saving || running} onClick={runNow} variant="secondary">
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Chạy thử ngay
          </Button>
        </div>

        <div className="text-xs text-slate-500">
          Lần chạy tự động gần nhất: {initialSettings.lastRunAt ? formatDateTime(initialSettings.lastRunAt) : "Chưa có"}
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
