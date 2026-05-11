import { Sidebar } from "@/components/layout/sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <Sidebar />
      <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
