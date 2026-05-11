import { SyncPanel } from "@/app/settings/sync/panel";

export default function SyncPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Đồng bộ dữ liệu</h1>
        <p className="mt-2 text-sm text-slate-600">
          Đồng bộ thủ công từ KiotViet về SQLite local. Nên đồng bộ chi nhánh, sản phẩm, khách hàng trước khi đồng bộ
          hóa đơn và tồn kho.
        </p>
      </div>

      <SyncPanel />
    </div>
  );
}
