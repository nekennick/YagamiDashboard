import { ApiTestPanel } from "@/app/settings/api-test/panel";

export default function ApiTestPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Cài đặt API</h1>
        <p className="mt-2 text-sm text-slate-600">
          Kiểm tra kết nối KiotViet trước. Giai đoạn này chỉ đọc API, chưa lưu database.
        </p>
      </div>

      <ApiTestPanel />
    </div>
  );
}
