import { InventoryCountPermission, UserRole } from "@prisma/client";
import { getCurrentSession } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";

export const inventoryCountPermissions = [
  "COUNT_EXECUTE",
  "COUNT_MANAGE",
  "COUNT_BALANCE"
] as const satisfies readonly InventoryCountPermission[];

export type InventoryCountPermissionName = (typeof inventoryCountPermissions)[number];

export class InventoryCountAccessError extends Error {
  constructor(message: string, readonly status = 403) {
    super(message);
  }
}

export async function getInventoryCountPermissions(userId: number, role: UserRole): Promise<InventoryCountPermissionName[]> {
  if (role === "ADMIN") return [...inventoryCountPermissions];
  const rows = await prisma.userPermission.findMany({ where: { userId }, select: { permission: true } });
  return rows.map((row) => row.permission) as InventoryCountPermissionName[];
}

export async function requireInventoryCountPermission(permission: InventoryCountPermissionName) {
  const session = await getCurrentSession();
  if (!session) throw new InventoryCountAccessError("Bạn cần đăng nhập.", 401);
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { id: true, role: true, isActive: true } });
  if (!user?.isActive) throw new InventoryCountAccessError("Tài khoản không còn hoạt động.", 403);
  if (user.role === "ADMIN") return { ...session, permissions: [...inventoryCountPermissions] };
  const permissions = await getInventoryCountPermissions(user.id, user.role);
  if (!permissions.includes(permission)) throw new InventoryCountAccessError("Bạn không có quyền thực hiện thao tác Kiểm kho này.", 403);
  return { ...session, permissions };
}

export async function getInventoryCountActor() {
  const session = await getCurrentSession();
  if (!session) throw new InventoryCountAccessError("Bạn cần đăng nhập.", 401);
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { id: true, role: true, isActive: true } });
  if (!user?.isActive) throw new InventoryCountAccessError("Tài khoản không còn hoạt động.", 403);
  return { ...session, permissions: await getInventoryCountPermissions(user.id, user.role) };
}

export function canManageInventoryCount(permissions: readonly InventoryCountPermissionName[]) {
  return permissions.includes("COUNT_MANAGE") || permissions.includes("COUNT_BALANCE");
}
