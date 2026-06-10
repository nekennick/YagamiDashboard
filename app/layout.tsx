import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { ensureAutoSyncScheduler } from "@/lib/schedule";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yagami Dashboard",
  description: "Dashboard phân tích dữ liệu Yagami chạy local"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  ensureAutoSyncScheduler();

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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
