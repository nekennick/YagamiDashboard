"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SyncType = "products" | "customers" | "branches" | "invoices" | "invoiceHistory" | "inventory" | "all";

type SyncResult = {
  syncType: SyncType;
  status: "success" | "error";
  totalRecords: number;
  savedRecords: number;
  message: string;
};

const syncActions: Array<{ syncType: SyncType; label: string }> = [
  { syncType: "branches", label: "Đồng bộ chi nhánh" },
  { syncType: "products", label: "Đồng bộ sản phẩm" },
  { syncType: "customers", label: "Đồng bộ khách hàng" },
  { syncType: "invoices", label: "Đồng bộ hóa đơn 30 ngày" },
  { syncType: "invoiceHistory", label: "Đồng bộ lịch sử hóa đơn" },
  { syncType: "inventory", label: "Đồng bộ tồn kho" },
  { syncType: "all", label: "Đồng bộ tất cả" }
];

const syncTypeLabels: Record<SyncType, string> = {
  branches: "Chi nhánh",
  products: "Sản phẩm",
  customers: "Khách hàng",
  invoices: "Hóa đơn 30 ngày",
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
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Lệnh đồng bộ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {syncActions.map((action) => (
            <Button
              key={action.syncType}
              className="w-full justify-start"
              disabled={loading !== null}
              onClick={() => runSync(action.syncType)}
              variant={action.syncType === "all" ? "default" : "secondary"}
            >
              {loading === action.syncType ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {action.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Log đồng bộ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</div>

          {results.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 p-6 text-sm text-slate-500">
              Kết quả đồng bộ sẽ hiển thị tại đây: tổng bản ghi, số bản ghi đã lưu, lỗi nếu có.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left">
                    <th className="px-3 py-2 font-medium">STT</th>
                    <th className="px-3 py-2 font-medium">Loại</th>
                    <th className="px-3 py-2 font-medium">Trạng thái</th>
                    <th className="px-3 py-2 font-medium">Tổng bản ghi</th>
                    <th className="px-3 py-2 font-medium">Đã lưu</th>
                    <th className="px-3 py-2 font-medium">Thông báo</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result, index) => (
                    <tr key={result.syncType} className="border-b">
                      <td className="px-3 py-2 text-slate-500">{index + 1}</td>
                      <td className="px-3 py-2">{syncTypeLabels[result.syncType]}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-2">
                          {result.status === "success" ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                          {result.status === "success" ? "Thành công" : "Lỗi"}
                        </span>
                      </td>
                      <td className="px-3 py-2">{result.totalRecords}</td>
                      <td className="px-3 py-2">{result.savedRecords}</td>
                      <td className="px-3 py-2">{result.message}</td>
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
