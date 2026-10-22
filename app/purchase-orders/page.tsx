import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { PurchaseOrdersClient } from "@/components/purchase/purchase-orders-client";
import { DEFAULT_PRINT_SETTINGS } from "@/components/purchase/purchase-order-print";

export const dynamic = "force-dynamic";

export default async function PurchaseOrdersPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }

  // Phân quyền: Chỉ ADMIN / Quản lý được phép truy cập
  if (session.role !== "ADMIN") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50/50 p-8 max-w-md dark:border-red-900/50 dark:bg-red-950/20">
          <h2 className="text-lg font-bold text-red-900 dark:text-red-400">
            Truy cập bị giới hạn
          </h2>
          <p className="mt-2 text-xs text-red-700 dark:text-red-300 leading-relaxed">
            Phân hệ Nhập hàng chỉ dành riêng cho tài khoản Quản lý (Admin). Vui lòng liên hệ quản trị viên nếu bạn cần cấp quyền.
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
