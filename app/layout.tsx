import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { ensureAutoSyncScheduler } from "@/lib/schedule";
import { SidebarProvider } from "@/context/SidebarContext";
import { getCurrentSession } from "@/lib/auth/server";
import { getMemberAllowedTabs } from "@/lib/auth/permissions";
import { getInventoryCountPermissions } from "@/lib/auth/inventory-count";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yagami Dashboard",
  description: "Dashboard phân tích dữ liệu Yagami chạy local"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  ensureAutoSyncScheduler();
  const [session, allowedTabs] = await Promise.all([
    getCurrentSession(),
    getMemberAllowedTabs()
  ]);
  const inventoryCountEnabled = session
    ? session.role === "ADMIN" || (await getInventoryCountPermissions(session.sub, session.role)).length > 0
    : false;

  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
try {
  var theme = localStorage.getItem("theme");
  var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (theme === "dark" || (!theme && prefersDark)) {
    document.documentElement.classList.add("dark");
  }
} catch (_) {}
`
          }}
        />
      </head>
      <body>
        <SidebarProvider>
          <AppShell displayName={session?.displayName} role={session?.role} allowedTabs={allowedTabs} inventoryCountEnabled={inventoryCountEnabled}>{children}</AppShell>
        </SidebarProvider>
      </body>
    </html>
  );
}
