"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, AlertCircle, ArrowRight, X } from "lucide-react";
import type { InternalSessionStatus } from "@/lib/kiotviet/internal-session";

export function TokenExpiryBanner({ role }: { role?: "ADMIN" | "MEMBER" }) {
  const [status, setStatus] = useState<InternalSessionStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function checkStatus() {
      try {
        const response = await fetch("/api/settings/internal-session", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as InternalSessionStatus;
        if (!isMounted) return;

        setStatus(data);

        // Kiểm tra xem người dùng đã đóng cảnh báo cho phiên này chưa
        if (data.expiresAt) {
          const dismissedAt = sessionStorage.getItem("dismissed_kiotviet_token_alert");
          if (dismissedAt === data.expiresAt && data.statusLevel !== "EXPIRED") {
            setDismissed(true);
          }
        }
      } catch {
        // Lỗi mạng hoặc server không khả dụng, không block UI
      }
    }

    checkStatus();

    // Định kỳ 15 phút kiểm tra lại 1 lần
    const timer = setInterval(checkStatus, 15 * 60 * 1000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  if (!status || dismissed) return null;
  if (status.statusLevel === "OK") return null;

  const isExpired = status.statusLevel === "EXPIRED" || status.statusLevel === "MISSING";
  const isWarning = status.statusLevel === "WARNING";

  if (!isExpired && !isWarning) return null;

  const handleDismiss = () => {
    setDismissed(true);
    if (status.expiresAt) {
      sessionStorage.setItem("dismissed_kiotviet_token_alert", status.expiresAt);
    }
  };

  return (
    <aside
      aria-label="Cảnh báo phiên KiotViet"
      className={`relative w-full z-30 transition-all border-b shadow-xs ${
        isExpired
          ? "bg-rose-600 text-white border-rose-700"
          : "bg-amber-500/15 border-amber-300 text-amber-950 dark:bg-amber-950/40 dark:border-amber-700/60 dark:text-amber-200"
      }`}
    >
      <div className="max-w-(--breakpoint-2xl) mx-auto px-4 py-2.5 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {isExpired ? (
            <AlertCircle className="w-5 h-5 shrink-0 text-white animate-pulse" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" />
          )}

          <div className="leading-snug text-xs sm:text-sm">
            {isExpired ? (
              <span>
                <strong className="font-semibold uppercase tracking-wide">Cảnh báo:</strong> Phiên
                quản trị KiotViet{" "}
                {status.username ? (
                  <>
                    (tài khoản <strong>{status.username}</strong>)
                  </>
                ) : null}{" "}
                <strong>đã hết hạn</strong>
                {status.expiresAtFormatted ? ` vào ${status.expiresAtFormatted}` : ""}. Đồng bộ Xuất
                dùng nội bộ & Xuất hủy đang tạm dừng.
              </span>
            ) : (
              <span>
                <strong className="font-semibold">Lưu ý:</strong> Phiên quản trị KiotViet{" "}
                {status.username ? (
                  <>
                    (tài khoản <strong>{status.username}</strong>)
                  </>
                ) : null}{" "}
                chỉ còn{" "}
                <strong className="underline underline-offset-2">
                  {status.daysRemaining} ngày {status.hoursRemaining} giờ
                </strong>{" "}
                sẽ hết hạn (Hạn chót: {status.expiresAtFormatted}).
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {role === "ADMIN" ? (
            <Link
              href="/settings/sync#kiotviet-session"
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold shadow-xs transition-colors ${
                isExpired
                  ? "bg-white text-rose-700 hover:bg-rose-50"
                  : "bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400"
              }`}
            >
              Cập nhật token ngay
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <span
              className={`text-xs italic ${
                isExpired ? "text-rose-100" : "text-amber-800 dark:text-amber-300"
              }`}
            >
              Vui lòng báo Admin gia hạn
            </span>
          )}

          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Đóng cảnh báo"
            className={`p-1 rounded-md transition-colors ${
              isExpired
                ? "text-white/80 hover:text-white hover:bg-rose-700/50"
                : "text-amber-700 hover:text-amber-950 hover:bg-amber-200/50 dark:text-amber-300 dark:hover:text-white dark:hover:bg-amber-800/50"
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
