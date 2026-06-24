# Analysis Playbook

Use these patterns as starting points. Adjust filters and ranges to match the user question.

## Date Ranges

State exact ranges in the answer.

- Today: local date `00:00:00` to next day `00:00:00` in Asia/Saigon.
- This month: first day of current month to now, unless the user asks full month.
- Last month: first day of previous month to first day of current month.
- This week: Monday to now.
- Previous week: previous Monday to current Monday.

Use ISO-like SQLite strings when querying stored DateTime values.

## Product Ordered Most By Customer/Branch

Question: `Tháng này chi nhánh nào đặt nhiều Mì Yagami nhất?`

Use `Order` + `OrderItem` + `Customer` and filter `Order.statusValue = 'Phiếu tạm'`.

```sql
SELECT
  c.code AS customerCode,
  c.name AS customerName,
  SUM(oi.quantity) AS quantity,
  SUM(oi.quantity * oi.price - oi.discount) AS value,
  COUNT(DISTINCT o.id) AS orderCount
FROM "OrderItem" oi
JOIN "Order" o ON o.id = oi.orderId
LEFT JOIN "Customer" c ON c.id = o.customerId
LEFT JOIN "Product" p ON p.id = oi.productId
WHERE o.statusValue = 'Phiếu tạm'
  AND o.purchaseDate >= :fromDate
  AND o.purchaseDate < :toDate
  AND (p.name LIKE :product OR oi.productName LIKE :product OR p.code LIKE :product OR oi.productCode LIKE :product)
GROUP BY c.code, c.name
ORDER BY quantity DESC
LIMIT 10;
```

## Completed Revenue Comparison

Question: `So sánh doanh thu tuần này với tuần trước`

Use `Invoice.status = 'Hoàn thành'`.

```sql
SELECT
  'current' AS period,
  COUNT(*) AS invoiceCount,
  SUM(total) AS revenue
FROM "Invoice"
WHERE status = 'Hoàn thành' AND purchaseDate >= :currentFrom AND purchaseDate < :currentTo
UNION ALL
SELECT
  'previous' AS period,
  COUNT(*) AS invoiceCount,
  SUM(total) AS revenue
FROM "Invoice"
WHERE status = 'Hoàn thành' AND purchaseDate >= :previousFrom AND purchaseDate < :previousTo;
```

## Slow Sales But High Inventory

Rule of thumb: low recent sold quantity and high latest stock. State the threshold used.

```sql
WITH latest_snapshot AS (
  SELECT MAX(snapshotDate) AS snapshotDate FROM "InventorySnapshot"
), stock AS (
  SELECT productId, SUM(onHand) AS onHand
  FROM "InventorySnapshot"
  WHERE snapshotDate = (SELECT snapshotDate FROM latest_snapshot)
  GROUP BY productId
), sales AS (
  SELECT ii.productId, SUM(ii.quantity) AS soldQty, SUM(ii.subtotal) AS revenue
  FROM "InvoiceItem" ii
  JOIN "Invoice" i ON i.id = ii.invoiceId
  WHERE i.status = 'Hoàn thành'
    AND i.purchaseDate >= :fromDate
    AND i.purchaseDate < :toDate
  GROUP BY ii.productId
)
SELECT p.code, p.name, p.categoryName, COALESCE(s.soldQty, 0) AS soldQty, stock.onHand
FROM stock
JOIN "Product" p ON p.id = stock.productId
LEFT JOIN sales s ON s.productId = stock.productId
WHERE stock.onHand >= :minStock AND COALESCE(s.soldQty, 0) <= :maxSold
ORDER BY stock.onHand DESC
LIMIT 20;
```

## Customer Debt / Receivables

The current schema does not guarantee true debt ledger. If the user asks `công nợ`, first check whether payment/receivable fields exist. With current `Order` fields, an approximate pending-order receivable can be:

`unpaidTemporaryOrderValue = SUM(Order.total - Order.totalPayment)` where `statusValue = 'Phiếu tạm'`.

Always label this as approximate and based on temporary orders, not official accounting debt.

## Branch Stopped Buying A Product

Question: `Chi nhánh nào tháng này giảm hoặc ngừng mua bò mỹ`

Use customers as branch-like buyers if the business names branches as customers. Compare completed invoice item quantity for current period vs previous comparable period.

```sql
WITH current_period AS (
  SELECT i.customerId, SUM(ii.quantity) AS qty
  FROM "InvoiceItem" ii
  JOIN "Invoice" i ON i.id = ii.invoiceId
  JOIN "Product" p ON p.id = ii.productId
  WHERE i.status = 'Hoàn thành'
    AND i.purchaseDate >= :currentFrom AND i.purchaseDate < :currentTo
    AND (p.name LIKE :product OR p.code LIKE :product)
  GROUP BY i.customerId
), previous_period AS (
  SELECT i.customerId, SUM(ii.quantity) AS qty
  FROM "InvoiceItem" ii
  JOIN "Invoice" i ON i.id = ii.invoiceId
  JOIN "Product" p ON p.id = ii.productId
  WHERE i.status = 'Hoàn thành'
    AND i.purchaseDate >= :previousFrom AND i.purchaseDate < :previousTo
    AND (p.name LIKE :product OR p.code LIKE :product)
  GROUP BY i.customerId
)
SELECT c.code, c.name, COALESCE(prev.qty, 0) AS previousQty, COALESCE(cur.qty, 0) AS currentQty,
       COALESCE(cur.qty, 0) - COALESCE(prev.qty, 0) AS deltaQty
FROM previous_period prev
LEFT JOIN current_period cur ON cur.customerId = prev.customerId
LEFT JOIN "Customer" c ON c.id = prev.customerId
WHERE COALESCE(cur.qty, 0) < COALESCE(prev.qty, 0)
ORDER BY deltaQty ASC
LIMIT 20;
```

## Daily Summary

Combine:

- completed invoices today: count, revenue, item quantity
- temporary orders today: count, value, top customers
- low/negative stock from latest snapshot
- sync freshness from `SyncLog`/`AppSetting`

Keep the summary short and include evidence rows.
