import { PageLoading } from "@/components/ui/page-loading";

export default function InventoryLoading() {
  return <PageLoading title="Đang tải tồn kho" description="Đang lấy 20 dòng tồn kho mới nhất." columns={8} rows={6} />;
}
