import { NextRequest, NextResponse } from "next/server";
import { readSessionToken, sessionCookieName } from "@/lib/auth/session";

const memberPages = new Set(["/order-schedule", "/stocktake"]);
const memberApi = /^\/api\/products\/[^/]+\/daily-inventory(?:\/[^/]+)?$/;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) return NextResponse.next();

  const session = await readSessionToken(request.cookies.get(sessionCookieName)?.value);
  if (!session) return denyUnauthenticated(request);
  if (session.role === "ADMIN") return NextResponse.next();

  if (memberPages.has(pathname) || memberApi.test(pathname)) return NextResponse.next();
  if (pathname === "/") return NextResponse.redirect(new URL("/order-schedule", request.url));
  return denyForbidden(request);
}

function denyUnauthenticated(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ message: "Bạn cần đăng nhập." }, { status: 401 });
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

function denyForbidden(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ message: "Bạn không có quyền truy cập chức năng này." }, { status: 403 });
  return NextResponse.redirect(new URL("/order-schedule", request.url));
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
