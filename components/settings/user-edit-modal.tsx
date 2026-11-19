"use client";

import { useEffect, useState, FormEvent } from "react";
import { createPortal } from "react-dom";
import { X, UserPen, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export type User = {
  id: number;
  username: string;
  displayName: string;
  role: "ADMIN" | "MEMBER";
  isActive: boolean;
  canPurchaseOrder?: boolean;
  createdAt: string;
  countPermissions: Array<"COUNT_EXECUTE" | "COUNT_MANAGE" | "COUNT_BALANCE">;
};

interface UserEditModalProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedUser: User) => void;
}

export function UserEditModal({ user, isOpen, onClose, onSuccess }: UserEditModalProps) {
  const [mounted, setMounted] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [canPurchaseOrder, setCanPurchaseOrder] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (user && isOpen) {
      setDisplayName(user.displayName);
      setUsername(user.username);
      setRole(user.role);
      setCanPurchaseOrder(Boolean(user.canPurchaseOrder));
      setPassword("");
      setError(null);
    }
  }, [user, isOpen]);

  // Đóng bằng phím ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!mounted || !isOpen || !user) return null;

  const isRootAdmin = user.username === "admin";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;

    const trimmedDisplayName = displayName.trim();
    const trimmedUsername = username.trim().toLowerCase();

    if (!trimmedDisplayName) {
      setError("Tên hiển thị không được để trống.");
      return;
    }

    if (!trimmedUsername) {
      setError("Tên đăng nhập không được để trống.");
      return;
    }

    if (password && password.length < 6) {
      setError("Mật khẩu mới cần ít nhất 6 ký tự.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const payload: {
        displayName: string;
        username?: string;
        role?: "ADMIN" | "MEMBER";
        canPurchaseOrder?: boolean;
        password?: string;
      } = {
        displayName: trimmedDisplayName,
        canPurchaseOrder: role === "ADMIN" ? true : canPurchaseOrder
      };

      if (!isRootAdmin) {
        payload.username = trimmedUsername;
        payload.role = role;
      }

      if (password.trim()) {
        payload.password = password.trim();
      }

      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = (await response.json()) as { user?: User; message?: string };
      if (!response.ok || !data.user) {
        throw new Error(data.message || "Không thể cập nhật thông tin người dùng.");
      }

      onSuccess(data.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  }

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 dark:bg-gray-900 dark:border-gray-800"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-user-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
              <UserPen className="h-4 w-4" />
            </div>
            <div>
              <h2 id="edit-user-title" className="text-base font-semibold text-slate-900 dark:text-white">
                Chỉnh sửa tài khoản
              </h2>
              <p className="text-xs text-slate-500 dark:text-gray-400">
                Cập nhật tên, tên đăng nhập hoặc mật khẩu
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-gray-300">
              Tên hiển thị <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              placeholder="Ví dụ: Nguyễn Văn A"
              className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 dark:text-gray-300">
                Tên đăng nhập <span className="text-rose-500">*</span>
              </label>
              {isRootAdmin && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400">
                  (Tài khoản admin gốc cố định)
                </span>
              )}
            </div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isRootAdmin}
              required
              placeholder="Ví dụ: nva"
              className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:disabled:bg-gray-800/50 dark:disabled:text-gray-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-gray-300">
              Vai trò
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "ADMIN" | "MEMBER")}
              disabled={isRootAdmin}
              className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="MEMBER">User thường (MEMBER)</option>
              <option value="ADMIN">Quản trị viên (ADMIN)</option>
            </select>
          </div>

          <div className="pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={role === "ADMIN" || canPurchaseOrder}
                disabled={role === "ADMIN"}
                onChange={(e) => setCanPurchaseOrder(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                Cấp quyền Nhập kho {role === "ADMIN" ? "(Quản trị viên mặc định toàn quyền)" : ""}
              </span>
            </label>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-gray-800">
            <label className="text-xs font-semibold text-slate-700 dark:text-gray-300">
              Mật khẩu mới
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              placeholder="Để trống nếu không muốn đổi mật khẩu"
              className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
            <p className="text-[11px] text-slate-400">
              Nhập từ 6 ký tự trở lên nếu muốn cấp lại mật khẩu cho user này.
            </p>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-gray-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={loading}
              className="h-9 px-4 text-xs font-medium"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading}
              className="h-9 px-4 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                "Lưu thay đổi"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
