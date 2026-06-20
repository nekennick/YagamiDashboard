import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { ensureAutoSyncScheduler } from "@/lib/schedule";
import { Outfit } from "next/font/google";
import { SidebarProvider } from "@/context/SidebarContext";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"] });

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
      <body className={outfit.className}>
        <SidebarProvider>
          <AppShell>{children}</AppShell>
        </SidebarProvider>
      </body>
    </html>
  );
}
