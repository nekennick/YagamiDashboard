import { SyncPanel } from "@/app/settings/sync/panel";
import { AnimatedPanel, FadeIn } from "@/components/ui/motion-primitives";

export default function SyncPage() {
  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">Đồng bộ dữ liệu</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
          Đồng bộ thủ công từ KiotViet về SQLite local. Nên đồng bộ chi nhánh, sản phẩm, khách hàng trước, sau đó đến
          hóa đơn 30 ngày và tồn kho. Với lượt sync lớn, hệ thống sẽ ghi theo lô nhỏ, retry khi SQLite bận và hiển thị
          cảnh báo để anh dễ theo dõi.
        </p>
      </FadeIn>

      <AnimatedPanel delay={0.04}>
        <SyncPanel />
      </AnimatedPanel>
    </div>
  );
}
