# Tab Kiểm kho và cân bằng tồn KiotViet

## Mục tiêu

Xây tab **Kiểm kho** tại `/inventory-count`, tách biệt hoàn toàn với `/stocktake` (Kiểm tồn), tối ưu cho nhân viên thao tác trên điện thoại; kết quả được quản lý duyệt, chọn từng dòng đưa vào danh sách chờ và chỉ cân bằng KiotViet khi toàn bộ phiếu còn hợp lệ.

## Quyết định đã chốt

- Giữ nguyên `/stocktake`; thêm tab mới `/inventory-count` tên **Kiểm kho**.
- ADMIN có toàn quyền. MEMBER được cấp riêng các quyền `COUNT_EXECUTE`, `COUNT_MANAGE`, `COUNT_BALANCE`; API luôn kiểm tra quyền phía server.
- Phân công theo `sản phẩm + kho`; một tổ hợp chỉ thuộc một nhân viên và không nằm trong hai phiên chưa kết thúc.
- Nhân viên chỉ thấy sản phẩm được giao, không thấy tồn hệ thống trước khi gửi; số kiểm thực tế lưu riêng theo từng dòng.
- Lưu nháp từng dòng, gửi cả phiên; quản lý chỉ duyệt hoặc trả cả phiên để kiểm lại, không sửa số thay nhân viên.
- Dòng đã duyệt không tự cân bằng: quản lý chọn từng dòng vào danh sách chờ; một lần cân bằng tạo đúng một phiếu KiotViet cho một kho.
- Mốc chống thay đổi là lúc nhân viên bấm **Gửi kết quả**. Chỉ một dòng phát sinh biến động sau mốc này thì dừng toàn bộ phiếu trước khi gọi KiotViet.
- Trước khi cân bằng, tab Tồn kho hiển thị chênh lệch màu cam kèm trạng thái **Chờ cân bằng**; không trộn vào biến động kiểm kê chính thức. Sau khi KiotViet cân bằng và sync thành công, trạng thái chờ biến mất và cột Kiểm kê lấy movement `STOCKTAKE` chính thức.
- Chưa triển khai quét mã vạch. Cho nhập số thập phân bằng `,` hoặc `.`, không cho số âm, số `0` phải xác nhận.

## Kiến trúc và dữ liệu

Tiếp tục dùng Next.js 15 + Prisma/PostgreSQL theo mô hình modular monolith. Thêm các bảng sau:

| Bảng | Trách nhiệm chính |
|---|---|
| `UserPermission` | Quyền riêng theo user; unique `(userId, permission)` |
| `InventoryCountAssignment` | Người phụ trách hiện tại; unique `(productId, branchId)`; có người phân công và thời gian cập nhật |
| `InventoryCountAssignmentAudit` | Lịch sử giao, đổi hoặc thu hồi phân công |
| `InventoryCountSession` | Phiên kiểm theo một nhân viên và một kho; lưu trạng thái, người tạo/duyệt, thời điểm gửi và lý do trả lại |
| `InventoryCountLine` | Sản phẩm, số thực tế, tồn hệ thống tại lúc gửi, chênh lệch, phiên bản dữ liệu và khóa chống trùng phiên |
| `InventoryPositionVersion` | Version theo `(productId, branchId)`, tăng khi sync phát hiện bất kỳ thay đổi ảnh hưởng tồn |
| `InventoryBalanceBatch` | Một lần cân bằng của một kho; lưu trạng thái gọi KiotViet, mã/ID phiếu và lỗi đã làm sạch secret |
| `InventoryBalanceBatchLine` | Các dòng được chọn vào phiếu; snapshot số kiểm và version để không bị thay đổi ngầm |
| `InventoryCountAudit` | Nhật ký bất biến cho tạo phiên, lưu nháp, gửi, trả lại, duyệt, thêm hàng chờ và cân bằng |

`InventoryCountLine.activeLockKey` là khóa unique nullable dạng `branchId:productId`. Mỗi dòng có trạng thái xử lý `COUNTING`, `AWAITING_DECISION`, `QUEUED`, `NO_ADJUSTMENT`, `BALANCED`, `DISMISSED`, `CANCELLED`; khóa chỉ được giải phóng ở trạng thái cuối. `DISMISSED` bắt buộc có lý do và người thao tác. Mọi số lượng dùng `Decimal`, không dùng số thực JavaScript để tính nghiệp vụ.

