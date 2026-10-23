import { NextRequest, NextResponse } from "next/server";
import { readSessionToken, sessionCookieName, sessionCookieOptions } from "@/lib/auth/session";
import { DEFAULT_MEMBER_TABS, memberTabsCookieName } from "@/lib/auth/permissions-constants";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) return NextResponse.next();

  const rawToken = request.cookies.get(sessionCookieName)?.value;
  const session = await readSessionToken(rawToken);
  if (!session) return denyUnauthenticated(request);
  if (session.role === "ADMIN") return allowRequest(request, rawToken);

  // Chặn tuyệt đối các khu vực Quản trị đối với Member
  if (pathname.startsWith("/settings/users") || pathname.startsWith("/api/admin/")) {
    return denyForbidden(request, "/order-schedule");
  }

  // Các phân hệ có cơ chế kiểm tra quyền riêng theo từng tài khoản (user-level authorization)
  if (pathname === "/inventory-count" || pathname.startsWith("/inventory-count/") || pathname.startsWith("/api/inventory-count/")) {
    return allowRequest(request, rawToken);
  }

  if (
    pathname === "/purchase-orders" ||
    pathname.startsWith("/purchase-orders/") ||
    pathname.startsWith("/api/purchase-orders") ||
    pathname.startsWith("/api/suppliers") ||
    pathname === "/api/settings/print-template"
  ) {
    return allowRequest(request, rawToken);
  }

  const allowedSet = getMemberAllowedPages(request);
  const fallbackPath = getFirstAllowedPage(allowedSet);

  // 1. Kiểm tra trang trực tiếp hoặc trang con
  if (isPathAllowedForMember(pathname, allowedSet)) {
    return allowRequest(request, rawToken);
  }

  // 2. Kiểm tra API liên quan đến các tab được cấp quyền
  if (isMemberApiAllowed(pathname, allowedSet)) {
    return allowRequest(request, rawToken);
  }

  // 3. Nếu Member vào root "/" mà không có quyền vào Dashboard
  if (pathname === "/") {
    return NextResponse.redirect(new URL(fallbackPath, request.url));
  }

  return denyForbidden(request, fallbackPath);
}

function allowRequest(request: NextRequest, rawToken?: string) {
  const response = NextResponse.next();
  // Nếu là truy cập trang giao diện (không phải API), gia hạn cookie để trình duyệt luôn duy trì đăng nhập
  if (rawToken && !request.nextUrl.pathname.startsWith("/api/")) {
    response.cookies.set(sessionCookieName, rawToken, sessionCookieOptions);
  }
  return response;
}

function getMemberAllowedPages(request: NextRequest): Set<string> {
  const cookieValue = request.cookies.get(memberTabsCookieName)?.value;
  if (cookieValue) {
    try {
      const parsed = JSON.parse(decodeURIComponent(cookieValue));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return new Set(parsed);
      }
    } catch {
      // Fallback nếu parse cookie thất bại
    }
  }
  return new Set(DEFAULT_MEMBER_TABS);
}

function getFirstAllowedPage(allowedSet: Set<string>): string {
  for (const page of allowedSet) {
    if (page !== "/") return page;
  }
  if (allowedSet.has("/")) return "/";
  return "/order-schedule";
}

function isPathAllowedForMember(pathname: string, allowedSet: Set<string>): boolean {
  if (allowedSet.has(pathname)) return true;
  for (const page of allowedSet) {
    if (page !== "/" && pathname.startsWith(`${page}/`)) {
      return true;
    }
  }
  return false;
}

function isMemberApiAllowed(pathname: string, allowedSet: Set<string>): boolean {
  // Cho phép lấy thông tin cập nhật hệ thống
  if (pathname === "/api/changelog") return true;

  // API phân hệ Nhập hàng
  if (
    pathname.startsWith("/api/purchase-orders") ||
    pathname.startsWith("/api/suppliers") ||
    pathname === "/api/settings/print-template"
  ) {
    return true;
  }

  // API cập nhật số kiểm tồn hàng ngày luôn mở cho thành viên có quyền kiểm tồn
  if (/^\/api\/products\/[^/]+\/daily-inventory(?:\/[^/]+)?$/.test(pathname)) {
    return allowedSet.has("/stocktake") || allowedSet.has("/inventory");
  }

  // API nhóm tồn kho
  if (pathname.startsWith("/api/inventory-groups") || pathname.startsWith("/api/inventory/")) {
    return allowedSet.has("/inventory") || allowedSet.has("/stocktake");
  }

  // API danh mục chi nhánh
  if (pathname.startsWith("/api/branch-directory")) {
    return allowedSet.has("/settings/branches") || allowedSet.has("/purchase-orders");
  }

  // API xuất Excel tương ứng từng trang
  if (pathname === "/api/export/products") return allowedSet.has("/products");
  if (pathname === "/api/export/inventory") return allowedSet.has("/inventory");
  if (pathname === "/api/export/invoices") return allowedSet.has("/");
  if (pathname === "/api/export/customers") return allowedSet.has("/");
  if (pathname.startsWith("/api/export/analytics/product-frequency")) return allowedSet.has("/analytics/product-frequency");

  return false;
}

function denyUnauthenticated(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ message: "Bạn cần đăng nhập." }, { status: 401 });
  }
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

function denyForbidden(request: NextRequest, fallbackPath: string) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ message: "Bạn không có quyền truy cập chức năng này." }, { status: 403 });
  }
  return NextResponse.redirect(new URL(fallbackPath, request.url));
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
