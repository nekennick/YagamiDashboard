# Kế hoạch phát triển Tính năng Nhập hàng (Purchase Orders)

## Mục tiêu
Xây dựng phân hệ **Nhập hàng** cho phép Quản lý (ADMIN) tạo phiếu nhập hàng, tự động điền đơn giá bán (`basePrice`), đồng bộ trực tiếp 2 chiều với KiotViet Public API (`/purchaseorders`), tự động kích hoạt in phiếu nhập chuẩn theo biểu mẫu KiotViet (file mẫu PDF), và cho phép tùy biến thông tin mẫu in linh hoạt qua cài đặt.

---

## Phân tích & Đặc tả yêu cầu từ khảo sát

1. **Luồng dữ liệu & KiotViet API**:
   - `POST /purchaseorders`: Đẩy phiếu nhập mới lên KiotViet khi tạo phiếu thành công (lưu lại `PurchaseOrderId` và mã `code` từ KiotViet).
   - `GET /purchaseorders`: Đồng bộ danh sách phiếu nhập từ KiotViet về local để đối soát, tìm kiếm và in lại bất kỳ lúc nào.
   - `GET /suppliers`: Lấy danh bạ Nhà cung cấp từ KiotViet về danh mục chọn nhanh khi lập phiếu.
2. **Cơ chế tính giá & sản phẩm**:
   - Người dùng tìm/chọn hàng hóa (theo mã SKU hoặc tên), chỉ cần gõ **Số lượng**.
   - **Đơn giá** tự động lấy từ `basePrice` (giá niêm yết/giá bán lẻ hiện tại của sản phẩm trên KiotViet/Local DB).
   - Tự động tính Thành tiền = Số lượng × Đơn giá, cộng dồn Tổng tiền hàng và chuyển đổi tự động ra "Tổng tiền hàng (bằng chữ)".
3. **Mẫu in (Bám sát file `KiotViet - Mua hàng - Nhập hàng.pdf`)**:
   - Tiêu đề công ty, tên kho/chi nhánh, Mẫu số 01 - VT (Thông tư 99/2025/TT-BTC).
   - Mã phiếu (VD: PN002542), Ngày giờ lập, Người giao, Chi nhánh nhập, Địa chỉ kho.
   - Bảng 7 cột: `STT | Mã hàng | Tên hàng | Số lượng | ĐVT | Đơn giá | Thành tiền`.
   - Dòng ghi chú nội bộ bắt buộc: *“Đơn giá và thành tiền trên phiếu chỉ phục vụ quản lý nội bộ theo giá bán; không phải giá nhập, giá vốn hoặc căn cứ ghi sổ kế toán.”*
   - Khối tổng kết: Tổng tiền hàng, Tổng tiền bằng chữ.
   - 4 ô chữ ký: Người lập phiếu, Người giao hàng, Thủ kho, Kế toán trưởng.
4. **Tùy biến mẫu in (Mức cấu hình)**:
   - Cung cấp trang/khối cấu hình trong Cài đặt hoặc ngay trên modal in: Cho phép chỉnh sửa Tên công ty, Tên kho mặc định, Địa chỉ, Ghi chú chân trang, và tùy chọn hiển thị logo.
5. **Trải nghiệm người dùng & Phân quyền**:
   - Phân quyền: Chỉ tài khoản `ADMIN` / Quản lý mới thấy tab và có quyền tạo/xem phiếu.
   - Tạo xong tự động mở lệnh in (`window.print()` hoặc cửa sổ xem trước in).

---

## Danh sách công việc (Tasks)

- [x] **Task 1: Cấu trúc cơ sở dữ liệu (Prisma Schema)**  
  Tạo các model `PurchaseOrder`, `PurchaseOrderItem`, `Supplier` và bổ sung cấu hình mẫu in vào `AppSetting`.  
  → *Verify:* Chạy `npx prisma db push` thành công, Prisma Client sinh đủ type.

- [x] **Task 2: KiotViet Service Integration (`lib/kiotviet/purchase.ts`)**  
  Bổ sung hàm gọi API: `createPurchaseOrderOnKiotViet(payload)` (`POST /purchaseorders`), `syncPurchaseOrdersFromKiotViet()` (`GET /purchaseorders`), và `syncSuppliersFromKiotViet()` (`GET /suppliers`).  
  → *Verify:* Đã viết hàm tích hợp KiotViet client đầy đủ và type-safe.

