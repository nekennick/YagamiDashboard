# Phân tích tồn kho theo ngày trên trang sản phẩm

## Mục tiêu

Thêm bảng tương đương `TONG_HOP_NGAY` vào `/products/[id]`, theo riêng từng kho Cao Lãnh/Bình Dương; tự tổng hợp bán, nhập, khách trả và chuyển kho; cho sửa `Tồn đầu`, `Tồn thực tế`, `Ghi chú` ở mọi ngày; dùng snapshot để nhận diện phần điều chỉnh chưa có chứng từ.

## Quyết định đã chốt

- Ngày nghiệp vụ dùng múi giờ `Asia/Ho_Chi_Minh`; timestamp lưu UTC.
- Không gọi KiotViet khi mở trang. Scheduler đồng bộ dữ liệu vào PostgreSQL, trang chỉ đọc DB nội bộ.
- `Đơn đặt hàng` không làm thay đổi `onHand`, nên không đưa vào sổ kho.
- `Điều chỉnh/chưa xác định = (snapshot cuối - snapshot đầu) - tổng quantityDelta có chứng từ`; không gọi đây là “Kiểm hàng”.
- `Tồn đầu` có override thì dùng override; không có thì lấy `Tồn cuối` ngày trước. Override ảnh hưởng các ngày sau cho đến override kế tiếp.
- Mức tin cậy mỗi ngày: `COMPLETE` (đủ snapshot, điều chỉnh = 0), `RECONCILED` (đủ snapshot, có điều chỉnh), `MISSING_SNAPSHOT` (thiếu mốc hoặc mốc cũ quá 60 phút).

## Công thức

`Nhập = PURCHASE + CUSTOMER_RETURN + TRANSFER_IN`; `Xuất = SALE + TRANSFER_OUT`; `Tồn cuối = Tồn đầu + Nhập - Xuất + Điều chỉnh`; `Dư/Thiếu = Tồn thực tế - Tồn cuối`; `Lệch trong ngày = Dư/Thiếu hôm nay - Dư/Thiếu hôm trước`; trạng thái là `CHƯA KIỂM/KHỚP/DƯ/THIẾU`.

## Công việc cho GPT-Terra

