import { readFile, writeFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";

export const APP_SETTING_SESSION_CURL_KEY = "KIOTVIET_INTERNAL_SESSION_CURL";

export type InternalSession = {
  baseUrl: string;
  headers: Record<string, string>;
};

export type SessionStatusLevel = "OK" | "WARNING" | "EXPIRED" | "MISSING";

export interface InternalSessionStatus {
  isValid: boolean;
  isExpired: boolean;
  statusLevel: SessionStatusLevel;
  expiresAt: string | null;
  expiresAtFormatted: string | null;
  daysRemaining: number | null;
  hoursRemaining: number | null;
  username: string | null;
  retailer: string | null;
  branchId: string | null;
  source: "DATABASE" | "FILE" | "NONE";
  message: string;
}

export interface DecodedKiotVietToken {
  sub?: number | string;
  iat?: number;
  exp?: number;
  preferred_username?: string;
  kvrcode?: string;
  kvbid?: number;
  [key: string]: unknown;
}

const allowedHeaderNames = new Set([
  "accept",
  "authorization",
  "branchid",
  "content-type",
  "fingerprintkey",
  "isusekvclient",
  "origin",
  "referer",
  "retailer",
  "x-group-id",
  "x-language",
  "x-retailer-code"
]);

export function decodeJwtPayload(token: string): DecodedKiotVietToken | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    return JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
  } catch {
    return null;
  }
}

export function isJwtExpired(token: string, marginMs: number = 60_000): boolean {
  try {
    const payload = decodeJwtPayload(token);
    if (!payload?.exp) return true;
    return payload.exp * 1000 < Date.now() + marginMs;
  } catch {
    return true;
  }
}

