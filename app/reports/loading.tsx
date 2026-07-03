import { PageLoading } from "@/components/ui/page-loading";

export default function ReportsLoading() {
  return <PageLoading title="Đang tải báo cáo nhanh" description="Đang đọc snapshot báo cáo." columns={6} rows={5} />;
}