- [ ] **1. Bảo vệ worktree và xác minh payload API.** Không sửa/ghi đè thay đổi hiện có; sau khi bảo đảm chúng đã được lưu an toàn, tạo branch `feature/product-daily-inventory-analysis`. Gọi GET tối đa 5 bản ghi từ `/purchaseorders`, `/returns`, `/transfers` và endpoint chi tiết tương ứng; ghi lại field ID dòng, ngày, trạng thái, chi nhánh, sản phẩm, số lượng. Không gọi API ghi. → **Kiểm tra:** có fixture đã ẩn dữ liệu nhạy cảm và bảng ánh xạ trạng thái “tác động tồn/không tác động tồn”.
- [ ] **2. Thêm schema và migration PostgreSQL.** Trong `prisma/schema.prisma`, thêm `InventoryMovement` gồm `movementKey @unique`, `sourceType`, `sourceDocumentId`, `sourceLineKey`, `documentCode`, `occurredAt`, `productId`, `branchId`, `quantityDelta`, `status`, `partnerName?`, `isActive`, `rawJson`, timestamps; index `(productId, branchId, occurredAt)` và `(sourceType, sourceDocumentId)`. Thêm `ProductDailyInventoryEntry` gồm `productId`, `branchId`, `businessDate @db.Date`, `openingOverride?`, `actualOnHand?`, `note?`, timestamps, unique `(productId, branchId, businessDate)`. Thêm `ProductDailyInventoryAudit` lưu `entryId`, `previousJson?`, `nextJson`, `actor` mặc định `local-admin`, `createdAt`. Tạo migration mới, không sửa migration cũ. → **Kiểm tra:** `npx prisma validate` và `npx prisma generate` thành công.
- [ ] **3. Xây đồng bộ sổ kho idempotent.** Mở rộng `SyncType`, `/api/sync`, `lib/schedule.ts` và hai panel Settings với `purchases`, `returns`, `transfers`; đặt trong nhóm `transaction` 60 phút, buffer ít nhất 3 ngày. Tách parser vào `lib/kiotviet/inventory-movements.ts`; upsert theo `movementKey`, vô hiệu hóa movement khi chứng từ hủy. Transfer tạo hai chân độc lập: âm ở kho gửi theo ngày gửi, dương ở kho nhận theo ngày nhận; chỉ ghi chân đã phát sinh theo trạng thái thật của payload. Sau mỗi sync hóa đơn, dựng/cập nhật `SALE` từ `Invoice/InvoiceItem` trạng thái `Hoàn thành`. → **Kiểm tra:** chạy sync hai lần không tăng số movement; hủy chứng từ làm movement `isActive=false`; tổng từng loại đúng với 5 chứng từ mẫu.
- [ ] **4. Backfill lịch sử 90 ngày và bộ tính thuần.** Thêm tác vụ history chạy thủ công theo tháng cho ba API mới và backfill `SALE` từ hóa đơn hiện có. Viết `lib/inventory-ledger.ts` trả về từng ngày: snapshot đầu/cuối gần biên ngày, nhập, xuất, điều chỉnh, tồn cuối, tồn thực tế, dư/thiếu, lệch ngày, trạng thái, confidence và danh sách giao dịch. Không dùng snapshot cũ hơn 60 phút để gắn `COMPLETE/RECONCILED`. → **Kiểm tra:** bộ dữ liệu mẫu Excel cho ra đúng các công thức; ngày thiếu snapshot được cảnh báo thay vì tự điền 0.
- [ ] **5. Thêm API nội bộ có kiểm tra dữ liệu.** Tạo `GET /api/products/[id]/daily-inventory?branchId=&from=&to=` (tối đa 366 ngày) và `PUT /api/products/[id]/daily-inventory/[date]`. PUT chỉ nhận số hữu hạn hoặc `null`, ghi chú giới hạn 1.000 ký tự, kiểm tra product/branch/date, cập nhật entry và audit trong một transaction; hỗ trợ `expectedUpdatedAt` và trả `409` nếu sửa đồng thời. → **Kiểm tra:** GET sai tham số trả 400, sản phẩm không tồn tại trả 404, PUT rồi GET giữ đúng số `0`, số âm và ghi chú Unicode.
- [ ] **6. Làm giao diện trang chi tiết sản phẩm.** Tạo `components/products/product-daily-inventory-analysis.tsx`, gắn vào cuối phần tổng quan trong `app/products/[id]/page.tsx`. Có chọn kho, khoảng ngày mặc định 30 ngày, bảng 11 cột như Excel, sticky header, màu trạng thái, tooltip nguồn công thức; `Tồn đầu/Tồn thực tế/Ghi chú` sửa inline và lưu rõ trạng thái. Thêm khu “Giao dịch” thu gọn mặc định, hiển thị thời gian, chứng từ, loại, tăng/giảm, đối tác và nguồn; không thêm cột ngoài bảng Excel chính. → **Kiểm tra:** đổi kho không trộn dữ liệu; lưu một dòng không tải lại toàn trang; mobile cuộn ngang được; lỗi lưu giữ nguyên nội dung đang nhập.
- [ ] **7. Kiểm thử tự động và đối soát.** Thêm Vitest cùng test cho timezone, override nối chuỗi, transfer hai chân, chứng từ hủy, điều chỉnh âm/dương, thiếu snapshot, tồn thực tế bằng 0 và lệch ngày. Chọn ít nhất 2 sản phẩm ở mỗi kho, đối chiếu tổng movement với chứng từ KiotViet và snapshot trong 3 ngày; ghi sai lệch còn lại theo loại. → **Kiểm tra:** test, `npm run lint` và `npm run build` đều đạt.
- [ ] **8. Triển khai an toàn.** Backup PostgreSQL; chạy migration bằng `npx prisma migrate deploy` trước khi khởi động image mới; chạy backfill theo từng tháng, theo dõi `SyncLog`, sau đó mới bật ba sync type trong nhóm giao dịch. Không xóa snapshot hoặc scheduler cũ. → **Kiểm tra:** restart container không mất entry nhập tay; sync tự động thành công; rollback image cũ vẫn giữ được các bảng mới và không ảnh hưởng trang khác.

## Hoàn thành khi

- Hai kho xem độc lập, số nhập/xuất có thể truy ngược đến chứng từ.
- Người dùng sửa được ba trường thủ công ở mọi ngày và có audit.
- Phần không có API được ghi rõ `Điều chỉnh/chưa xác định` cùng mức tin cậy.
- Các trang và scheduler hiện tại tiếp tục hoạt động; không phát sinh gọi KiotViet từ frontend.

