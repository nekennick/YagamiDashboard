import { PageLoading } from "@/components/ui/page-loading";

export default function ProductBranchMonthlyLoading() {
  return <PageLoading title="Đang tải sản phẩm theo chi nhánh" description="Đang tổng hợp theo tháng và chi nhánh." columns={8} rows={6} />;
}
