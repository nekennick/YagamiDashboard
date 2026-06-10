import { SyncPanel } from "@/app/settings/sync/panel";
import { AnimatedPanel, FadeIn } from "@/components/ui/motion-primitives";

export default function SyncPage() {
  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-semibold">Đồng bộ dữ liệu</h1>
        <p className="mt-2 text-sm text-slate-600">
          Đồng bộ thủ công từ KiotViet về PostgreSQL local. Nên đồng bộ chi nhánh, sản phẩm, khách hàng trước khi đồng bộ
          hóa đơn và tồn kho.
        </p>
      </FadeIn>

      <AnimatedPanel delay={0.04}>
        <SyncPanel />
      </AnimatedPanel>
    </div>
  );
}
