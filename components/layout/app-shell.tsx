import { Sidebar } from "@/components/layout/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f9fafb] text-slate-950 dark:bg-slate-950 dark:text-slate-100 lg:grid lg:grid-cols-[290px_1fr]">
      <Sidebar />
      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/85 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Yagami Dashboard</div>
              <div className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">Dữ liệu số hóa — Vận hành bứt phá</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 sm:flex">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Local PostgreSQL
              </div>
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
