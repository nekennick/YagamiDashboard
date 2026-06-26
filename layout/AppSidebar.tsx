"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/context/SidebarContext";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  FileText,
  ClipboardList,
  Boxes,
  BarChart3,
  Settings,
  ChevronDown,
  MoreHorizontal,
  ChartNoAxesCombined,
  DatabaseZap,
  Clock3,
  Database
} from "lucide-react";

type SubItem = {
  name: string;
  path: string;
  icon: React.ReactNode;
};

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: SubItem[];
};

const navItems: NavItem[] = [
  {
    name: "Dashboard",
    icon: <LayoutDashboard className="h-5 w-5" />,
    path: "/",
  },
  {
    name: "Sản phẩm",
    icon: <Package className="h-5 w-5" />,
    path: "/products",
  },
  {
    name: "Khách hàng",
    icon: <Users className="h-5 w-5" />,
    path: "/customers",
  },
  {
    name: "Đơn hàng",
    icon: <ShoppingCart className="h-5 w-5" />,
    path: "/orders",
  },
  {
    name: "Hóa đơn",
    icon: <FileText className="h-5 w-5" />,
    path: "/invoices",
  },
  {
    name: "Tồn kho",
    icon: <Boxes className="h-5 w-5" />,
    path: "/inventory",
  },
  {
    name: "Báo cáo nhanh",
    icon: <ClipboardList className="h-5 w-5" />,
    path: "/reports",
  },
];

