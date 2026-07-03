import { PageLoading } from "@/components/ui/page-loading";

export default function CustomerFrequencyLoading() {
  return <PageLoading title="Đang tải phân tích khách hàng" description="Đang tổng hợp tần suất mua hàng." columns={7} rows={6} />;
}
