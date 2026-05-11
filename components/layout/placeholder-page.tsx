import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PlaceholderPage({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">
          Màn hình này sẽ được build ở {phase}, sau khi các giai đoạn trước đã chạy ổn định.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Đang chờ đúng thứ tự roadmap</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-700">
          Hãy kiểm tra API KiotViet trước tại{" "}
          <Link className="font-medium text-slate-950 underline" href="/settings/api-test">
            Cài đặt API
          </Link>
          . Khi token, sản phẩm, khách hàng, hóa đơn và tồn kho đều thông, giai đoạn database và đồng bộ mới nên bắt
          đầu.
        </CardContent>
      </Card>
    </div>
  );
}
