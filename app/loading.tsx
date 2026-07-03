import { PageLoading } from "@/components/ui/page-loading";

export default function DashboardLoading() {
  return <PageLoading title="Đang tải dashboard" description="Đang tổng hợp số liệu vận hành." columns={4} rows={5} />;
}
