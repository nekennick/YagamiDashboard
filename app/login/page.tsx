import { redirect } from "next/navigation";
import { LoginForm } from "@/app/login/login-form";
import { getCurrentSession } from "@/lib/auth/server";

export default async function LoginPage() {
  const session = await getCurrentSession();
  if (session) redirect(session.role === "ADMIN" ? "/" : "/order-schedule");
  return <div className="mx-auto flex min-h-screen max-w-md items-center px-5"><section className="w-full rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"><p className="text-sm font-semibold text-indigo-600">Yagami Dashboard</p><h1 className="mt-2 text-2xl font-bold text-slate-950">Đăng nhập</h1><p className="mt-2 text-sm text-slate-600">Dùng tài khoản được quản trị viên cấp để truy cập hệ thống.</p><div className="mt-6"><LoginForm /></div></section></div>;
}
