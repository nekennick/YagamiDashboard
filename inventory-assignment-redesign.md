# Kế hoạch nâng cấp phân công sản phẩm kiểm kho

## Mục tiêu

Cho phép quản lý một danh sách lớn sản phẩm theo từng nhân viên và từng kho, lưu một lần, nhập Excel cho nhiều nhân viên, đồng thời bảo đảm một sản phẩm tại một kho chỉ thuộc một nhân viên.

## Quy tắc đã chốt

- Excel có thể chứa nhiều nhân viên trong một lần nhập.
- Nhập Excel chỉ **gộp thêm**, không tự xóa danh sách đang có.
- Nếu một mã hàng tại cùng kho đang thuộc nhân viên khác, toàn bộ lần nhập/lưu bị chặn và trả danh sách mã trùng để xử lý.
- Sản phẩm đã nằm trong phiên kiểm đang hoạt động không được gỡ phân công.
- Chỉ sản phẩm đang kinh doanh, kho hợp lệ và tài khoản có quyền thực hiện kiểm kho mới được phân công.

## Bố cục giao diện

1. Thanh chọn kho, tìm nhân viên và nút tải file mẫu/nhập Excel.
2. Cột nhân viên hiển thị số mã đang quản lý để chọn nhanh.
3. Vùng sản phẩm có tìm kiếm, lọc nhóm hàng và hai chế độ `Đã phân công` / `Chưa phân công`.
4. Cho phép chọn nhiều mã, thêm hoặc gỡ khỏi bản nháp; chỉ ghi dữ liệu khi bấm `Lưu thay đổi`.
5. Thanh lưu cố định trên mobile, hiển thị rõ số mã thêm và số mã gỡ.
6. Sau khi đọc Excel, hiển thị bản xem trước theo nhân viên và kho; lỗi, mã không tồn tại và mã trùng được liệt kê trước khi cho xác nhận.

## Công việc và tiêu chí hoàn thành

1. Sửa lỗi ID chuỗi/số và chuẩn hóa dữ liệu trả về của API.
2. Thêm API lưu toàn bộ danh sách theo nhân viên + kho trong một transaction.
3. Thêm API xem trước và áp dụng file Excel nhiều nhân viên; không áp dụng một phần khi có lỗi/xung đột.
4. Thêm file Excel mẫu với các cột `Kho`, `Tài khoản`, `Mã hàng`.
5. Thay form một sản phẩm bằng giao diện master-detail, tìm kiếm/lọc/chọn nhiều và lưu một lần.
6. Bảo đảm danh sách mới xuất hiện trong khu vực lập phiên và tài khoản nhân viên nhìn thấy trong tab Kiểm kho.
7. Chạy typecheck, lint, test, build và kiểm tra API/UI sau build.

