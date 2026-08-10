import { PageLoading } from "@/components/ui/page-loading";

export default function Loading() {
  return <PageLoading columns={5} description="Đang đối chiếu khách hàng mới với danh mục chi nhánh..." metricCount={3} title="Danh mục chi nhánh" />;
}
