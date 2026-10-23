# Kế hoạch triển khai: Tab Xuất kho (Stock-out / Goods Issue)

> **Mục tiêu:** Tạo tab "Xuất kho" trên Dashboard với khả năng dựng phiếu xuất kho theo mẫu phiếu nhập hiện tại, tự động lấy dữ liệu hàng hóa xuất cuối ngày theo chi nhánh và thời điểm thực tế, lưu trữ vào cơ sở dữ liệu local để quản lý, tìm kiếm và in ấn.

---

## 1. Cơ sở dữ liệu (Prisma Schema)
- Bổ sung model `StockOutOrder` và `StockOutOrderItem`:
  - `code`: Mã phiếu xuất dạng `PX<YYMMDD>-<4 số ngẫu nhiên>`
  - `branchId`: Chi nhánh xuất kho
  - `receiverName`: Họ tên người nhận hàng
  - `documentBasis`: Chứng từ gốc ("Theo... Số... Ngày... của...")
  - `issueDate`: Thời gian xuất kho (lấy đúng thời điểm bấm tạo / lấy dữ liệu)
  - `reportDate`: Ngày báo cáo hàng hóa cuối ngày (YYYY-MM-DD)
  - `totalAmount`, `totalQuantity`: Tổng tiền và tổng lượng xuất
  - `note`: Ghi chú
  - `items`: Danh sách các mặt hàng xuất (mã hàng, tên hàng, đơn vị tính, số lượng xuất trong ngày, đơn giá bán, thành tiền)

---

## 2. API Endpoints
- `GET /api/stock-out-orders/daily-goods`:
  - Lấy lượng hàng xuất trong ngày theo `branchId` và `date` từ `InventoryMovement` (các giao dịch có `quantityDelta < 0`, bao gồm xuất bán, xuất dùng nội bộ, xuất hủy).
  - Tự động điền đơn giá bán (`basePrice`) của sản phẩm.
  - Trả về thời điểm lấy dữ liệu thực tế `timestamp`.
- `GET /api/stock-out-orders`: Danh sách các phiếu xuất kho đã lập (lọc theo chi nhánh, ngày, tìm theo mã).
- `POST /api/stock-out-orders`: Lưu phiếu xuất kho mới vào DB.
- `GET /api/stock-out-orders/[id]`: Lấy chi tiết phiếu xuất kho để in ấn hoặc xem lại.
- `DELETE /api/stock-out-orders/[id]`: Xóa phiếu xuất kho.

---

## 3. Giao diện (Frontend)
- **Menu Sidebar (`layout/AppSidebar.tsx`):**
  - Thêm tab "Xuất kho" ngay dưới tab "Nhập hàng".
- **Trang `app/stock-out/page.tsx` & Client Component:**
  - Chế độ 1: Danh sách phiếu xuất kho đã lưu (có bộ lọc, tìm kiếm, nút In, xem chi tiết, xóa).
  - Chế độ 2: Tạo phiếu xuất kho mới:
    - Chọn chi nhánh xuất & ngày dữ liệu (mặc định hôm nay).
    - Nút "Lấy dữ liệu cuối ngày": Tự động nạp danh sách hàng hóa xuất trong ngày, ghi nhận thời điểm lấy dữ liệu.
    - Cho phép điền Người nhận, Chứng từ kèm theo, Ghi chú, chỉnh sửa số lượng / đơn giá nếu cần.
    - Nút "Lưu phiếu" và "Lưu & In phiếu".
- **Bản in phiếu xuất kho (`components/stock-out/stock-out-order-print.tsx`):**
  - Dựng đúng theo mẫu phiếu nhập kho do người dùng cung cấp (Mẫu số 01 - VT, đổi tiêu đề thành PHIẾU XUẤT KHO, Mẫu số 01 - VT hoặc 02 - VT).
  - Đầy đủ thông tin: Tiêu đề công ty, chi nhánh xuất, địa chỉ, mã phiếu, ngày giờ lấy dữ liệu, người nhận, bảng hàng hóa (STT, Mã, Tên, SL, ĐVT, Đơn giá, Thành tiền), Tổng tiền hàng, Đọc số tiền bằng chữ tiếng Việt, dòng ghi chú nội bộ, 4 ô chữ ký (Người lập phiếu, Người nhận hàng, Thủ kho, Kế toán trưởng).
  - Hỗ trợ in chuẩn A4 không vỡ trang.
