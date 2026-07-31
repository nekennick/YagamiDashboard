# Branch Directory Management

## Goal
Phát hiện khách hàng có khả năng là chi nhánh, cho phép xác nhận kho/trạng thái trên dashboard và tự xuất lại knowledge base.

## Tasks
- [x] Thêm bảng `BranchDirectory` và `BranchDirectoryAudit` bằng migration SQLite idempotent.
- [x] Nhập dữ liệu chuẩn hiện có và tạo bộ xuất JSON/CSV/JSONL/Markdown.
- [x] Thêm API lấy ứng viên, xác nhận và cập nhật danh mục có audit.
- [x] Thêm trang `Cài đặt > Danh mục chi nhánh` với hai tab cần xác nhận/đã quản lý.
- [x] Cho báo cáo website đọc danh mục database.
- [x] Kiểm tra migration, dữ liệu, lint, UX audit và production build.

## Done When
- [x] Luồng xác nhận cập nhật database/audit/knowledge base đã được build; API xuất file đã chạy thật mà không tự phân loại khách chưa được anh duyệt.
