"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { TabItem, TabGroup } from "@/lib/auth/permissions";
import {
  Shield,
  CheckSquare,
  Square,
  RotateCcw,
  Save,
  Users as UsersIcon,
  PlusCircle,
  Pencil,
  Trash2,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet
} from "lucide-react";
import { UserEditModal, type User } from "@/components/settings/user-edit-modal";
import { UserDeleteModal } from "@/components/settings/user-delete-modal";

const inventoryCountPermissionLabels = {
  COUNT_EXECUTE: "Nhập kiểm",
  COUNT_MANAGE: "Quản lý kiểm",
  COUNT_BALANCE: "Cân bằng kho"
} as const;

export function UserManagement({
  initialUsers,
  initialAllowedTabs,
  allTabs
}: {
  initialUsers: User[];
  initialAllowedTabs: string[];
  allTabs: TabItem[];
}) {
  const [users, setUsers] = useState(initialUsers);
  const [allowedTabs, setAllowedTabs] = useState<string[]>(initialAllowedTabs);
  const [savingTabs, setSavingTabs] = useState(false);
  const [tabMessage, setTabMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [message, setMessage] = useState("");
  const [createMessage, setCreateMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);

  // Nhóm các tab theo category
  const groups: { key: TabGroup; label: string; tabs: TabItem[] }[] = [
    { key: "main", label: "Chức năng chính", tabs: allTabs.filter((t) => t.group === "main") },
    { key: "analytics", label: "Phân tích", tabs: allTabs.filter((t) => t.group === "analytics") },
    { key: "settings", label: "Cài đặt hệ thống", tabs: allTabs.filter((t) => t.group === "settings") }
  ];

  function toggleTab(path: string) {
    setTabMessage(null);
    setAllowedTabs((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  }

  function handleSelectAll() {
    setTabMessage(null);
    setAllowedTabs(allTabs.map((t) => t.path));
  }

  function handleDeselectAll() {
    setTabMessage(null);
    setAllowedTabs([]);
  }

  function handleResetDefault() {
    setTabMessage(null);
    setAllowedTabs(["/order-schedule", "/stocktake"]);
  }

  async function saveTabPermissions() {
    setSavingTabs(true);
    setTabMessage(null);
    try {
      const response = await fetch("/api/admin/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedTabs })
      });
      const data = (await response.json()) as { message?: string; allowedTabs?: string[] };
      if (!response.ok) throw new Error(data.message ?? "Không thể lưu phân quyền tab.");
      setTabMessage({ type: "success", text: "Đã lưu phân quyền tab thành công! Thay đổi sẽ áp dụng ngay cho User thường." });
    } catch (error) {
      setTabMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Đã có lỗi xảy ra khi lưu phân quyền."
      });
    } finally {
      setSavingTabs(false);
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setCreateMessage(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.get("username"),
          displayName: form.get("displayName"),
          password: form.get("password"),
          role: form.get("role"),
          canPurchaseOrder: form.get("canPurchaseOrder") === "on"
        })
      });
      const data = (await response.json()) as { user?: User; message?: string };
      if (!response.ok || !data.user) throw new Error(data.message ?? "Không thể tạo user.");
      setUsers((current) =>
        [...current, data.user!].sort((left, right) => left.username.localeCompare(right.username))
      );
      formElement.reset();
      setCreateMessage({
        type: "success",
        text: `Đã tạo tài khoản "${data.user.displayName}" (${data.user.username}) thành công!`
      });
    } catch (error) {
      setCreateMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Không thể tạo user."
      });
    } finally {
      setSaving(false);
    }
  }

  async function updateUser(
    user: User,
    patch: {
      isActive?: boolean;
      password?: string;
      canPurchaseOrder?: boolean;
      countPermissions?: User["countPermissions"];
    }
  ) {
    setMessage("");
    const response = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    const data = (await response.json()) as { user?: User; message?: string };
    if (!response.ok || !data.user) {
      setMessage(data.message ?? "Không thể cập nhật user.");
      return;
    }
    setUsers((current) => current.map((item) => (item.id === user.id ? data.user! : item)));
    setMessage(`Đã cập nhật ${data.user.username}.`);
  }

  return (
    <div className="space-y-8">
      {/* SECTION 1: QUẢN LÝ PHÂN QUYỀN TAB */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
                Phân quyền hiển thị Tab cho User thường
              </h2>
              <p className="text-sm text-slate-500 dark:text-gray-400">
                Các tab được đánh dấu sẽ hiển thị trên Sidebar của tài khoản User thường (MEMBER).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0">
            <button
              type="button"
              onClick={handleSelectAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <CheckSquare className="h-3.5 w-3.5 text-blue-600" />
              Chọn tất cả
            </button>
            <button
              type="button"
              onClick={handleDeselectAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <Square className="h-3.5 w-3.5 text-slate-400" />
              Bỏ chọn hết
            </button>
            <button
              type="button"
              onClick={handleResetDefault}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
              Mặc định
            </button>
          </div>
        </div>

        {/* DANH SÁCH TAB THEO NHÓM */}
        <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <div
              key={group.key}
              className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-gray-800 dark:bg-gray-800/40"
            >
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-gray-400">
                {group.label}
              </h3>
              <div className="space-y-2">
                {group.tabs.map((tab) => {
                  const isChecked = allowedTabs.includes(tab.path);
                  return (
                    <label
                      key={tab.path}
                      className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-all ${
                        isChecked
                          ? "border-blue-200 bg-blue-50/50 text-slate-900 shadow-xs dark:border-blue-800/50 dark:bg-blue-950/20 dark:text-blue-100"
                          : "border-slate-200/70 bg-white text-slate-600 hover:border-slate-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleTab(tab.path)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800"
                        />
                        <span className="text-sm font-medium">{tab.name}</span>
                      </div>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-mono text-slate-500 dark:bg-gray-800 dark:text-gray-400">
                        {tab.path}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {tabMessage && (
          <div
            className={`mt-4 rounded-lg p-3 text-sm ${
              tabMessage.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                : "bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800"
            }`}
          >
            {tabMessage.text}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <Button
            onClick={saveTabPermissions}
            disabled={savingTabs}
            className="inline-flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <Save className="h-4 w-4" />
            {savingTabs ? "Đang lưu cấu hình..." : "Lưu phân quyền tab"}
          </Button>
        </div>
      </section>

      {/* SECTION 2: TẠO USER MỚI */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4 dark:border-gray-800">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
            <PlusCircle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Thêm tài khoản mới</h2>
            <p className="text-sm text-slate-500 dark:text-gray-400">
              Tạo tài khoản Quản trị viên (toàn quyền) hoặc User thường (theo phân quyền tab ở trên).
            </p>
          </div>
        </div>

        <form className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={createUser}>
          <input
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            name="username"
            placeholder="Tên đăng nhập"
            required
          />
          <input
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            name="displayName"
            placeholder="Tên hiển thị"
            required
          />
          <input
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            minLength={6}
            name="password"
            placeholder="Mật khẩu (ít nhất 6 ký tự)"
            required
            type="password"
          />
          <select
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            defaultValue="MEMBER"
            name="role"
          >
            <option value="MEMBER">User thường (MEMBER)</option>
            <option value="ADMIN">Quản trị viên (ADMIN)</option>
          </select>
          <div className="flex items-center gap-2 md:col-span-2 xl:col-span-4 py-1">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                name="canPurchaseOrder"
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Cấp quyền Nhập kho (cho phép tạo & đẩy phiếu nhập lên KiotViet)</span>
            </label>
          </div>
          <Button
            className="md:col-span-2 xl:col-span-4 xl:justify-self-start"
            disabled={saving}
            type="submit"
          >
            {saving ? "Đang tạo..." : "Tạo user"}
          </Button>
        </form>
        {createMessage && (
          <div
            className={`mt-4 flex items-center justify-between rounded-xl p-3.5 text-xs sm:text-sm border ${
              createMessage.type === "success"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                : "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60"
            }`}
          >
            <div className="flex items-center gap-2">
              {createMessage.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
              )}
              <span>{createMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setCreateMessage(null)}
              className="text-xs font-semibold opacity-70 hover:opacity-100 ml-3"
            >
              Đóng
            </button>
          </div>
        )}
      </section>

      {/* SECTION 3: DANH SÁCH USER */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <UsersIcon className="h-5 w-5 text-slate-500 dark:text-gray-400" />
            <h2 className="font-semibold text-slate-950 dark:text-white">Danh sách tài khoản ({users.length})</h2>
          </div>
          <a
            href="/api/export/users"
            download
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-emerald-700 hover:border-emerald-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:hover:text-emerald-400 transition-colors"
            title="Xuất danh sách nhân viên ra file Excel"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>Xuất Excel</span>
          </a>
        </div>

        {message && (
          <div className="mx-6 mt-4 flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/80 p-3 text-xs text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300">
            <span>{message}</span>
            <button
              type="button"
              onClick={() => setMessage("")}
              className="font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400"
            >
              Đóng
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-gray-800/60 dark:text-gray-400">
              <tr>
                <th className="px-5 py-3">Tài khoản</th>
                <th className="px-5 py-3">Vai trò</th>
                <th className="px-5 py-3">Trạng thái</th>
                <th className="px-5 py-3">Quyền Kiểm kho</th>
                <th className="px-5 py-3">Quyền Nhập kho</th>
                <th className="px-5 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
              {users.map((user) => (
                <tr className="hover:bg-slate-50/50 dark:hover:bg-gray-800/30" key={user.id}>
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-900 dark:text-white">{user.displayName}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">{user.username}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${
                        user.role === "ADMIN"
                          ? "bg-purple-50 text-purple-700 ring-1 ring-purple-600/20 dark:bg-purple-950/40 dark:text-purple-300"
                          : "bg-blue-50 text-blue-700 ring-1 ring-blue-600/20 dark:bg-blue-950/40 dark:text-blue-300"
                      }`}
                    >
                      {user.role === "ADMIN" ? "Quản trị viên" : "User thường"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                        user.isActive ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-gray-500"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${user.isActive ? "bg-emerald-500" : "bg-slate-400"}`}
                      />
                      {user.isActive ? "Đang hoạt động" : "Đã khóa"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {user.role === "ADMIN" ? (
                      <span className="text-xs text-slate-400">Toàn quyền</span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {(Object.keys(inventoryCountPermissionLabels) as User["countPermissions"]).map((permission) => (
                          <label key={permission} className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={user.countPermissions.includes(permission)}
                              onChange={() =>
                                void updateUser(user, {
                                  countPermissions: user.countPermissions.includes(permission)
                                    ? user.countPermissions.filter((item) => item !== permission)
                                    : [...user.countPermissions, permission]
                                })
                              }
                              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            {inventoryCountPermissionLabels[permission]}
                          </label>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {user.role === "ADMIN" ? (
                      <span className="text-xs text-slate-400">Toàn quyền</span>
                    ) : (
                      <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={Boolean(user.canPurchaseOrder)}
                          onChange={() => void updateUser(user, { canPurchaseOrder: !user.canPurchaseOrder })}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className={user.canPurchaseOrder ? "font-semibold text-indigo-600 dark:text-indigo-400" : ""}>
                          Cho phép nhập hàng
                        </span>
                      </label>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-blue-950/40 dark:hover:text-blue-300 dark:hover:border-blue-800 transition-colors"
                        onClick={() => setEditingUser(user)}
                        type="button"
                        title="Chỉnh sửa tên và thông tin tài khoản"
                      >
                        <Pencil className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                        <span>Sửa</span>
                      </button>
                      <button
                        className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          user.isActive
                            ? "border-slate-200 text-slate-700 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-amber-950/40 dark:hover:text-amber-300"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                        }`}
                        onClick={() => void updateUser(user, { isActive: !user.isActive })}
                        type="button"
                        disabled={user.username === "admin"}
                        title={user.username === "admin" ? "Không thể khóa tài khoản admin gốc" : user.isActive ? "Khóa tài khoản" : "Mở khóa tài khoản"}
                      >
                        {user.isActive ? (
                          <Lock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                        ) : (
                          <Unlock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        )}
                        <span>{user.isActive ? "Khóa" : "Mở"}</span>
                      </button>
                      {user.username !== "admin" ? (
                        <button
                          className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 hover:border-rose-300 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/40 transition-colors"
                          onClick={() => setDeletingUser(user)}
                          type="button"
                          title="Xóa tài khoản người dùng"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Xóa</span>
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal chỉnh sửa tài khoản */}
      <UserEditModal
        isOpen={Boolean(editingUser)}
        user={editingUser}
        onClose={() => setEditingUser(null)}
        onSuccess={(updatedUser) => {
          setUsers((prev) =>
            prev
              .map((u) => (u.id === updatedUser.id ? updatedUser : u))
              .sort((a, b) => a.username.localeCompare(b.username))
          );
          setMessage(`Đã cập nhật thông tin tài khoản "${updatedUser.displayName}" (${updatedUser.username}) thành công.`);
        }}
      />

      {/* Modal xóa tài khoản */}
      <UserDeleteModal
        isOpen={Boolean(deletingUser)}
        user={deletingUser}
        onClose={() => setDeletingUser(null)}
        onSuccess={(deletedId, msg) => {
          setUsers((prev) => prev.filter((u) => u.id !== deletedId));
          setMessage(msg);
        }}
        onLockUser={async (user) => {
          await updateUser(user, { isActive: false });
        }}
      />
    </div>
  );
}
