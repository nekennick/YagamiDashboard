# Đồng bộ phiếu kiểm kho KiotViet bằng cookie

## Mục tiêu

Tự động lấy phiếu kiểm kho từ API nội bộ KiotViet, nhận diện đúng phần kiểm kê và phần chênh chưa xác định, đồng thời không đưa cookie ra frontend hoặc log.

## Công việc

- [x] 1. Ghi nhận request mẫu từ `Copy as cURL` của `stocktakes/list` và `stocktakes/{id}/details`; tách URL, payload, cookie và các header bắt buộc. → Xác minh: gọi được `KK000782`, dữ liệu có 16 dòng nhưng không in token.
- [x] 2. Thêm Docker secret phiên quản trị và cấu hình base URL nội bộ; backend chỉ đọc secret tại `/run/secrets/...`.
- [x] 3. Thêm schema/migration `StocktakeDocument` và `StocktakeLine`, khóa chống trùng theo ID phiếu/dòng.
- [x] 4. Viết client API nội bộ có timeout, retry nhẹ, phân trang và nhận diện phiên hết hạn; không xóa dữ liệu cũ khi request lỗi.
- [x] 5. Thêm sync `stocktakes` và `stocktakeHistory`; chỉ phiếu trạng thái đã cân bằng kho mới tạo movement `STOCKTAKE`.
- [x] 6. Tích hợp `stocktakes` vào nút Đồng bộ, “Đồng bộ tất cả” và nhóm lịch Giao dịch trước snapshot tồn kho.
- [x] 7. Sửa thuật toán Tồn kho và Kiểm tồn: `tồn dự kiến = tồn đầu + nhập - xuất + chuyển kho + kiểm kê`; phần còn lại là `lệch chưa xác định`.
- [x] 8. Cập nhật bảng Tồn kho, popup và link `KK` tới KiotViet.
- [x] 9. Đã chạy test/lint/typecheck/build; còn chờ áp migration và sync dữ liệu thật để kiểm chứng end-to-end.

## Hoàn tất khi

- [ ] Dashboard tự tải phiếu mới mà không cần Excel.
- [ ] Cookie không xuất hiện trong source, database, API response hoặc log.
- [ ] Phân biệt được `Kiểm kê có mã phiếu` và `Lệch chưa xác định`.
- [ ] Cookie hết hạn chỉ dừng sync kiểm kho và có hướng dẫn thay secret, không làm sai/xóa số liệu.

## Quyết định kiến trúc

Dùng API nội bộ theo yêu cầu và chấp nhận khả năng KiotViet thay đổi endpoint. Dữ liệu được lưu thành bảng phiếu kiểm kho riêng để truy vết, đồng thời tạo movement `STOCKTAKE` cho sổ kho. File Excel giữ vai trò đối chiếu kết quả, không còn là nguồn nhập chính.
