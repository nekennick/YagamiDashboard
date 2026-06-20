"use client";

import { useSidebar } from "@/context/SidebarContext";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();

  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
    ? "lg:ml-[290px]"
    : "lg:ml-[90px]";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col">
      <AppSidebar />
      <Backdrop />
      <div className={`flex-1 flex flex-col transition-all duration-300 ${mainContentMargin}`}>
        <AppHeader />
        <main className="flex-grow p-4 md:p-6 lg:p-8 w-full max-w-(--breakpoint-2xl) mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
