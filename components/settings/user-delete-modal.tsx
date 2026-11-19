"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Trash2, X, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { User } from "./user-edit-modal";

interface UserDeleteModalProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (deletedUserId: number, message: string) => void;
  onLockUser: (user: User) => Promise<void>;
}

export function UserDeleteModal({
  user,
  isOpen,
  onClose,
  onSuccess,
  onLockUser
}: UserDeleteModalProps) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locking, setLocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setLoading(false);
      setLocking(false);
    }
  }, [isOpen]);

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

  async function handleDelete() {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE"
      });

      const data = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Không thể xóa tài khoản này.");
      }

      onSuccess(user.id, data.message || `Đã xóa tài khoản ${user.displayName}.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra khi xóa tài khoản.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLockAlternative() {
    if (!user) return;
    try {
      setLocking(true);
      await onLockUser(user);
      onClose();
    } catch {
      // lỗi đã được xử lý ở parent
    } finally {
      setLocking(false);
    }
  }

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 dark:bg-gray-900 dark:border-gray-800"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-user-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400">
              <Trash2 className="h-4 w-4" />
            </div>
            <div>
              <h2 id="delete-user-title" className="text-base font-semibold text-slate-900 dark:text-white">
                Xóa tài khoản người dùng
              </h2>
              <p className="text-xs text-slate-500 dark:text-gray-400">
                Xác nhận thao tác xóa tài khoản
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

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-gray-800 dark:bg-gray-800/40">
            <div className="text-sm font-semibold text-slate-900 dark:text-white">
              {user.displayName}
            </div>
            <div className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
              Tên đăng nhập: <code className="font-mono text-slate-700 dark:text-gray-300">{user.username}</code> • Vai trò:{" "}
              {user.role === "ADMIN" ? "Quản trị viên" : "User thường"}
            </div>
          </div>

          {!error ? (
            <p className="text-xs text-slate-600 dark:text-gray-300 leading-relaxed">
              Bạn có chắc chắn muốn xóa tài khoản này? Hành động này sẽ xóa hoàn toàn thông tin người dùng khỏi hệ thống nếu tài khoản chưa phát sinh dữ liệu lịch sử kiểm kho.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/90 p-3.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200 leading-relaxed">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>{error}</span>
              </div>
              {user.isActive && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-gray-800 dark:bg-gray-800/60 flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-600 dark:text-gray-300">
                    Khóa tài khoản để vô hiệu hóa đăng nhập mà vẫn giữ lịch sử.
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleLockAlternative}
                    disabled={locking}
                    className="shrink-0 text-xs h-8 px-3 border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-950/50"
                  >
                    {locking ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <Lock className="h-3.5 w-3.5 mr-1" />
                    )}
                    Khóa tài khoản
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-gray-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={loading || locking}
              className="h-9 px-4 text-xs font-medium"
            >
              Hủy
            </Button>
            {!error && (
              <Button
                type="button"
                size="sm"
                onClick={handleDelete}
                disabled={loading || locking}
                className="h-9 px-4 text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Đang xóa...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Xác nhận xóa
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
