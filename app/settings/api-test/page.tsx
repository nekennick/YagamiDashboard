import { ApiTestPanel } from "@/app/settings/api-test/panel";
import { AnimatedPanel, FadeIn } from "@/components/ui/motion-primitives";

export default function ApiTestPage() {
  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-semibold">Cài đặt API</h1>
        <p className="mt-2 text-sm text-slate-600">
          Kiểm tra kết nối KiotViet trước. Giai đoạn này chỉ đọc API, chưa lưu database.
        </p>
      </FadeIn>

      <AnimatedPanel delay={0.04}>
        <ApiTestPanel />
      </AnimatedPanel>
    </div>
  );
}
