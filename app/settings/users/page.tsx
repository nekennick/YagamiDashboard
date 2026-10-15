import { UserManagement } from "@/app/settings/users/user-management";
import { prisma } from "@/lib/prisma";

export default async function UsersPage() {
  const users = await prisma.user.findMany({ orderBy: [{ role: "asc" }, { username: "asc" }], select: { id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true } });
  return <div className="space-y-6"><div><p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Quản trị hệ thống</p><h1 className="mt-2 text-2xl font-semibold text-slate-950">User và phân quyền</h1><p className="mt-2 text-sm text-slate-600">Quản lý tài khoản và quyền truy cập Dashboard.</p></div><UserManagement initialUsers={users.map((user) => ({ ...user, createdAt: user.createdAt.toISOString() }))} /></div>;
}