export function parseCurlSession(raw: string): { baseUrl: string; headers: Record<string, string>; token: string } | null {
  if (!raw || !raw.trim()) return null;

  const cleaned = raw.replace(/\^\r?\n/g, " ").replace(/\^/g, "").replace(/\\\r?\n/g, " ");

  const urlMatch = cleaned.match(/https:\/\/[^'"\s]+\.kiotviet\.(?:vn|com)/i);
  const baseUrl = urlMatch ? new URL(urlMatch[0]).origin : "https://api-man1.kiotviet.vn";

  const headers: Record<string, string> = {};
  for (const match of cleaned.matchAll(/-H\s+['"]([^:'"]+):\s*([^'"]*)['"]/gi)) {
    const name = match[1].trim().toLowerCase();
    if (allowedHeaderNames.has(name)) headers[name] = match[2].trim();
  }

  // Fallback nếu headers được paste dưới dạng Header-Name: Value
  if (Object.keys(headers).length === 0) {
    for (const line of cleaned.split(/\r?\n/)) {
      const parts = line.split(":");
      if (parts.length >= 2) {
        const name = parts[0].trim().toLowerCase();
        if (allowedHeaderNames.has(name)) {
          headers[name] = parts.slice(1).join(":").trim();
        }
      }
    }
  }

  // Tìm Authorization token
  let token = "";
  if (headers.authorization) {
    token = headers.authorization.replace(/^Bearer\s+/i, "").trim();
  } else {
    const tokenMatch = cleaned.match(/Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/i);
    if (tokenMatch) {
      token = tokenMatch[1].trim();
      headers.authorization = `Bearer ${token}`;
    }
  }

  if (!token) return null;

  return { baseUrl, headers, token };
}

function formatVietnamDate(date: Date): string {
  return date.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function calculateSessionStatus(token: string, source: "DATABASE" | "FILE"): InternalSessionStatus {
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.exp) {
    return {
      isValid: false,
      isExpired: true,
      statusLevel: "EXPIRED",
      expiresAt: null,
      expiresAtFormatted: null,
      daysRemaining: 0,
      hoursRemaining: 0,
      username: null,
      retailer: null,
      branchId: null,
      source,
      message: "Token KiotViet không hợp lệ hoặc thiếu thông tin thời hạn."
    };
  }

  const expiresAtMs = payload.exp * 1000;
  const expiresAtDate = new Date(expiresAtMs);
  const nowMs = Date.now();
  const diffMs = expiresAtMs - nowMs;
  const isExpired = diffMs <= 0;

  const totalHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
  const daysRemaining = Math.max(0, Math.floor(totalHours / 24));
  const hoursRemaining = Math.max(0, totalHours % 24);

  let statusLevel: SessionStatusLevel = "OK";
  let message = `Phiên KiotViet đang hoạt động bình thường (còn ${daysRemaining} ngày ${hoursRemaining} giờ).`;

  if (isExpired) {
    statusLevel = "EXPIRED";
    message = `Phiên KiotViet đã hết hạn vào lúc ${formatVietnamDate(expiresAtDate)}. Vui lòng cập nhật token mới.`;
  } else if (daysRemaining <= 3) {
    statusLevel = "WARNING";
    message = `Phiên KiotViet chỉ còn ${daysRemaining} ngày ${hoursRemaining} giờ sẽ hết hạn (Hạn: ${formatVietnamDate(expiresAtDate)}).`;
  }

  return {
    isValid: true,
    isExpired,
    statusLevel,
    expiresAt: expiresAtDate.toISOString(),
    expiresAtFormatted: formatVietnamDate(expiresAtDate),
    daysRemaining,
    hoursRemaining,
    username: payload.preferred_username ?? null,
    retailer: payload.kvrcode ?? null,
    branchId: payload.kvbid ? String(payload.kvbid) : null,
    source,
    message
  };
}

const candidateFilePaths = [
  process.env.KIOTVIET_INTERNAL_REQUEST_FILE,
  process.env.KIOTVIET_STOCKTAKE_WRITE_REQUEST_FILE,
  "/run/secrets/kiotviet_internal_requests",
  "/run/secrets/kiotviet_stocktake_write_requests",
  "secrets/stocktakes-request.txt",
  "secrets/stocktakes-write-requests.txt"
].filter((p): p is string => Boolean(p));

export async function getInternalSessionStatus(): Promise<InternalSessionStatus> {
  // 1. Kiểm tra cấu hình trong Database AppSetting trước
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: APP_SETTING_SESSION_CURL_KEY }
    });

    if (setting?.value) {
      const parsed = parseCurlSession(setting.value);
      if (parsed) {
        return calculateSessionStatus(parsed.token, "DATABASE");
      }
    }
  } catch (error) {
    console.warn("[InternalSession] Không thể đọc AppSetting từ database:", error);
  }

  // 2. Kiểm tra các file secret candidate
  const seenPaths = new Set<string>();
  let lastFoundToken: string | null = null;

  for (const path of candidateFilePaths) {
    if (seenPaths.has(path)) continue;
    seenPaths.add(path);
    try {
      const raw = await readFile(path, "utf8");
      const parsed = parseCurlSession(raw);
      if (parsed) {
        lastFoundToken = parsed.token;
        if (!isJwtExpired(parsed.token)) {
          return calculateSessionStatus(parsed.token, "FILE");
        }
      }
    } catch {
      continue;
    }
  }

  if (lastFoundToken) {
    return calculateSessionStatus(lastFoundToken, "FILE");
  }

  return {
    isValid: false,
    isExpired: true,
    statusLevel: "MISSING",
    expiresAt: null,
    expiresAtFormatted: null,
    daysRemaining: 0,
    hoursRemaining: 0,
    username: null,
    retailer: null,
    branchId: null,
    source: "NONE",
    message: "Chưa cấu hình phiên KiotViet (Xuất dùng nội bộ & Xuất hủy)."
  };
}

