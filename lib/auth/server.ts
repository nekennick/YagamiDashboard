import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { readSessionToken, sessionCookieName } from "@/lib/auth/session";

export async function getCurrentSession() {
  const cookieStore = await cookies();
  return readSessionToken(cookieStore.get(sessionCookieName)?.value);
}

export async function ensureInitialAdmin() {
  const password = process.env.AUTH_INITIAL_ADMIN_PASSWORD;
  if (!password || password.length < 6) throw new Error("AUTH_INITIAL_ADMIN_PASSWORD phải có ít nhất 6 ký tự.");
  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: { username: "admin", displayName: "Quản trị viên", passwordHash: await hashPassword(password), role: "ADMIN" }
  });
}
