# Kế hoạch triển khai: Phân quyền Nhân viên Nhập kho trong Cài đặt

## 1. Mục tiêu
Cho phép Quản lý (Admin) phân quyền chi tiết cho từng nhân viên (User thường - `MEMBER`) được phép thực hiện các thao tác nhập kho:
1. Thêm trường `canPurchaseOrder` (Boolean, mặc định `false`) vào model `User`.
2. Trong trang **Cài đặt -> User và phân quyền** (`/settings/users`), thêm cột và checkbox **Quyền nhập kho** cho từng tài khoản. Admin có thể bật/tắt quyền bất kỳ lúc nào.
3. Khi nhân viên có quyền:
   - Tab **"Nhập hàng"** (`/purchase-orders`) sẽ xuất hiện trên Sidebar.
   - Nhân viên được phép truy cập phân hệ nhập hàng, tạo phiếu tạm, sửa phiếu, và đẩy phiếu lên KiotViet.
4. Khi nhân viên không có quyền:
   - Tab **"Nhập hàng"** ẩn hoàn toàn trên Sidebar.
   - Nếu truy cập trực tiếp bằng đường dẫn URL, trang sẽ chặn truy cập và hiển thị thông báo "Bạn chưa được cấp quyền Nhập kho".
   - Tất cả API routes liên quan đến nhập hàng (`/api/purchase-orders/*`) đều được bảo vệ và trả về HTTP 403 nếu không có quyền.

## 2. Các bước triển khai
- [ ] 1. Thêm `canPurchaseOrder Boolean @default(false)` vào `prisma/schema.prisma`.
- [ ] 2. Chạy migrate / update database schema trong container Docker.
- [ ] 3. Tạo helper phân quyền `lib/auth/purchase-permissions.ts`.
- [ ] 4. Cập nhật `app/api/admin/users/route.ts` và `app/api/admin/users/[id]/route.ts` để đọc và lưu `canPurchaseOrder`.
- [ ] 5. Cập nhật `app/settings/users/page.tsx` và `app/settings/users/user-management.tsx` thêm cột/checkbox Quyền nhập kho.
- [ ] 6. Cập nhật `app/layout.tsx`, `components/layout/app-shell.tsx`, `layout/AppSidebar.tsx` để hiển thị/ẩn tab Nhập hàng theo quyền của user.
- [ ] 7. Cập nhật `app/purchase-orders/page.tsx` và các API routes để bảo vệ quyền truy cập.
- [ ] 8. Kiểm tra typecheck và build lại container.
