"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";

type User = { id: number; username: string; displayName: string; role: "ADMIN" | "MEMBER"; isActive: boolean; createdAt: string };

export function UserManagement({ initialUsers }: { initialUsers: User[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage(""); const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: form.get("username"), displayName: form.get("displayName"), password: form.get("password"), role: form.get("role") }) });
      const data = await response.json() as { user?: User; message?: string };
      if (!response.ok || !data.user) throw new Error(data.message ?? "Không thể tạo user.");
      setUsers((current) => [...current, data.user!].sort((left, right) => left.username.localeCompare(right.username))); event.currentTarget.reset(); setMessage(`Đã tạo user ${data.user.username}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể tạo user."); } finally { setSaving(false); }
  }
  async function updateUser(user: User, patch: { isActive?: boolean; password?: string }) {
    setMessage(""); const response = await fetch(`/api/admin/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }); const data = await response.json() as { user?: User; message?: string };
    if (!response.ok || !data.user) { setMessage(data.message ?? "Không thể cập nhật user."); return; }
    setUsers((current) => current.map((item) => item.id === user.id ? data.user! : item)); setMessage(`Đã cập nhật ${data.user.username}.`);
  }
  return <div className="space-y-6"><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold text-slate-950">Tạo user</h2><p className="mt-1 text-sm text-slate-600">User thường chỉ truy cập Tổng quan và Kiểm tồn, đồng thời được lưu số kiểm tồn.</p><form className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={createUser}><input className="h-10 rounded-lg border border-slate-200 px-3 text-sm" name="username" placeholder="Tên đăng nhập" required /><input className="h-10 rounded-lg border border-slate-200 px-3 text-sm" name="displayName" placeholder="Tên hiển thị" required /><input className="h-10 rounded-lg border border-slate-200 px-3 text-sm" minLength={6} name="password" placeholder="Mật khẩu (ít nhất 6 ký tự)" required type="password" /><select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" defaultValue="MEMBER" name="role"><option value="MEMBER">User thường</option><option value="ADMIN">Quản trị viên</option></select><Button className="md:col-span-2 xl:col-span-4 xl:justify-self-start" disabled={saving} type="submit">{saving ? "Đang tạo..." : "Tạo user"}</Button></form>{message ? <p className="mt-4 text-sm text-slate-700">{message}</p> : null}</section><section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-6 py-4"><h2 className="font-semibold text-slate-950">Danh sách user</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">User</th><th className="px-5 py-3">Vai trò</th><th className="px-5 py-3">Trạng thái</th><th className="px-5 py-3 text-right">Thao tác</th></tr></thead><tbody>{users.map((user) => <tr className="border-t border-slate-100" key={user.id}><td className="px-5 py-4"><p className="font-semibold text-slate-900">{user.displayName}</p><p className="mt-1 text-xs text-slate-500">{user.username}</p></td><td className="px-5 py-4">{user.role === "ADMIN" ? "Quản trị viên" : "User thường"}</td><td className="px-5 py-4">{user.isActive ? "Đang hoạt động" : "Đã khóa"}</td><td className="px-5 py-4 text-right"><div className="flex justify-end gap-2"><button className="rounded-md border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50" onClick={() => void updateUser(user, { isActive: !user.isActive })} type="button">{user.isActive ? "Khóa" : "Mở khóa"}</button><button className="rounded-md border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50" onClick={() => { const password = window.prompt(`Mật khẩu mới cho ${user.username}`); if (password) void updateUser(user, { password }); }} type="button">Đổi mật khẩu</button></div></td></tr>)}</tbody></table></div></section></div>;
}
