"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type TestKind = "token" | "products" | "customers" | "invoices" | "orders" | "inventory";

type TestResult = {
  ok: boolean;
  status: number;
  message: string;
  totalRecords: number;
  preview: unknown[];
};

const tests: Array<{ kind: TestKind; label: string }> = [
  { kind: "token", label: "Kiểm tra Access Token" },
  { kind: "products", label: "Kiểm tra sản phẩm" },
  { kind: "customers", label: "Kiểm tra khách hàng" },
  { kind: "invoices", label: "Kiểm tra hóa đơn đã bán" },
  { kind: "orders", label: "Kiểm tra đơn đặt hàng" },
  { kind: "inventory", label: "Kiểm tra tồn kho" }
];

export function ApiTestPanel() {
  const [loading, setLoading] = useState<TestKind | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);

  async function runTest(kind: TestKind) {
    setLoading(kind);
    setResult(null);

    try {
      const response = await fetch("/api/kiotviet-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ kind })
      });
      const data = (await response.json()) as TestResult;
      setResult(data);
    } catch (error) {
      setResult({
        ok: false,
        status: 0,
        message: error instanceof Error ? error.message : "Không thể gọi API kiểm tra",
        totalRecords: 0,
        preview: []
      });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Lệnh kiểm tra</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tests.map((test) => (
            <Button
              key={test.kind}
              className="w-full justify-start"
              disabled={loading !== null}
              onClick={() => runTest(test.kind)}
              variant={test.kind === "token" ? "default" : "secondary"}
            >
              {loading === test.kind ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {test.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kết quả</CardTitle>
        </CardHeader>
        <CardContent>
          {!result ? (
            <div className="rounded-md border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Chọn một lệnh kiểm tra để xem HTTP status, lỗi nếu có, tổng bản ghi và JSON preview.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="inline-flex items-center gap-2 font-medium">
                  {result.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  {result.ok ? "Thành công" : "Thất bại"}
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">HTTP {result.status}</span>
                <span className="rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">
                  {result.totalRecords} bản ghi
                </span>
              </div>

              <div className="text-sm text-slate-700 dark:text-slate-300">{result.message}</div>

              <pre className="max-h-[520px] overflow-auto rounded-md bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
                {JSON.stringify(result.preview, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
