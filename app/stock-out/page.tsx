import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { StockOutOrdersClient } from "@/components/stock-out/stock-out-orders-client";

export const dynamic = "force-dynamic";

export default async function StockOutOrdersPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }

  const [branches, products] = await Promise.all([
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
    })
  ]);

  const serializedProducts = products.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    unit: p.unit,
    basePrice: p.basePrice ? Number(p.basePrice) : 0
  }));

  return (
    <StockOutOrdersClient
      initialBranches={branches}
      initialProducts={serializedProducts}
    />
  );
}
