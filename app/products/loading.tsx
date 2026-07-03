import { PageLoading } from "@/components/ui/page-loading";

export default function ProductsLoading() {
  return <PageLoading title="Đang tải sản phẩm" description="Đang lấy 20 sản phẩm phù hợp." columns={8} rows={6} />;
}
