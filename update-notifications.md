# Kế Hoạch Triển Khai: Nút Thông Báo Cập Nhật & Lịch Sử Thay Đổi

> Xây dựng nút chuông thông báo (góc trên bên phải) phát sáng khi có bản cập nhật mới, hiển thị Dropdown 5 bản cập nhật gần nhất và Modal xem toàn bộ lịch sử commit, hoàn toàn không gắn link đến GitHub.

---

## 🎯 Mục Tiêu & Yêu Cầu Kỹ Thuật

1. **Nút thông báo (Notification Bell)**:
   - Đặt trên `AppHeader` (góc trên bên phải, cạnh nút chuyển Theme Dark/Light).
   - Có đèn chấm sáng / pulse effect khi có phiên bản cập nhật mới hơn mã commit đã xem gần nhất.
   - Tự động tắt đèn sáng (đánh dấu đã xem) khi người dùng bấm mở menu thông báo (lưu `lastSeenCommit` vào `localStorage`).

2. **Giao diện Dropdown Popover**:
   - Hiển thị 5 bản cập nhật mới nhất.
   - Hiển thị: Tiêu đề commit, ngày tháng, mã commit rút gọn (hiển thị dạng text/badge, **TUYỆT ĐỐI KHÔNG LIÊN KẾT GITHUB**).
   - Nút **"Xem tất cả"** mở Modal hiển thị toàn bộ lịch sử.

3. **Hộp thoại Modal Xem Tất Cả (Full Changelog Modal)**:
   - Hiển thị toàn bộ danh sách lịch sử commit từ trước đến nay.
   - Có ô tìm kiếm nhanh (Search) lọc theo nội dung thay đổi hoặc ngày tháng.
   - Giao diện dạng Timeline / Card hiện đại, hỗ trợ Dark Mode hoàn hảo.

4. **Trích xuất dữ liệu Commit độc lập (Hỗ trợ Docker & Local)**:
   - Tạo script `scripts/generate-changelog.mjs` tự động trích xuất `git log` thành `lib/changelog-data.json`.
   - Cung cấp API `GET /api/changelog` phục vụ dữ liệu mượt mà ngay cả khi chạy bên trong Docker container (nơi không có git binary hay thư mục `.git`).

---

## 🛠️ Các Bước Thực Hiện

### Task 1: Script trích xuất và lưu trữ Changelog
- [scripts/generate-changelog.mjs](file:///d:/Github/YagamiDashboard/scripts/generate-changelog.mjs): Trích xuất commit history thành file tĩnh [lib/changelog-data.json](file:///d:/Github/YagamiDashboard/lib/changelog-data.json).
- Cập nhật `package.json` chạy script này trong `predev` và `prebuild`.

### Task 2: API Phục vụ Changelog (`app/api/changelog/route.ts`)
- `GET /api/changelog`: Trả về commit mới nhất và danh sách toàn bộ commit.

### Task 3: Component Chuông Thông Báo (`components/layout/notification-bell.tsx`)
- Hiển thị icon chuông với chấm thông báo nổi bật.
- Quản lý trạng thái đọc qua `localStorage` (`yagami_last_seen_commit`).
- Popover hiển thị 5 commit mới nhất + Modal xem toàn bộ lịch sử commit kèm ô tìm kiếm.

### Task 4: Tích hợp vào AppHeader (`layout/AppHeader.tsx`)
- Thêm `<NotificationBell />` vào khu vực góc trên bên phải của `AppHeader`.

### Task 5: Kiểm tra và Đóng gói
- Kiểm tra tính năng lọc tìm kiếm, hiển thị ngày giờ, mã rút gọn không có link github.
- Kiểm tra trạng thái đèn sáng / tắt khi đọc.
- Build lại container Docker để ứng dụng chạy thực tế.
