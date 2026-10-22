import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { PurchaseOrdersClient } from "@/components/purchase/purchase-orders-client";
import { DEFAULT_PRINT_SETTINGS } from "@/components/purchase/purchase-order-print";

import { canUserPurchase } from "@/lib/auth/purchase-permissions";

export const dynamic = "force-dynamic";

export default async function PurchaseOrdersPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }

  // Phân quyền: ADMIN hoặc User thường được cấp quyền Nhập kho
  const hasPermission = await canUserPurchase(session.sub, session.role);
  if (!hasPermission) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center p-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-8 max-w-md dark:border-amber-900/50 dark:bg-amber-950/20">
          <h2 className="text-lg font-bold text-amber-900 dark:text-amber-400">
            Truy cập bị giới hạn
          </h2>
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
            Bạn chưa được cấp quyền Nhập kho. Vui lòng liên hệ Quản trị viên để được cấp quyền trong Cài đặt tài khoản.
          </p>
        </div>
      </div>
    );
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
        categoryName: true,
        rawJson: true
      }
    }),
    prisma.appSetting.findUnique({
      where: { key: "PRINT_TEMPLATE_PURCHASE_ORDER" }
    })
  ]);

  const parsedPrintConfig = printSetting?.value
    ? { ...DEFAULT_PRINT_SETTINGS, ...JSON.parse(printSetting.value) }
    : DEFAULT_PRINT_SETTINGS;

  const serializedProducts = products
    .filter((p) => {
      try {
        const raw = JSON.parse(p.rawJson || "{}");
        // KiotViet product type:
        // 1: Hàng combo / đóng gói (không nhập kho)
        // 3: Dịch vụ (không nhập kho)
        if (raw.type === 1 || raw.type === 3) {
          return false;
        }
      } catch {
        // Bỏ qua lỗi parse, giữ lại sản phẩm
      }
      return true;
    })
    .map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      unit: p.unit,
      categoryName: p.categoryName,
      basePrice: p.basePrice ? Number(p.basePrice) : 0
    }));

  return (
    <PurchaseOrdersClient
      initialBranches={branches}
      initialProducts={serializedProducts}
      initialPrintConfig={parsedPrintConfig}
    />
  );
}
