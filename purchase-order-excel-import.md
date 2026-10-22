# Kế hoạch triển khai: Import danh sách hàng hóa từ Excel cho Phiếu nhập hàng

## 1. Mục tiêu
Cho phép người dùng tải lên file Excel (.xlsx) gồm 2 cột **Mã hàng** và **Số lượng nhập** trong màn hình Lập phiếu nhập hàng mới. Hệ thống sẽ:
1. Đọc dữ liệu 2 cột (hỗ trợ tự nhận diện tiêu đề hoặc vị trí cột A, B).
2. Đối chiếu mã hàng với danh mục sản phẩm hợp lệ trong cơ sở dữ liệu (loại trừ các mã không tồn tại, sản phẩm Dịch vụ type=3, Đóng gói type=1).
3. Hiển thị **Modal Xem trước (Preview)**:
   - Thống kê: Tổng số dòng, Số dòng hợp lệ, Số dòng bị bỏ qua.
   - Danh sách chi tiết các mặt hàng hợp lệ (Mã, Tên, ĐVT, Số lượng, Đơn giá bán lẻ, Thành tiền).
   - Danh sách chi tiết các mã bị bỏ qua kèm lý do.
   - Nút tải file Excel mẫu (.xlsx).
4. Khi bấm **"Xác nhận thêm vào phiếu"**:
   - Nếu mã hàng đã có trong danh sách hiện tại -> **Cộng dồn số lượng**.
   - Nếu mã hàng chưa có -> Thêm mới vào danh sách.
   - Hiển thị thông báo Toast thành công.

## 2. Thiết kế API
- `POST /api/purchase-orders/import`:
  - Nhận `multipart/form-data` chứa file Excel.
  - Sử dụng `exceljs` để phân tích workbook.
  - Tìm kiếm tiêu đề cột hoặc mặc định cột 1 = Mã hàng, cột 2 = Số lượng.
  - Query DB để đối chiếu sản phẩm: lấy `id, code, name, unit, basePrice, rawJson`.
  - Kiểm tra `raw.type !== 1 && raw.type !== 3`.
  - Phản hồi:
    ```json
    {
      "validItems": [
        { "productId": 1, "productCode": "SP01", "productName": "...", "unit": "...", "quantity": 10, "price": 50000, "amount": 500000 }
      ],
      "skippedItems": [
        { "rowNumber": 3, "code": "BDY", "reason": "Sản phẩm dịch vụ không được nhập kho" }
      ],
      "totalRows": 20,
      "validCount": 18,
      "skippedCount": 2
    }
    ```
- `GET /api/purchase-orders/import-template`:
  - Trả về file mẫu `Mau_Nhap_Hang_Yagami.xlsx` định dạng sẵn header tiếng Việt và các dòng mẫu minh họa.

## 3. Thiết kế Giao diện (UI/UX)
- Vị trí nút: Đặt cạnh ô tìm kiếm hàng hóa ở card "Chi tiết hàng hóa nhập".
  - Nút: `[FileSpreadsheet] Nhập Excel` (màu trắng/xám viền nhạt thanh lịch, hover nổi bật).
  - Tích hợp input file ẩn `accept=".xlsx,.xls"`.
- Modal Xem trước (Preview):
  - Tiêu đề: "Xem trước dữ liệu nhập từ Excel"
  - 3 Thẻ thống kê:
    - Tổng số dòng đọc được
    - Mặt hàng hợp lệ (màu xanh lá)
    - Dòng không hợp lệ / bỏ qua (màu cam)
  - Bảng danh sách hàng hóa hợp lệ kèm scrollbar gọn gàng.
  - Bảng/Alert danh sách mã bị bỏ qua kèm lý do cụ thể.
  - Nút "Tải file mẫu Excel" và nút "Xác nhận thêm vào phiếu nhập".

## 4. Các bước triển khai
- [x] Socratic Gate & Thống nhất các quyết định với người dùng.
- [ ] Tạo API route `app/api/purchase-orders/import/route.ts`.
- [ ] Tạo API route tải file mẫu `app/api/purchase-orders/import-template/route.ts`.
- [ ] Cập nhật `components/purchase/purchase-order-form.tsx`: Thêm nút Nhập Excel, input file, Modal xem trước, logic cộng dồn số lượng.
- [ ] Kiểm tra typecheck (`npx tsc --noEmit`).
- [ ] Rebuild và cập nhật docker web container.
- [ ] Kiểm thử và thông báo hoàn thành.