Luồng phiên: `DRAFT → IN_PROGRESS → SUBMITTED → APPROVED → COMPLETED`; nhánh sửa là `SUBMITTED → RETURNED → IN_PROGRESS`, nhánh kết thúc là `CANCELLED`. Phiên chỉ `COMPLETED` khi mọi dòng đã `NO_ADJUSTMENT`, `BALANCED`, `DISMISSED` hoặc `CANCELLED`. Luồng phiếu cân bằng: `PENDING → VALIDATING → REMOTE_DRAFT → BALANCING → BALANCED_SYNC_PENDING → BALANCED`; lỗi dữ liệu trước khi tạo phiếu thành `STALE`, lỗi sau khi đã có phiếu nháp thành `REMOTE_DRAFT_STALE`, lỗi kết nối thành `FAILED_RETRYABLE`.

## Công việc

- Thực hiện toàn bộ thay đổi trên nhánh riêng `feature/inventory-count-workflow`; không trộn với các sửa lỗi tồn kho đang dang dở.

- [ ] **1. Migration và lớp nghiệp vụ** — thêm schema trên, quan hệ vào `User/Product/Branch`, index theo `(assigneeId,status)`, `(branchId,status)`, `(productId,branchId)` và migration an toàn. Viết service chuyển trạng thái theo transaction, không cho sửa dòng sau khi gửi nếu chưa bị trả lại. **Kiểm tra:** migration chạy trên bản sao DB; constraint chặn hai phân công và hai phiên mở cho cùng sản phẩm+kho.

- [ ] **2. Phân quyền theo người dùng** — thêm helper `requirePermission`, API cấp/thu quyền và giao diện trong `/settings/users`; ADMIN mặc định có cả ba quyền, MEMBER chỉ thao tác đúng quyền và đúng assignment. Thêm `/inventory-count` vào sidebar nhưng không dùng chung quyền `/stocktake`; cookie chỉ phục vụ hiển thị, API/server guard mới là nguồn quyết định. **Kiểm tra:** nhân viên không gọi được API quản lý/cân bằng bằng URL hoặc request thủ công.

- [ ] **3. Quản lý phân công và phiên kiểm** — tạo API/giao diện để quản lý chọn kho, nhân viên và các sản phẩm đã phân công rồi mở phiên; chặn sản phẩm đang khóa ở phiên khác. Cho thu hồi/đổi người phụ trách khi không có phiên mở và ghi audit đầy đủ. **Kiểm tra:** hai quản lý tạo trùng đồng thời thì chỉ một transaction thành công.

- [ ] **4. Giao diện nhân viên mobile-first** — trang một cột gồm tên kho, tiến độ `đã kiểm/tổng`, tìm nhanh, các thẻ sản phẩm với tên/đơn vị/ô số lớn và thanh hành động dưới màn hình. Tồn hệ thống bị ẩn; mục đã lưu có dấu xác nhận, lỗi có nút thử lại. Autosave lên server và lưu bản nháp dự phòng trong `localStorage`, khôi phục khi có mạng; gửi toàn phiên phải xác nhận các dòng bằng 0. **Kiểm tra:** thao tác được ở màn hình 360px, target chạm tối thiểu 44px, reload/mất mạng ngắn không mất số đã nhập.

- [ ] **5. Gửi, đối chiếu và duyệt** — khi gửi toàn phiên, backend chốt `submittedAt`, refresh tồn mới nhất của đúng kho/sản phẩm rồi lưu `systemOnHandAtSubmit`, `actualCount`, `difference` và `inventoryVersionAtSubmit`; nếu không lấy được tồn đủ mới thì không nhận gửi. Quản lý thấy tồn hệ thống, số đếm, chênh lệch; chỉ được duyệt hoặc trả cả phiên kèm lý do. Dòng chênh `0` thành `NO_ADJUSTMENT`; dòng có chênh thành `AWAITING_DECISION`. **Kiểm tra:** nhân viên không thấy tồn trước gửi; quản lý không thể sửa `actualCount`.

