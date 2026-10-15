"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      const data = await response.json() as { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Không thể đăng nhập.");
      const next = searchParams.get("next");
      router.replace(next && next.startsWith("/") ? next : "/order-schedule");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể đăng nhập.");
    } finally {
      setLoading(false);
    }
  }

  return <form className="space-y-4" onSubmit={submit}>
    <label className="block text-sm font-medium text-slate-700">Tên đăng nhập<input autoComplete="username" className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 outline-none focus:border-indigo-500" onChange={(event) => setUsername(event.target.value)} value={username} /></label>
    <label className="block text-sm font-medium text-slate-700">Mật khẩu<input autoComplete="current-password" className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 outline-none focus:border-indigo-500" onChange={(event) => setPassword(event.target.value)} type="password" value={password} /></label>
    {message ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{message}</p> : null}
    <Button className="w-full" disabled={loading} type="submit">{loading ? "Đang đăng nhập..." : "Đăng nhập"}</Button>
  </form>;
}
