import { ClipboardCheck, Search } from "lucide-react";
import { DatabaseUnavailable, isDatabaseConnectionError } from "@/components/layout/database-unavailable";
import { ProductDailyInventoryAnalysis } from "@/components/products/product-daily-inventory-analysis";
import { StocktakeProductOption, StocktakeProductSearch } from "@/components/products/stocktake-product-search";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type StocktakePageProps = { searchParams?: Promise<{ productId?: string; branchId?: string }> };

export default async function StocktakePage({ searchParams }: StocktakePageProps) {
  const params = (await searchParams) ?? {};
  const selectedProductId = positiveInteger(params.productId);
  const selectedBranchId = positiveInteger(params.branchId);

  try {
    const [products, branches, selectedProduct] = await Promise.all([
      prisma.product.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }], select: { id: true, code: true, name: true, categoryName: true, unit: true } }),
      prisma.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      selectedProductId ? prisma.product.findUnique({ where: { id: selectedProductId }, select: { id: true, code: true, name: true, categoryName: true, unit: true } }) : null
    ]);
    const selected = selectedProduct as StocktakeProductOption | null;

    return <div className="space-y-6">
      <div><div className="flex items-center gap-2 text-slate-950 dark:text-white"><ClipboardCheck className="h-6 w-6 text-indigo-600 dark:text-indigo-400" /><h1 className="text-2xl font-semibold tracking-normal">Kiểm tồn</h1></div><p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Chọn sản phẩm để đối soát nhập, xuất, tồn và số kiểm thực tế theo ngày.</p></div>
      <Card className="relative z-30"><CardContent className="p-5"><StocktakeProductSearch products={products} selectedProduct={selected} /></CardContent></Card>
      {selected ? <ProductDailyInventoryAnalysis branches={branches} productId={selected.id} initialBranchId={selectedBranchId ? String(selectedBranchId) : undefined} /> : <Card><CardContent className="flex min-h-72 flex-col items-center justify-center text-center"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300"><Search className="h-6 w-6" /></div><h2 className="mt-4 text-base font-semibold text-slate-900 dark:text-white">Chọn sản phẩm để bắt đầu kiểm tồn</h2><p className="mt-2 max-w-md text-sm text-slate-500">Tìm theo tên hoặc mã sản phẩm. Bảng kiểm tồn chỉ hiển thị sau khi anh chọn một sản phẩm.</p></CardContent></Card>}
    </div>;
  } catch (error) {
    if (isDatabaseConnectionError(error)) return <DatabaseUnavailable error={error} />;
    throw error;
  }
}

function positiveInteger(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