- [ ] **6. Theo dõi version và danh sách chờ** — cập nhật các luồng sync hóa đơn, nhập/trả hàng, chuyển kho, xuất dùng, kiểm kê và snapshot để tăng `InventoryPositionVersion` chỉ khi nguồn hoặc tồn thực sự thay đổi. Quản lý chọn riêng dòng `AWAITING_DECISION` cùng một kho vào batch hoặc đánh dấu `DISMISSED` kèm lý do; dòng đã `QUEUED` không được vào batch khác. Tab Tồn kho ghép dòng pending theo ngày gửi và hiển thị màu cam `±N · Chờ cân bằng`. **Kiểm tra:** pending không làm thay đổi công thức tồn cuối hay tạo `InventoryMovement`.

- [ ] **7. Client ghi KiotViet an toàn** — từ hai mẫu **Copy as cURL** của thao tác tạo/lưu phiếu và cân bằng, viết backend client dùng Docker secret, timeout và lỗi hết phiên; tuyệt đối không đưa cookie/header lên frontend, DB hay log. Gắn marker duy nhất `YAGAMI-COUNT-{batchId}` trong mô tả và tra cứu marker trước khi retry để không tạo phiếu trùng. Bật qua feature flag `KIOTVIET_STOCKTAKE_WRITE_ENABLED`. **Kiểm tra:** mock timeout sau khi tạo phiếu vẫn tìm lại đúng remote draft thay vì tạo phiếu mới.

- [ ] **8. Cân bằng all-or-nothing** — khi bấm **Cân bằng kho**, khóa batch, chạy sync mới nhất, so version toàn bộ dòng; một dòng đổi thì cả batch thành `STALE` và chưa gọi API ghi. Nếu hợp lệ, tạo một phiếu nháp cho một kho, refresh/so version lần nữa ngay trước lệnh cân bằng; nếu lúc này có thay đổi thì giữ phiếu nháp, chuyển `REMOTE_DRAFT_STALE` và tuyệt đối không cân bằng. Nếu remote đã thành công nhưng sync về lỗi, giữ `BALANCED_SYNC_PENDING` và chỉ retry sync; sau khi sync thấy đúng `StocktakeDocument/StocktakeLine`, mới đánh dấu dòng/batch `BALANCED` và bỏ trạng thái chờ. **Kiểm tra:** double-click/request lặp không tạo hai phiếu; lỗi giữa hai bước có thể tiếp tục an toàn.

- [ ] **9. Kiểm thử và phát hành theo tầng** — unit test decimal/trạng thái/quyền/version; integration test API và KiotViet mock; E2E cho nhân viên, quản lý, trả kiểm và batch stale; chạy `npm run test`, `npm run lint`, `npm run build`. Triển khai migration trước, chạy chế độ chỉ đọc/dry-run, sau đó thử một phiếu nhỏ có phê duyệt trực tiếp rồi mới bật ghi thật. **Kiểm tra:** audit truy ra được ai đếm, ai duyệt, ai cân bằng, request nào và mã phiếu KiotViet nào.

## Điều kiện hoàn tất

- Nhân viên chỉ kiểm được sản phẩm+kho của mình và không thể biết tồn hệ thống trước lúc gửi.
- Số đếm thực tế, số hệ thống tại lúc gửi và chênh lệch được lưu riêng, truy vết được mọi lần gửi lại.
- Dữ liệu phát sinh sau lúc gửi làm dừng toàn bộ batch trước khi KiotViet bị thay đổi.
- Mỗi batch tạo tối đa một phiếu KiotViet; cookie hết hạn, timeout hoặc sync lỗi đều không làm mất hàng chờ hay ghi nhận cân bằng giả.
- Tab Tồn kho phân biệt rõ **chờ cân bằng** với movement kiểm kê đã có hiệu lực.

## Phụ thuộc trước khi làm phần ghi thật

Anh cung cấp hai request **Copy as cURL** từ Network của đúng tài khoản có quyền kiểm kho: (1) lưu/tạo phiếu kiểm kho và (2) cân bằng kho. Khi chưa có hai request này vẫn có thể hoàn thành schema, phân quyền, giao diện, quy trình duyệt và chế độ dry-run; không được suy đoán payload ghi lên KiotViet.
