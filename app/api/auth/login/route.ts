import { NextRequest, NextResponse } from "next/server";
import { ensureInitialAdmin } from "@/lib/auth/server";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, sessionCookieName, sessionCookieOptions } from "@/lib/auth/session";
import { getMemberAllowedTabs, memberTabsCookieName } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { username?: string; password?: string };
    const username = body.username?.trim().toLowerCase();
    const password = body.password ?? "";
    if (!username || !password) return NextResponse.json({ message: "Nhập tên đăng nhập và mật khẩu." }, { status: 400 });

    await ensureInitialAdmin();
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ message: "Tên đăng nhập hoặc mật khẩu không đúng." }, { status: 401 });
    }

    const token = await createSessionToken({ sub: user.id, username: user.username, displayName: user.displayName, role: user.role });
    const response = NextResponse.json({ user: { username: user.username, displayName: user.displayName, role: user.role } });
    response.cookies.set(sessionCookieName, token, sessionCookieOptions);

    // Lưu cookie phân quyền cho Member để middleware đọc nhanh
    const memberAllowedTabs = await getMemberAllowedTabs();
    response.cookies.set(memberTabsCookieName, encodeURIComponent(JSON.stringify(memberAllowedTabs)), {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể đăng nhập.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
