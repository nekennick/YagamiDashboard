# Kế Hoạch Triển Khai: Quản Lý Phân Quyền Tab Cho User Thường (Role-based)

> Triển khai tính năng cấu hình danh sách Tab/Trang hiển thị và quyền truy cập cho vai trò User thường (MEMBER) trên Yagami Dashboard.

---

## 🎯 Mục Tiêu
1. **Giao diện quản lý tab**: Thêm khu vực "Phân quyền Tab cho User thường" tại trang `/settings/users`, cho phép Quản trị viên (ADMIN) bật/tắt từng tab một cách trực quan theo từng nhóm (Chức năng chính, Phân tích, Cài đặt).
2. **Lưu trữ cấu hình**: Lưu danh sách tab được cấp quyền vào bảng `AppSetting` (key: `MEMBER_ALLOWED_TABS`), khởi tạo mặc định là `["/order-schedule", "/stocktake"]`.
3. **Hiển thị linh hoạt trên Sidebar (`AppSidebar.tsx`)**: User thường chỉ nhìn thấy các tab và nhóm submenu được Admin cấp phép; tự động ẩn các nhóm rỗng.
4. **Bảo mật đa tầng (URL Guard & Middleware)**: Chặn truy cập trái phép qua URL đối với các trang không được cấp phép cho User thường và tự động chuyển hướng (redirect) về trang hợp lệ đầu tiên.

---

## 📋 Danh Sách Tab Quản Lý Phân Quyền

| ID / Path | Tên Tab | Nhóm | Mặc định cho Member |
|:---|:---|:---|:---:|
| `/` | Dashboard | Chức năng chính | ❌ |
| `/products` | Sản phẩm | Chức năng chính | ❌ |
| `/order-schedule` | Tổng Quan | Chức năng chính | ✅ |
| `/inventory` | Tồn kho | Chức năng chính | ❌ |
| `/stocktake` | Kiểm tồn | Chức năng chính | ✅ |
| `/reports` | Báo cáo nhanh | Chức năng chính | ❌ |
| `/analytics/product-frequency` | Phân tích sản phẩm | Phân tích | ❌ |
| `/settings/branches` | Danh mục chi nhánh | Cài đặt | ❌ |
| `/settings/sync` | Đồng bộ dữ liệu | Cài đặt | ❌ |
| `/settings/schedule` | Lịch đồng bộ | Cài đặt | ❌ |
| `/settings/api-test` | Cài đặt API | Cài đặt | ❌ |

*(Lưu ý: Tab `/settings/users` luôn chỉ dành riêng cho Quản trị viên - ADMIN, không cho phép cấp quyền cho Member).*

---

## 🛠️ Các Bước Thực Hiện

### Task 1: Module helper quản lý phân quyền tab (`lib/auth/permissions.ts`)
- Định nghĩa danh sách các tab chuẩn (PATH, Tên, Nhóm, Icon tương ứng).
- Hàm `getMemberAllowedTabs()`: Đọc cấu hình từ `AppSetting` (`MEMBER_ALLOWED_TABS`), trả về mảng các path.
- Hàm `setMemberAllowedTabs(paths: string[])`: Lưu cấu hình vào `AppSetting` và kiểm tra tính hợp lệ.

### Task 2: API Phân quyền (`app/api/admin/permissions/route.ts`)
- `GET /api/admin/permissions`: Trả về danh sách tất cả các tab và danh sách tab đang được cấp quyền cho Member (chỉ cho phép ADMIN gọi).
- `PUT /api/admin/permissions`: Lưu danh sách tab mới cho Member, đồng thời cập nhật cookie quyền hoặc cache nếu cần (chỉ cho phép ADMIN gọi).

### Task 3: Giao diện quản lý tab trên trang `/settings/users`
- Cập nhật [app/settings/users/user-management.tsx](file:///d:/Github/YagamiDashboard/app/settings/users/user-management.tsx):
  - Thêm thẻ quản lý "Phân quyền Tab cho User thường".
  - Hiển thị danh sách tab theo 3 nhóm (Chức năng chính, Phân tích, Cài đặt).
  - Checkbox/Switch toggle trực quan cho từng tab.
  - Nút "Lưu cấu hình phân quyền" kèm thông báo thành công / lỗi.
- Cập nhật [app/settings/users/page.tsx](file:///d:/Github/YagamiDashboard/app/settings/users/page.tsx) truyền danh sách tab và quyền hiện tại.

### Task 4: Cập nhật điều hướng Sidebar (`layout/AppSidebar.tsx` & `components/layout/app-shell.tsx`)
- Truyền `allowedTabs` từ Server (`RootLayout`) xuống `AppShell` và `AppSidebar`.
- Lọc `visibleNavItems` và `visibleSubMenuGroups` theo `allowedTabs` đối với vai trò `MEMBER`.
- Ẩn hẳn các nhóm menu rỗng nếu không có tab con nào được bật.

### Task 5: Bảo vệ URL tại Middleware & Server Layout (`middleware.ts` & Server Check)
- Cập nhật [middleware.ts](file:///d:/Github/YagamiDashboard/middleware.ts):
  - Đọc cookie `yagami_allowed_tabs` hoặc xác thực quyền cho Member theo danh sách tab được cấp.
  - Ngăn chặn truy cập URL trái phép, redirect về trang hợp lệ đầu tiên (ví dụ `/order-schedule`).
- Đảm bảo các route API liên quan (ví dụ daily inventory, branches...) vẫn hoạt động đúng với tab được cấp.

---

## 🧪 Kế Hoạch Kiểm Tra & Xác Nhận (Verification)
1. Đăng nhập tài khoản ADMIN:
   - Truy cập `/settings/users` -> Kiểm tra giao diện quản lý tab.
   - Thử bật thêm tab `Tồn kho` (`/inventory`) và `Báo cáo nhanh` (`/reports`) rồi bấm Lưu.
2. Đăng nhập tài khoản MEMBER:
   - Kiểm tra Sidebar: Xem các tab `Tổng quan`, `Kiểm tồn`, `Tồn kho`, `Báo cáo nhanh` có xuất hiện đúng không.
   - Kiểm tra các tab không được cấp (ví dụ `Dashboard` `/` hoặc `Cài đặt API` `/settings/api-test`): Thử gõ trực tiếp URL xem có bị chặn và chuyển hướng về trang hợp lệ không.
3. Chạy `npm.cmd run build` hoặc lint để đảm bảo TypeScript không có lỗi.
