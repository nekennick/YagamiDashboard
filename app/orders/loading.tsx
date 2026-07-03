import { PageLoading } from "@/components/ui/page-loading";

export default function OrdersLoading() {
  return <PageLoading title="Đang tải đơn hàng" description="Đang lấy 50 đơn hàng gần nhất." columns={9} rows={6} />;
}
