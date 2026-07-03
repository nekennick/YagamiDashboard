import { PageLoading } from "@/components/ui/page-loading";

export default function CustomersLoading() {
  return <PageLoading title="Đang tải khách hàng" description="Đang lấy 20 khách hàng phù hợp." columns={7} rows={6} />;
}
