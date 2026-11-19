"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ExternalLink
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { InternalSessionStatus } from "@/lib/kiotviet/internal-session";

export function KiotvietSessionCard() {
  const [status, setStatus] = useState<InternalSessionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [curlInput, setCurlInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  async function fetchStatus() {
    try {
      setLoading(true);
      const res = await fetch("/api/settings/internal-session", { cache: "no-store" });
      if (!res.ok) throw new Error("Không thể tải thông tin phiên.");
      const data = (await res.json()) as InternalSessionStatus;
      setStatus(data);
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Lỗi khi lấy thông tin phiên KiotViet."
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStatus();
  }, []);

  async function handleUpdateSession(e: React.FormEvent) {
    e.preventDefault();
    if (!curlInput.trim()) {
      setFeedback({ type: "error", message: "Vui lòng dán lệnh cURL hoặc chuỗi Bearer token." });
      return;
    }

    try {
      setIsSubmitting(true);
      setFeedback(null);
      const res = await fetch("/api/settings/internal-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ curl: curlInput.trim() })
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.message || "Cập nhật phiên thất bại.");
      }

      setFeedback({
        type: "success",
        message: `${data.message} Hạn mới: ${data.status.expiresAtFormatted} (còn ${data.status.daysRemaining} ngày).`
      });
      setStatus(data.status);
      setCurlInput("");
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Lỗi khi cập nhật phiên KiotViet."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleTestConnection() {
    try {
      setIsTesting(true);
      setFeedback(null);
      const res = await fetch("/api/settings/internal-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" })
      });

      const data = await res.json();
      if (data.success) {
        setFeedback({
          type: "success",
          message: data.message || "Kết nối KiotViet thành công! Phiên đang hoạt động bình thường."
        });
      } else {
        setFeedback({
          type: "error",
          message: data.message || "Không thể kết nối đến KiotViet bằng phiên hiện tại."
        });
      }
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Lỗi kết nối mạng khi kiểm tra phiên."
      });
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <Card id="kiotviet-session" className="scroll-mt-6 border-slate-200/90 shadow-sm dark:border-slate-800">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Phiên quản trị KiotViet (Xuất dùng nội bộ & Xuất hủy)
            </CardTitle>
            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              Web Internal Session
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            KiotViet chưa mở API chính thức cho Xuất dùng & Xuất hủy; Dashboard sử dụng phiên web bảo mật để đồng bộ tự động.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {loading ? (
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang kiểm tra...
            </div>
          ) : status?.statusLevel === "OK" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Hoạt động tốt (còn {status.daysRemaining} ngày)
            </span>
          ) : status?.statusLevel === "WARNING" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              Sắp hết hạn (còn {status?.daysRemaining} ngày)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
              <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
              Đã hết hạn
            </span>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchStatus}
            disabled={loading}
            title="Làm mới trạng thái"
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Hộp trạng thái chi tiết */}
        {status ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800/80 dark:bg-slate-900/50">
              <span className="text-xs text-slate-500 dark:text-slate-400">Tài khoản KiotViet</span>
              <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                {status.username || "Chưa xác định"}
              </p>
              <span className="text-[11px] text-slate-400">Gian hàng: {status.retailer || "tongkhoyagami"}</span>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800/80 dark:bg-slate-900/50">
              <span className="text-xs text-slate-500 dark:text-slate-400">Hạn sử dụng phiên</span>
              <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                {status.expiresAtFormatted || "Chưa có token"}
              </p>
              <span className="text-[11px] text-slate-400">
                {status.isExpired
                  ? "Đã quá hạn sử dụng"
                  : `Còn lại ${status.daysRemaining} ngày ${status.hoursRemaining} giờ`}
              </span>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800/80 dark:bg-slate-900/50">
              <span className="text-xs text-slate-500 dark:text-slate-400">Nguồn lưu trữ</span>
              <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                {status.source === "DATABASE" ? "Cơ sở dữ liệu (Database)" : status.source === "FILE" ? "Tệp bí mật (Secret File)" : "Chưa lưu"}
              </p>
              <span className="text-[11px] text-slate-400">
                {status.source === "DATABASE" ? "Bền vững qua restart container" : "Nạp từ cấu hình container"}
              </span>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800/80 dark:bg-slate-900/50 flex flex-col justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">Kiểm tra kết nối</span>
              <div className="mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={isTesting || loading}
                  className="w-full text-xs font-semibold border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {isTesting ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Đang gọi thử...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="mr-1.5 h-3.5 w-3.5 text-blue-600" />
                      Gọi thử KiotViet
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Thông báo kết quả / lỗi */}
        {feedback ? (
          <div
            className={`flex items-start gap-2.5 rounded-xl p-3.5 text-sm ${
              feedback.type === "success"
                ? "border border-emerald-200 bg-emerald-50/80 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                : feedback.type === "error"
                ? "border border-rose-200 bg-rose-50/80 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
                : "border border-blue-200 bg-blue-50/80 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
            }`}
          >
            {feedback.type === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : feedback.type === "error" ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            ) : (
              <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
            )}
            <div className="flex-1 text-xs sm:text-sm">{feedback.message}</div>
          </div>
        ) : null}

        {/* Khung dán cURL 1-Click */}
        <form onSubmit={handleUpdateSession} className="space-y-3">
          <div className="flex items-center justify-between">
            <label htmlFor="curl-input" className="text-sm font-semibold text-slate-900 dark:text-white">
              Cập nhật cURL Token mới (1-Click)
            </label>
            <button
              type="button"
              onClick={() => setShowInstructions(!showInstructions)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {showInstructions ? "Ẩn hướng dẫn copy" : "Xem cách lấy cURL (10 giây)"}
              {showInstructions ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>

          {/* Hướng dẫn chi tiết */}
          {showInstructions ? (
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-xs leading-relaxed text-slate-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-slate-300 space-y-2">
              <p className="font-semibold text-blue-900 dark:text-blue-300">
                5 bước đơn giản lấy cURL từ trình duyệt Chrome / Edge:
              </p>
              <ol className="list-decimal list-inside space-y-1 pl-1">
                <li>
                  Mở trang KiotViet quản lý (ví dụ:{" "}
                  <a
                    href="https://tongkhoyagami.kiotviet.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-blue-600 inline-flex items-center gap-0.5"
                  >
                    tongkhoyagami.kiotviet.com <ExternalLink className="h-3 w-3" />
                  </a>
                  ) và đăng nhập tài khoản.
                </li>
                <li>
                  Bấm phím <strong>F12</strong> (hoặc chuột phải chọn <em>Kiểm tra / Inspect</em>) → Chuyển sang tab <strong>Network (Mạng)</strong>.
                </li>
                <li>
                  Vào menu <strong>Giao dịch → Xuất hủy</strong> (hoặc Xuất dùng nội bộ, Kiểm kho).
                </li>
                <li>
                  Tại tab Network, lọc chữ <code>list</code> hoặc click vào request bất kỳ → Chuột phải chọn <strong>Copy → Copy as cURL (bash hoặc cmd)</strong>.
                </li>
                <li>
                  Dán toàn bộ vào ô bên dưới rồi bấm <strong>Lưu & Kích hoạt phiên mới</strong>. Hệ thống sẽ tự động bóc tách token và kích hoạt ngay mà không cần restart container!
                </li>
              </ol>
            </div>
          ) : null}

          <textarea
            id="curl-input"
            rows={3}
            value={curlInput}
            onChange={(e) => setCurlInput(e.target.value)}
            placeholder={`Dán cURL từ KiotViet vào đây (ví dụ: curl --url "https://api-man1.kiotviet.vn/api/stocktakes/list" -H "authorization: Bearer eyJ..." hoặc chỉ cần chuỗi Bearer token)`}
            className="w-full rounded-xl border border-slate-200 bg-white p-3 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
          />

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              * Tự động kiểm tra thời hạn JWT, ghi vào Database và đồng bộ file secret.
            </span>
            <Button
              type="submit"
              disabled={isSubmitting || !curlInput.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm px-4 py-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang phân tích & kích hoạt...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Lưu & Kích hoạt phiên mới
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