export async function loadInternalSession(): Promise<InternalSession> {
  // 1. Kiểm tra Database AppSetting trước
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: APP_SETTING_SESSION_CURL_KEY }
    });

    if (setting?.value) {
      const parsed = parseCurlSession(setting.value);
      if (parsed && !isJwtExpired(parsed.token)) {
        return { baseUrl: parsed.baseUrl, headers: parsed.headers };
      }
    }
  } catch (error) {
    console.warn("[InternalSession] Không thể đọc AppSetting từ database:", error);
  }

  // 2. Quét các file secret
  const seenPaths = new Set<string>();

  for (const path of candidateFilePaths) {
    if (seenPaths.has(path)) continue;
    seenPaths.add(path);
    try {
      const raw = await readFile(path, "utf8");
      const parsed = parseCurlSession(raw);
      if (parsed && !isJwtExpired(parsed.token)) {
        return { baseUrl: parsed.baseUrl, headers: parsed.headers };
      }
    } catch {
      continue;
    }
  }

  throw new Error("Phiên quản trị KiotViet đã hết hạn hoặc chưa được cấu hình. Vui lòng cập nhật token mới tại Cài đặt -> Đồng bộ.");
}

export async function updateInternalSessionSecret(rawCurl: string): Promise<InternalSessionStatus> {
  const parsed = parseCurlSession(rawCurl);
  if (!parsed) {
    throw new Error("Không nhận diện được lệnh cURL hoặc Authorization Bearer token hợp lệ.");
  }

  const payload = decodeJwtPayload(parsed.token);
  if (!payload || !payload.exp) {
    throw new Error("Token trong cURL không phải định dạng JWT KiotViet hợp lệ.");
  }

  const expiresAtMs = payload.exp * 1000;
  if (expiresAtMs <= Date.now()) {
    const formatted = formatVietnamDate(new Date(expiresAtMs));
    throw new Error(`Token này đã hết hạn từ ngày ${formatted}. Vui lòng đăng nhập lại KiotViet và copy cURL mới.`);
  }

  // 1. Lưu vào Database AppSetting
  await prisma.appSetting.upsert({
    where: { key: APP_SETTING_SESSION_CURL_KEY },
    create: {
      key: APP_SETTING_SESSION_CURL_KEY,
      value: rawCurl.trim()
    },
    update: {
      value: rawCurl.trim()
    }
  });

  // 2. Ghi best-effort vào các file secret có quyền ghi
  const writeTargetPaths = [
    process.env.KIOTVIET_INTERNAL_REQUEST_FILE,
    "/run/secrets/kiotviet_internal_requests",
    "secrets/stocktakes-request.txt"
  ].filter((p): p is string => Boolean(p));

  for (const path of writeTargetPaths) {
    try {
      await writeFile(path, rawCurl.trim(), "utf8");
    } catch {
      // Bỏ qua lỗi ghi file nếu chạy trong môi trường read-only secret
    }
  }

  return calculateSessionStatus(parsed.token, "DATABASE");
}

export async function testInternalSessionConnection(): Promise<{ success: boolean; message: string; details?: unknown }> {
  try {
    const session = await loadInternalSession();
    const testUrl = `${session.baseUrl}/api/stocktakes/list`;

    const response = await fetch(testUrl, {
      method: "POST",
      headers: {
        ...session.headers,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        format: "json",
        $top: 1,
        $skip: 0
      }),
      cache: "no-store"
    });

    if (response.status === 401 || response.status === 403) {
      return {
        success: false,
        message: `KiotViet từ chối truy cập (Mã lỗi ${response.status}). Token có thể đã bị đăng xuất hoặc không đủ quyền.`
      };
    }

    if (!response.ok) {
      return {
        success: false,
        message: `KiotViet trả về mã lỗi HTTP ${response.status} (${response.statusText}).`
      };
    }

    const data = await response.json().catch(() => null);
    return {
      success: true,
      message: "Kết nối thành công! Phiên quản trị KiotViet đang hoạt động tốt.",
      details: data
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Không thể kết nối đến máy chủ KiotViet."
    };
  }
}
