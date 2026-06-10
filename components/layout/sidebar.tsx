import { AnimatedNavLink } from "@/components/layout/animated-nav-link";
import {
  BarChart3,
  Boxes,
  ChartNoAxesCombined,
  Clock3,
  DatabaseZap,
  FileText,
  Gauge,
  Package,
  Settings,
  Users
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: Gauge },
  { href: "/products", label: "Sản phẩm", icon: Package },
  { href: "/customers", label: "Khách hàng", icon: Users },
  { href: "/invoices", label: "Hóa đơn", icon: FileText },
  { href: "/inventory", label: "Tồn kho", icon: Boxes },
  { href: "/analytics/customer-frequency", label: "Phân tích khách hàng", icon: BarChart3 },
  { href: "/analytics/product-frequency", label: "Phân tích sản phẩm", icon: ChartNoAxesCombined },
  { href: "/settings/sync", label: "Đồng bộ dữ liệu", icon: DatabaseZap },
  { href: "/settings/schedule", label: "Lịch đồng bộ", icon: Clock3 },
  { href: "/settings/api-test", label: "Cài đặt API", icon: Settings }
];

export function Sidebar() {
  return (
    <aside className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
      <div className="flex h-20 items-center border-b border-slate-100 px-5 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-sm font-semibold text-white shadow-sm">
            Y
          </div>
          <div>
            <div className="text-base font-semibold text-slate-950 dark:text-white">Yagami Dashboard</div>
            <div className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">Local Analytics</div>
          </div>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto p-3 lg:block lg:space-y-1 lg:p-4">
        {navItems.map((item) => {
          const Icon = item.icon;

          return (
            <AnimatedNavLink key={item.href} href={item.href}>
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{item.label}</span>
            </AnimatedNavLink>
          );
        })}
      </nav>
    </aside>
  );
}
