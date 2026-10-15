export type TabGroup = "main" | "analytics" | "settings";

export type TabItem = {
  path: string;
  name: string;
  group: TabGroup;
  groupLabel: string;
};

export const MANAGEABLE_TABS: TabItem[] = [
  { path: "/", name: "Dashboard", group: "main", groupLabel: "Chức năng chính" },
  { path: "/products", name: "Sản phẩm", group: "main", groupLabel: "Chức năng chính" },
  { path: "/order-schedule", name: "Tổng Quan", group: "main", groupLabel: "Chức năng chính" },
  { path: "/inventory", name: "Tồn kho", group: "main", groupLabel: "Chức năng chính" },
  { path: "/stocktake", name: "Kiểm tồn", group: "main", groupLabel: "Chức năng chính" },
  { path: "/reports", name: "Báo cáo nhanh", group: "main", groupLabel: "Chức năng chính" },
  { path: "/analytics/product-frequency", name: "Phân tích sản phẩm", group: "analytics", groupLabel: "Phân tích" },
  { path: "/settings/branches", name: "Danh mục chi nhánh", group: "settings", groupLabel: "Cài đặt" },
  { path: "/settings/sync", name: "Đồng bộ dữ liệu", group: "settings", groupLabel: "Cài đặt" },
  { path: "/settings/schedule", name: "Lịch đồng bộ", group: "settings", groupLabel: "Cài đặt" },
  { path: "/settings/api-test", name: "Cài đặt API", group: "settings", groupLabel: "Cài đặt" },
];

export const DEFAULT_MEMBER_TABS = ["/order-schedule", "/stocktake"];
export const memberTabsCookieName = "yagami_member_tabs";
