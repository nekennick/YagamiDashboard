import { prisma } from "@/lib/prisma";

/**
 * Kiểm tra xem người dùng có quyền truy cập và thao tác trên phân hệ Nhập hàng hay không.
 * - Quản trị viên (ADMIN): luôn có toàn quyền.
 * - User thường (MEMBER): phải đang kích hoạt (isActive = true) và được cấp quyền (canPurchaseOrder = true).
 */
export async function canUserPurchase(userId: number, role: string): Promise<boolean> {
  if (role === "ADMIN") return true;
  if (!userId) return false;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { canPurchaseOrder: true, isActive: true }
  });

  return Boolean(user?.isActive && user?.canPurchaseOrder);
}
