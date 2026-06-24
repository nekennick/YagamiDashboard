# Local Schema Reference

Use this reference when answering Yagami business analysis questions. Always verify the current schema if code has changed.

## Database

- Default workspace: `D:\github\YagamiDashboard`
- SQLite URL is usually in `.env` as `DATABASE_URL="file:./dev.db"`, resolved relative to `prisma/`.
- Main DB file observed: `prisma/dev.db`.

## Core Tables

### Product

Fields: `id`, `kvProductId`, `code`, `name`, `fullName`, `categoryName`, `basePrice`, `cost`, `unit`, `isActive`.

Use for product names, codes, groups, and product lookup.

### Customer

Fields: `id`, `kvCustomerId`, `code`, `name`, `contactNumber`, `address`.

Use for branch/customer questions. In this dataset many franchise branches are represented as customers, e.g. `YAGAMI CAO LÃNH`.

### Branch

Fields: `id`, `kvBranchId`, `name`, `address`.

Use for KiotViet selling/warehouse branch, commonly `Tổng kho YAGAMI` or warehouse branch names.

### Invoice

Fields: `id`, `kvInvoiceId`, `code`, `customerId`, `branchId`, `purchaseDate`, `total`, `discount`, `status`, `rawJson`.

Known statuses observed in local data:

- `Hoàn thành`
- `Đã hủy`
- `Đang xử lý`

For revenue and sold goods, filter `status = 'Hoàn thành'` unless the user asks otherwise.

### InvoiceItem

Fields: `id`, `invoiceId`, `productId`, `quantity`, `price`, `discount`, `subtotal`, `rawJson`.

Use with `Invoice` and `Product` for sold quantity/revenue by product/customer/period.

### Order

Fields: `id`, `kvOrderId`, `code`, `customerId`, `branchId`, `purchaseDate`, `createdDate`, `modifiedDate`, `total`, `totalPayment`, `discount`, `status`, `statusValue`, `description`, `rawJson`.

Known KiotViet order status for temporary orders:

- `Phiếu tạm` with numeric status `1`

Use `statusValue = 'Phiếu tạm'` for pending/temporary order questions.

### OrderItem

Fields: `id`, `orderId`, `productId`, `productCode`, `productName`, `quantity`, `price`, `discount`, `subtotal`, `rawJson`.

Use with `Order` and `Product` for ordered quantity, not completed sales.

### InventorySnapshot

Fields: `id`, `snapshotDate`, `productId`, `branchId`, `onHand`, `reserved`, `actualReserved`, `rawJson`.

Use the latest `snapshotDate` as the current inventory snapshot. Do not sum across all snapshot dates unless the user asks for historical snapshots.

### SyncLog and AppSetting

Use `SyncLog` and `AppSetting` to cite freshness, last sync, and failures. `AppSetting.orderRecentSyncedAt` may indicate the latest order sync.

## Caveats

- Full receivables/debt ledger is not guaranteed in the current schema. Do not claim true customer debt unless payment data has been synced. If using unpaid order approximation, label it clearly.
- If `Order`/`OrderItem` are empty, ask to run order sync before analyzing temporary orders.
- If inventory has multiple snapshots, use only the latest snapshot date for current stock analysis.


## Branch Identity and Warehouse Ownership

Use `references/branch-warehouse-map.json` as the canonical source for branch aliases, KiotViet customer codes, warehouse ownership, active/planned status, external vehicle routes, and deprecated customer codes. Do not infer warehouse ownership from geography when the map has an explicit assignment.
