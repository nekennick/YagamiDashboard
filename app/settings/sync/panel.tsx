"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SyncType = "products" | "customers" | "branches" | "orders" | "invoices" | "invoiceHistory" | "inventory" | "all";

type SyncResult = {
  syncType: SyncType;
  status: "success" | "error";
  totalRecords: number;
  savedRecords: number;
  message: string;
  warnings?: string[];
};

const syncActions: Array<{ syncType: SyncType; label: string; hint: string }> = [
  { syncType: "branches", label: "Đồng bộ chi nhánh", hint: "Nhẹ, nên chạy trước dữ liệu khác." },
  { syncType: "products", label: "Đồng bộ sản phẩm", hint: "Cập nhật tên hàng, mã hàng và nhóm hàng." },
  { syncType: "customers", label: "Đồng bộ khách hàng", hint: "Cập nhật thông tin khách để nối hóa đơn." },
  { syncType: "orders", label: "Đồng bộ đơn đặt hàng", hint: "Cập nhật tăng dần, mặc định lùi 2 ngày để bắt đơn chỉnh sửa." },
  { syncType: "invoices", label: "Đồng bộ hóa đơn gần đây", hint: "Chỉ lấy phần mới + buffer, nhẹ hơn so với kéo lại 30 ngày." },
  { syncType: "invoiceHistory", label: "Đồng bộ lịch sử hóa đơn", hint: "Tác vụ nặng, nên chạy thủ công khi cần." },
  { syncType: "inventory", label: "Đồng bộ tồn kho", hint: "Lấy snapshot hiện tại, nên chạy sau cùng." },
  { syncType: "all", label: "Đồng bộ tất cả", hint: "Chạy theo thứ tự an toàn, bỏ lịch sử hóa đơn." }
];

const syncTypeLabels: Record<SyncType, string> = {
  branches: "Chi nhánh",
  products: "Sản phẩm",
  customers: "Khách hàng",
  orders: "Đơn đặt hàng",
  invoices: "Hóa đơn gần đây",
  invoiceHistory: "Lịch sử hóa đơn",
  inventory: "Tồn kho",
  all: "Tất cả"
};

export function SyncPanel() {
  const [loading, setLoading] = useState<SyncType | null>(null);
  const [results, setResults] = useState<SyncResult[]>([]);
  const [message, setMessage] = useState<string>("Chưa chạy đồng bộ.");

  async function runSync(syncType: SyncType) {
    setLoading(syncType);
    setMessage(`Đang đồng bộ ${syncTypeLabels[syncType].toLowerCase()}...`);

    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ syncType })
      });
      const data = (await response.json()) as { message: string; results: SyncResult[] };
      setResults(data.results);
      setMessage(data.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể chạy đồng bộ.");
      setResults([]);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Lệnh đồng bộ</CardTitle>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            SQLite đã được tối ưu ghi theo lô nhỏ và tự retry khi database bận.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {syncActions.map((action) => (
            <Button
              key={action.syncType}
              className="h-auto w-full justify-start px-4 py-3 text-left"
              disabled={loading !== null}
              onClick={() => runSync(action.syncType)}
              variant={action.syncType === "all" ? "default" : "secondary"}
            >
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center">
                  {loading === action.syncType ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {action.label}
                </span>
                <span className="mt-1 text-xs font-medium opacity-70">{action.hint}</span>
              </span>
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Log đồng bộ</CardTitle>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Nếu lượt sync lớn, hệ thống sẽ hiện cảnh báo để anh biết tác vụ có thể chậm hơn bình thường.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {message}
          </div>

          {results.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Kết quả đồng bộ sẽ hiển thị tại đây: tổng bản ghi, số bản ghi đã lưu, cảnh báo lượt lớn và lỗi nếu có.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="px-3 py-2 font-semibold">STT</th>
                    <th className="px-3 py-2 font-semibold">Loại</th>
                    <th className="px-3 py-2 font-semibold">Trạng thái</th>
                    <th className="px-3 py-2 text-right font-semibold">Tổng bản ghi</th>
                    <th className="px-3 py-2 text-right font-semibold">Đã lưu</th>
                    <th className="px-3 py-2 font-semibold">Thông báo</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result, index) => (
                    <tr key={result.syncType} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td className="px-3 py-3 text-slate-500 dark:text-slate-400">{index + 1}</td>
                      <td className="px-3 py-3 font-semibold text-slate-900 dark:text-white">
                        {syncTypeLabels[result.syncType]}
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-2">
                          {result.status === "success" ? (
                            <CheckCircle2 className="h-4 w-4 text-success-600 dark:text-success-400" />
                          ) : (
                            <XCircle className="h-4 w-4 text-error-600 dark:text-error-400" />
                          )}
                          {result.status === "success" ? "Thành công" : "Lỗi"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">{formatNumber(result.totalRecords)}</td>
                      <td className="px-3 py-3 text-right">{formatNumber(result.savedRecords)}</td>
                      <td className="px-3 py-3">
                        <div>{result.message}</div>
                        {result.warnings && result.warnings.length > 0 ? (
                          <div className="mt-2 space-y-1">
                            {result.warnings.map((warning) => (
                              <div
                                className="flex items-start gap-2 rounded-lg bg-warning-50 px-2 py-1.5 text-xs font-semibold text-warning-700 dark:bg-warning-950/50 dark:text-warning-300"
                                key={warning}
                              >
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span>{warning}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}
