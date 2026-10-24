import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { StockOutOrdersClient } from "@/components/stock-out/stock-out-orders-client";
import { DEFAULT_STOCK_OUT_PRINT_SETTINGS } from "@/components/stock-out/stock-out-order-print";

export const dynamic = "force-dynamic";

export default async function StockOutOrdersPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }

  const [branches, products, printSetting] = await Promise.all([
    prisma.branch.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, address: true, kvBranchId: true }
    }),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        unit: true,
        basePrice: true,
        categoryName: true
      }
    }),
    prisma.appSetting.findUnique({
      where: { key: "PRINT_TEMPLATE_STOCK_OUT" }
    })
  ]);

  const serializedProducts = products.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    unit: p.unit,
    basePrice: p.basePrice ? Number(p.basePrice) : 0
  }));

  let initialPrintConfig = DEFAULT_STOCK_OUT_PRINT_SETTINGS;
  if (printSetting?.value) {
    try {
      initialPrintConfig = {
        ...DEFAULT_STOCK_OUT_PRINT_SETTINGS,
        ...JSON.parse(printSetting.value)
      };
    } catch (e) {
      console.error("Lỗi parse cấu hình in phiếu xuất kho:", e);
    }
  }

  return (
    <StockOutOrdersClient
      initialBranches={branches}
      initialProducts={serializedProducts}
      initialPrintConfig={initialPrintConfig}
    />
  );
}
