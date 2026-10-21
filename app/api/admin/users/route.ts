import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { username: "asc" }],
    select: { id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true, updatedAt: true, countPermissions: { select: { permission: true } } }
  });
  return NextResponse.json({ users: users.map((user) => ({ ...user, countPermissions: user.countPermissions.map((item) => item.permission) })) });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { username?: string; displayName?: string; password?: string; role?: "ADMIN" | "MEMBER"; countPermissions?: Array<"COUNT_EXECUTE" | "COUNT_MANAGE" | "COUNT_BALANCE"> };
    const username = body.username?.trim().toLowerCase();
    const displayName = body.displayName?.trim();
    const password = body.password ?? "";
    const role = body.role === "ADMIN" ? "ADMIN" : "MEMBER";
    if (!username || !/^[a-z0-9._-]{3,40}$/.test(username)) return NextResponse.json({ message: "Tên đăng nhập gồm 3–40 ký tự: chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang." }, { status: 400 });
    if (!displayName) return NextResponse.json({ message: "Nhập tên hiển thị." }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ message: "Mật khẩu cần ít nhất 6 ký tự." }, { status: 400 });
    const permissions = [...new Set((body.countPermissions ?? []).filter((value) => ["COUNT_EXECUTE", "COUNT_MANAGE", "COUNT_BALANCE"].includes(value)))];
    const user = await prisma.user.create({ data: { username, displayName, passwordHash: await hashPassword(password), role, countPermissions: role === "ADMIN" ? undefined : { create: permissions.map((permission) => ({ permission })) } }, include: { countPermissions: { select: { permission: true } } } });
    return NextResponse.json({ user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, isActive: user.isActive, countPermissions: user.countPermissions.map((item) => item.permission) } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("Unique constraint") ? "Tên đăng nhập đã tồn tại." : "Không thể tạo user.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
