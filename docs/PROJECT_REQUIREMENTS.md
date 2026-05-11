# KiotViet Local Analytics Dashboard

## 1. Mục tiêu dự án

Xây dựng webapp dashboard chạy local trên máy tính để đồng bộ dữ liệu từ KiotViet Public API về hệ thống local, sau đó hiển thị và phân tích:

- Sản phẩm
- Hóa đơn đã bán
- Khách hàng
- Tồn kho theo từng chi nhánh
- Tần suất đặt hàng của khách hàng
- Tần suất sản phẩm được đặt
- Phân tích sản phẩm đa chiều
- Xuất Excel báo cáo

Ứng dụng chỉ chạy local, không cần đăng nhập, không cần SaaS, không cần multi-user phức tạp.

## 2. Nguyên tắc build

Bắt buộc làm theo từng giai đoạn. Không được build toàn bộ ngay từ đầu.

Thứ tự bắt buộc:

1. Test KiotViet API trước
2. Xác nhận lấy được token
3. Xác nhận lấy được sản phẩm
4. Xác nhận lấy được hóa đơn đã bán
5. Xác nhận lấy được khách hàng
6. Xác nhận lấy được tồn kho theo chi nhánh
7. Sau khi API thông mới build database
8. Sau khi database ổn mới build giao diện
9. Sau khi giao diện ổn mới đấu nối sync thật
10. Sau cùng mới làm phân tích và export Excel

Không được tự ý thêm tính năng lớn ngoài scope.

## 3. Công nghệ sử dụng

- App: Next.js 15
- Language: TypeScript
- UI: TailwindCSS + shadcn/ui
- Table: TanStack Table
- Chart: Recharts
- Database local: PostgreSQL
- ORM: Prisma
- Export Excel: ExcelJS
- API client: fetch hoặc axios, ưu tiên đơn giản và dễ debug

## 4. Không sử dụng ở giai đoạn đầu

Không dùng Turborepo, Redis, Docker, Kubernetes, microservice, login system, SaaS multi-tenant, AI assistant, hoặc phân tích quy cách thùng/túi/hộp.

## 5. Cấu trúc thư mục đề xuất

```txt
app/
  page.tsx
  products/
  invoices/
  customers/
  inventory/
  analytics/
  settings/
  api/
components/
  layout/
  dashboard/
  tables/
  charts/
  ui/
lib/
  kiotviet/
  prisma.ts
  date.ts
  analytics.ts
  excel.ts
prisma/
  schema.prisma
docs/
  PROJECT_REQUIREMENTS.md
.env.example
package.json
README.md
```

## 6. Cấu hình KiotViet

Tạo file `.env` từ `.env.example`:

```env
KIOTVIET_CLIENT_ID=
KIOTVIET_CLIENT_SECRET=
KIOTVIET_RETAILER=
KIOTVIET_AUTH_URL=https://id.kiotviet.vn/connect/token
KIOTVIET_API_URL=https://public.kiotapi.com
```

Không hardcode API key trong code.

## 7. Giai đoạn 1 - Test API riêng trước

Route: `/settings/api-test`

Nút test:

- Test lấy Access Token
- Test lấy danh sách sản phẩm
- Test lấy khách hàng
- Test lấy hóa đơn đã bán
- Test lấy tồn kho

Kết quả cần hiển thị:

- Thành công / thất bại
- HTTP status
- Message lỗi nếu có
- Tổng số record nhận được
- JSON preview 5 dòng đầu

Chưa lưu database ở giai đoạn này. Mục tiêu là xác nhận API thông trước khi build tiếp.

## 8. Giai đoạn 2 - Database local

Dùng Prisma + PostgreSQL. Các bảng chính:

- Product
- Customer
- Branch
- Invoice
- InvoiceItem
- InventorySnapshot
- SyncLog
- AppSetting

Các bảng cần lưu `rawJson` để debug, có index phù hợp, không tạo trùng dữ liệu, và hỗ trợ upsert.

## 9. Giai đoạn 3 - Sync dữ liệu

Route: `/settings/sync`

Nút sync:

- Sync sản phẩm
- Sync khách hàng
- Sync chi nhánh
- Sync hóa đơn
- Sync tồn kho
- Sync tất cả

Yêu cầu: có phân trang API, upsert dữ liệu, lưu raw JSON, try/catch rõ ràng, thông báo lỗi dễ hiểu, và hiển thị log tiến trình.

## 10. Dashboard chính

Trang chủ hiển thị KPI cards:

- Tổng doanh thu theo khung thời gian
- Tổng số hóa đơn
- Tổng khách hàng có mua
- Tổng sản phẩm đã bán
- Top sản phẩm bán chạy
- Sản phẩm tồn kho thấp

Bộ lọc thời gian: hôm nay, 7 ngày, 30 ngày, tháng này, tháng trước, 3 tháng, 6 tháng, năm nay, tùy chọn từ ngày đến ngày.

## 11. Các trang dữ liệu

Trang `/products`: bảng sản phẩm, filter theo tên, mã, nhóm hàng, chi nhánh, thời gian, export Excel.

Trang `/customers`: bảng khách hàng, tổng doanh thu, tổng hóa đơn, tổng sản phẩm đã mua, lần mua gần nhất, sản phẩm mua nhiều nhất, click xem chi tiết.

Trang `/inventory`: tồn kho theo từng chi nhánh, filter theo chi nhánh, sản phẩm, nhóm hàng, tình trạng tồn, export Excel.

## 12. Analytics

Route `/analytics/customer-frequency`: phân tích tần suất đặt hàng của khách theo tháng, có filter và export Excel.

Route `/analytics/product-frequency`: phân tích tổng số lượng bán, số lần xuất hiện trong hóa đơn, doanh thu, khách hàng đã mua, chi nhánh bán nhiều nhất, biểu đồ top 10 và export Excel.

## 13. Lịch sync tự động

Route `/settings/schedule`

Cho phép bật/tắt auto sync, chọn chu kỳ 30 phút, 1 giờ, 3 giờ, mỗi ngày, chọn loại dữ liệu sync. Lưu cấu hình trong database. Auto sync chỉ chạy khi app local đang chạy.

## 14. UI Layout

Sidebar gồm Dashboard, Sản phẩm, Khách hàng, Hóa đơn, Tồn kho, Phân tích khách hàng, Phân tích sản phẩm, Đồng bộ dữ liệu, Cài đặt API.

Giao diện sạch, dễ nhìn, responsive, không màu mè, ưu tiên bảng dữ liệu rõ ràng.

## 15. Roadmap build

1. Khởi tạo Next.js project, Tailwind, shadcn/ui, Prisma, PostgreSQL
2. Làm trang test KiotViet API
3. Thiết kế database Prisma schema
4. Làm sync sản phẩm, khách hàng, chi nhánh, hóa đơn, tồn kho
5. Làm dashboard tổng
6. Làm trang sản phẩm, khách hàng, hóa đơn, tồn kho
7. Làm phân tích tần suất khách hàng
8. Làm phân tích tần suất sản phẩm
9. Làm export Excel
10. Làm lịch sync tự động
11. Tối ưu UI, filter, loading, empty state, error state

## 16. Định nghĩa hoàn thành MVP

MVP hoàn thành khi nhập API key KiotViet được, test token thành công, lấy được sản phẩm, khách hàng, hóa đơn đã bán, tồn kho theo chi nhánh, sync vào PostgreSQL, dashboard hiển thị dữ liệu thật, có analytics, export Excel, sync thủ công và lịch sync tự động khi app đang chạy.
