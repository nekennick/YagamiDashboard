# Lịch Đặt Hàng từ GoClaw

## Goal
Hiển thị báo cáo sáng đã chạy bởi GoClaw trong một tab riêng, không gọi lại KiotViet hoặc tính lại số liệu.

## Tasks
- [ ] Xuất `morning-report.json` cùng lúc với `morning-report.txt` → Verify: JSON hợp lệ, có cùng nội dung/timestamp.
- [ ] Tạo client GoClaw chạy server-side và API đọc báo cáo → Verify: trả dữ liệu mới nhất, không lộ token.
- [ ] Mount workspace GoClaw read-only và nối Dashboard vào network nội bộ → Verify: Dashboard đọc được JSON khi GoClaw API tạm lỗi.
- [ ] Tạo tab Lịch Đặt Hàng, KPI, bảng kho, cảnh báo và báo cáo gốc → Verify: hiển thị đúng báo cáo mẫu.
- [ ] Kiểm tra lint, type, API và giao diện → Verify: các kiểm tra dự án đạt.

## Done When
- [ ] Dashboard giữ nguyên scheduler KiotViet và tab mới chỉ đọc kết quả GoClaw.
