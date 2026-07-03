import { PageLoading } from "@/components/ui/page-loading";

export default function ProductFrequencyLoading() {
  return <PageLoading title="Đang tải phân tích sản phẩm" description="Đang tổng hợp sản phẩm bán ra." columns={7} rows={6} />;
}