- [x] **Task 3: Backend API Routes (`/api/purchase-orders`, `/api/suppliers`, `/api/settings/print-template`)**  
  - `GET /api/suppliers`: Lấy danh sách nhà cung cấp (từ DB local + sync KiotViet).  
  - `GET /api/purchase-orders`: Lấy danh sách phiếu nhập có phân trang, lọc theo chi nhánh/ngày.  
  - `POST /api/purchase-orders`: Validate dữ liệu, tự động lấy `basePrice`, lưu local DB và gửi `POST` đồng bộ lên KiotViet.  
  - `POST /api/purchase-orders/[id]`: Hỗ trợ retry sync khi ngoại tuyến.  
  → *Verify:* Typecheck và logic xử lý an toàn, tự động sinh mã phiếu, fallback nội bộ khi mất kết nối KiotViet.

- [x] **Task 4: Component Mẫu in & Thiết lập in (`components/purchase/purchase-order-print.tsx`)**  
  Thiết kế component in chuẩn khổ A4/A5 bằng CSS `@media print`, khớp 100% mẫu trong PDF (Mẫu số 01-VT, thông tư 99/2025/TT-BTC, bảng hàng hóa, ghi chú nội bộ, 4 ô chữ ký, tổng tiền bằng chữ).  
  → *Verify:* Đã test thuật toán `numberToVietnameseWords` và layout in A4 sắc nét.

- [x] **Task 5: Giao diện tạo phiếu nhập hàng (`components/purchase/purchase-order-form.tsx`)**  
  - Chọn Chi nhánh nhập (dropdown).  
  - Chọn Ngày nhập (date picker).  
  - Chọn/Nhập Nhà cung cấp & Người giao hàng.  
  - Ô tìm kiếm chọn nhanh sản phẩm (hỗ trợ gợi ý thông minh).  
  - Bảng chi tiết sản phẩm: Chỉ cần nhập Số lượng → Đơn giá tự động điền `basePrice` → Thành tiền nhảy tự động.  
  - Nút "Lưu & In ngay" và nút "Chỉ lưu phiếu".  
  → *Verify:* Tính toán cộng dồn tổng số lượng, thành tiền, tổng tiền bằng chữ tự động.

- [x] **Task 6: Tab Nhập hàng & Danh sách phiếu (`app/purchase-orders/page.tsx` & Sidebar)**  
  - Thêm mục "Nhập hàng" vào `layout/AppSidebar.tsx` với icon nhập kho (chỉ hiển thị cho `ADMIN`).  
  - Bảng danh sách các phiếu nhập đã tạo/sync về từ KiotViet, lọc theo ngày/kho/trạng thái.  
  - Nút xem lại và in lại phiếu cũ bất cứ lúc nào.  
  → *Verify:* Middleware và Session guard chỉ cho phép ADMIN truy cập.

- [x] **Task 7: Giao diện Cài đặt mẫu in (`components/purchase/purchase-print-settings.tsx`)**  
  Cho phép quản lý cấu hình các trường thông tin trên phiếu in: Tên công ty/đơn vị, Mã số mẫu, Địa chỉ mặc định, Ghi chú pháp lý/nội bộ, Chân trang.  
  → *Verify:* Tích hợp API lưu vào `AppSetting` và cập nhật tức thì.

- [x] **Task 8: Kiểm thử toàn diện & Verification cuối cùng**  
  - Test tạo phiếu nhập thực tế với dữ liệu thật.  
  - Chạy `npx tsc --noEmit` đạt 0 lỗi typecheck.  
  - Chạy script test number to words và Prisma schema pass 100%.  
  → *Verify:* Hệ thống hoạt động trơn tru, ổn định và sẵn sàng sử dụng.

---

## Tiêu chí hoàn thành (Done When)
- [x] Tab "Nhập hàng" xuất hiện trên Sidebar cho Quản lý.
- [x] Người nhập chỉ cần gõ số lượng, đơn giá tự động lấy từ giá bán `basePrice` của KiotViet.
- [x] Phiếu nhập đồng bộ thành công lên hệ thống KiotViet và lưu trữ đầy đủ tại local DB.
- [x] Bản in ra giấy/PDF giống hệt biểu mẫu trong file `KiotViet - Mua hàng - Nhập hàng.pdf`.
- [x] Có thể tùy chỉnh tiêu đề, tên kho, địa chỉ, ghi chú mẫu in dễ dàng.
- [x] Tạo xong phiếu là tự động bật lệnh in ngay.
