# Phân quyền truy cập

## Goal
Thêm đăng nhập tài khoản và giới hạn user thường chỉ truy cập Tổng quan và Kiểm tồn, vẫn được lưu số kiểm tồn.

## Tasks
- [x] Thêm bảng User, role và migration PostgreSQL. → Verify: script khởi động đã tạo bảng User thành công.
- [x] Tạo xác thực mật khẩu, cookie phiên ký số và tài khoản admin khởi tạo. → Verify: đăng nhập admin trả HTTP 200.
- [x] Bảo vệ route và API: user thường chỉ vào `/order-schedule`, `/stocktake` và API kiểm tồn. → Verify: `/orders` chuyển về Tổng quan; `/api/sync` trả 403; API kiểm tồn trả 200.
- [x] Thêm màn hình đăng nhập, đăng xuất và quản lý user cho admin. → Verify: admin vào `/settings/users` trả HTTP 200.
- [x] Ẩn menu không có quyền và xác nhận toàn hệ thống. → Verify: 8/8 test, lint, type-check, build và runtime đều đạt.

## Done When
- [x] Admin có toàn quyền; user thường chỉ có Tổng quan và Kiểm tồn, bao gồm quyền nhập/sửa kiểm tồn.
