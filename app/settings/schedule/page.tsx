import { DatabaseUnavailable, isDatabaseConnectionError } from "@/components/layout/database-unavailable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedPanel, AnimatedTableRow, FadeIn } from "@/components/ui/motion-primitives";
import { getScheduleSettings } from "@/lib/schedule";
import { prisma } from "@/lib/prisma";
import { SchedulePanel } from "@/app/settings/schedule/panel";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  try {
    const [settings, recentLogs] = await Promise.all([
      getScheduleSettings(),
      prisma.syncLog.findMany({
        orderBy: { startedAt: "desc" },
        take: 8
      })
    ]);

    return (
      <div className="space-y-6">
        <FadeIn>
          <h1 className="text-2xl font-semibold tracking-normal">Lịch đồng bộ tự động</h1>
          <p className="mt-2 text-sm text-slate-600">
            Bật lịch sync local khi app đang chạy, chọn chu kỳ và nhóm dữ liệu cần đồng bộ.
          </p>
        </FadeIn>

        <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
          <AnimatedPanel delay={0.04}>
            <SchedulePanel initialSettings={settings} />
          </AnimatedPanel>

          <AnimatedPanel delay={0.08}>
            <Card className="shadow-sm transition-shadow duration-200 hover:shadow-md">
              <CardHeader>
                <CardTitle>Sync gần đây</CardTitle>
              </CardHeader>
              <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left">
                      <th className="px-3 py-2 font-medium">Loại</th>
                      <th className="px-3 py-2 font-medium">Trạng thái</th>
                      <th className="px-3 py-2 text-right font-medium">Bản ghi</th>
                      <th className="px-3 py-2 font-medium">Bắt đầu</th>
                      <th className="px-3 py-2 font-medium">Kết thúc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLogs.length === 0 ? (
                      <tr>
                        <td className="px-3 py-8 text-center text-slate-500" colSpan={5}>
                          Chưa có log đồng bộ.
                        </td>
                      </tr>
                    ) : (
                      recentLogs.map((log, index) => (
                        <AnimatedTableRow
                          key={log.id}
                          className="border-b last:border-0"
                          delay={Math.min(index, 12) * 0.015}
                        >
                          <td className="px-3 py-2">{syncTypeLabel(log.syncType)}</td>
                          <td className="px-3 py-2">{statusLabel(log.status)}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(log.totalRecords)}</td>
                          <td className="px-3 py-2">{formatDateTime(log.startedAt)}</td>
                          <td className="px-3 py-2">{formatDateTime(log.finishedAt)}</td>
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

function syncTypeLabel(syncType: string) {
  const labels: Record<string, string> = {
    branches: "Chi nhánh",
    products: "Sản phẩm",
    customers: "Khách hàng",
    invoices: "Hóa đơn 30 ngày",
    invoiceHistory: "Lịch sử hóa đơn",
    inventory: "Tồn kho"
  };

  return labels[syncType] ?? syncType;
}

function statusLabel(status: string) {
  if (status === "success") {
    return "Thành công";
  }

  if (status === "running") {
    return "Đang chạy";
  }

  return "Lỗi";
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
