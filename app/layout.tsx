import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { ensureAutoSyncScheduler } from "@/lib/schedule";
import "./globals.css";

export const metadata: Metadata = {
  title: "KiotViet Local Dashboard",
  description: "Dashboard phân tích dữ liệu KiotViet chạy local"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  ensureAutoSyncScheduler();

  return (
    <html lang="vi">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
