import { PageLoading } from "@/components/ui/page-loading";

export default function InvoicesLoading() {
  return <PageLoading title="Đang tải hóa đơn" description="Đang lấy 20 hóa đơn gần nhất." columns={8} rows={6} />;
}