const subMenuGroups: NavItem[] = [
  {
    name: "Phân tích",
    icon: <BarChart3 className="h-5 w-5" />,
    subItems: [
      { name: "Khách hàng", path: "/analytics/customer-frequency", icon: <BarChart3 className="h-4 w-4" /> },
      { name: "Sản phẩm", path: "/analytics/product-frequency", icon: <ChartNoAxesCombined className="h-4 w-4" /> },
    ],
  },
  {
    name: "Cài đặt",
    icon: <Settings className="h-5 w-5" />,
    subItems: [
      { name: "Đồng bộ dữ liệu", path: "/settings/sync", icon: <DatabaseZap className="h-4 w-4" /> },
      { name: "Lịch đồng bộ", path: "/settings/schedule", icon: <Clock3 className="h-4 w-4" /> },
      { name: "Cài đặt API", path: "/settings/api-test", icon: <Settings className="h-4 w-4" /> },
    ],
  },
];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();

  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>({});
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isActive = useCallback((path: string) => path === pathname, [pathname]);

  // Tự động mở submenu tương ứng khi route hoạt động
  useEffect(() => {
    let matchedSubmenu: string | null = null;
    subMenuGroups.forEach((group) => {
      if (group.subItems?.some((sub) => isActive(sub.path))) {
        matchedSubmenu = group.name;
      }
    });
    if (matchedSubmenu) {
      setOpenSubmenu(matchedSubmenu);
    }
  }, [pathname, isActive]);

  // Tính toán chiều cao submenu khi chuyển đổi trạng thái đóng/mở
  useEffect(() => {
    if (openSubmenu !== null) {
      if (subMenuRefs.current[openSubmenu]) {
        setSubMenuHeight((prevHeights) => ({
          ...prevHeights,
          [openSubmenu]: subMenuRefs.current[openSubmenu]?.scrollHeight || 0,
        }));
      }
    }
  }, [openSubmenu]);

  const handleSubmenuToggle = (name: string) => {
    setOpenSubmenu((prev) => (prev === name ? null : name));
  };

  const showFullMenu = isExpanded || isHovered || isMobileOpen;

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200 
        ${
          showFullMenu
            ? "w-[290px]"
            : "w-[90px]"
        }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Brand Logo */}
      <div
        className={`py-6 flex border-b border-gray-100 dark:border-gray-800 ${
          !showFullMenu ? "justify-center" : "justify-start"
        }`}
      >
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 to-brand-400 text-base font-semibold text-white shadow-theme-md transition-all duration-300">
            Y
          </div>
          {showFullMenu && (
            <div className="flex flex-col opacity-100 transition-opacity duration-300">
              <span className="text-base font-bold text-gray-800 dark:text-white tracking-wide">
                Yagami Dashboard
              </span>
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500">
                Local Analytics
              </span>
            </div>
          )}
        </Link>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 flex flex-col overflow-y-auto mt-6 duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-6">
            
            {/* Main Section */}
            <div>
              <h2
                className={`mb-3 text-[10px] font-bold tracking-wider uppercase flex leading-[20px] text-gray-400 dark:text-gray-400 ${
                  !showFullMenu ? "justify-center" : "justify-start"
                }`}
              >
                {showFullMenu ? "Chức năng chính" : <MoreHorizontal className="h-4 w-4" />}
              </h2>
              
              <ul className="flex flex-col gap-1.5">
                {navItems.map((nav) => (
                  <li key={nav.name}>
                    <Link
                      href={nav.path || "/"}
                      className={`menu-item group ${
                        isActive(nav.path || "/") ? "menu-item-active" : "menu-item-inactive"
                      } ${!showFullMenu ? "justify-center" : "justify-start"}`}
                    >
                      <span
                        className={`${
                          isActive(nav.path || "/") ? "menu-item-icon-active" : "menu-item-icon-inactive"
                        }`}
                      >
                        {nav.icon}
                      </span>
                      {showFullMenu && <span className="menu-item-text">{nav.name}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Advanced Section */}
            <div>
              <h2
                className={`mb-3 text-[10px] font-bold tracking-wider uppercase flex leading-[20px] text-gray-400 dark:text-gray-400 ${
                  !showFullMenu ? "justify-center" : "justify-start"
                }`}
              >
                {showFullMenu ? "Nâng cao" : <MoreHorizontal className="h-4 w-4 text-gray-400 dark:text-gray-500" />}
              </h2>

              <ul className="flex flex-col gap-1.5">
                {subMenuGroups.map((group) => {
                  const hasActiveChild = group.subItems?.some((sub) => isActive(sub.path));
                  const isSubmenuOpen = openSubmenu === group.name;

                  return (
                    <li key={group.name}>
                      <button
                        onClick={() => handleSubmenuToggle(group.name)}
                        className={`menu-item group w-full cursor-pointer transition-colors ${
                          hasActiveChild || isSubmenuOpen
                            ? "menu-item-active"
                            : "menu-item-inactive"
                        } ${!showFullMenu ? "justify-center" : "justify-start"}`}
                      >
                        <span
                          className={`${
                            hasActiveChild || isSubmenuOpen
                              ? "menu-item-icon-active"
                              : "menu-item-icon-inactive"
                          }`}
                        >
                          {group.icon}
                        </span>
                        {showFullMenu && (
                          <>
                            <span className="menu-item-text">{group.name}</span>
                            <ChevronDown
                              className={`ml-auto w-4 h-4 transition-transform duration-200 ${
                                isSubmenuOpen ? "rotate-180 text-brand-500" : "text-gray-400"
                              }`}
                            />
                          </>
                        )}
                      </button>

                      {/* Dropdown items for submenu */}
                      {group.subItems && showFullMenu && (
                        <div
                          ref={(el) => {
                            subMenuRefs.current[group.name] = el;
                          }}
                          className="overflow-hidden transition-all duration-300"
                          style={{
                            height: isSubmenuOpen ? `${subMenuHeight[group.name] || 0}px` : "0px",
                          }}
                        >
                          <ul className="mt-1.5 space-y-1 ml-9">
                            {group.subItems.map((subItem) => (
                              <li key={subItem.name}>
                                <Link
                                  href={subItem.path}
                                  className={`menu-dropdown-item ${
                                    isActive(subItem.path)
                                      ? "menu-dropdown-item-active"
                                      : "menu-dropdown-item-inactive"
                                  }`}
                                >
                                  <span className="flex-shrink-0 mr-2.5">
                                    {subItem.icon}
                                  </span>
                                  {subItem.name}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

          </div>
        </nav>
      </div>

      {/* SQLite Status Widget */}
      <div className="py-4 border-t border-gray-100 dark:border-gray-800 mt-auto">
        {showFullMenu ? (
          <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl flex items-center gap-3 border border-gray-100 dark:border-gray-800">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400">
              <Database className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-gray-700 dark:text-gray-300 truncate">
                Local SQLite
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-400 uppercase tracking-wider">
                  Connected
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="relative group flex h-9 w-9 items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 text-emerald-600 dark:text-emerald-400">
              <Database className="h-4 w-4" />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              
              {/* Tooltip khi thu gọn */}
              <div className="absolute left-full ml-4 px-2.5 py-1.5 bg-gray-900 text-white text-[11px] font-medium rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap shadow-theme-md z-[99999]">
                Local SQLite (Connected)
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

export default AppSidebar;
