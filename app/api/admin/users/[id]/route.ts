import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const userId = Number(id);
    if (!Number.isInteger(userId)) return NextResponse.json({ message: "User không hợp lệ." }, { status: 400 });
    const body = await request.json() as { displayName?: string; password?: string; isActive?: boolean };
    const data: { displayName?: string; passwordHash?: string; isActive?: boolean } = {};
    if (body.displayName !== undefined) {
      const displayName = body.displayName.trim();
      if (!displayName) return NextResponse.json({ message: "Tên hiển thị không được để trống." }, { status: 400 });
      data.displayName = displayName;
    }
    if (body.password !== undefined) {
      if (body.password.length < 6) return NextResponse.json({ message: "Mật khẩu cần ít nhất 6 ký tự." }, { status: 400 });
      data.passwordHash = await hashPassword(body.password);
    }
    if (body.isActive !== undefined) data.isActive = body.isActive;
    const user = await prisma.user.update({ where: { id: userId }, data, select: { id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true, updatedAt: true } });
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ message: "Không thể cập nhật user." }, { status: 400 });
  }
}
