---
name: yagami-data-analyst
description: Analyze Yagami Dashboard business data from the local synced database with evidence. Use when the user asks Vietnamese business/data questions about revenue, invoices, temporary orders, customer debt/receivables, product sales, inventory, branch purchasing, period comparison, daily summaries, slow-moving stock, or asks examples like "Tháng này chi nhánh nào đặt nhiều Mì Yagami nhất?", "Khách nào đang có công nợ giá trị lớn?", "Sản phẩm nào bán chậm nhưng tồn kho cao?", "So sánh doanh thu tuần này với tuần trước", "Tóm tắt tình hình hôm nay", or "Chi nhánh nào tháng này giảm hoặc ngừng mua bò mỹ". Must query local synced data and cite evidence; never fabricate numbers.
---

# Yagami Data Analyst

## Prime Rule

Use local synced data as the source of truth. Do not invent numbers. If a metric is not available in the local schema or has not been synced, say so clearly and propose the next sync/table needed.

## Workflow

1. Identify the business intent: revenue, order, invoice, customer, receivable, product, inventory, branch, comparison, or summary.
2. Resolve time range in `Asia/Saigon` using concrete dates. For relative phrases like `tháng này`, `tuần trước`, or `hôm nay`, state the exact range used.
3. Inspect schema/context if needed. Read `references/schema.md` for available tables and `references/analysis-playbook.md` for query patterns. For branch identity, warehouse ownership, aliases, or active-branch questions, always read `references/branch-warehouse-map.json`.
4. Query the local database. Prefer `scripts/query_yagami.py` for read-only SQL against SQLite. Use Prisma/Node only when richer app logic is needed.
5. Validate counts and joins before answering. Check status filters such as `Hoàn thành`, `Phiếu tạm`, and `Đã hủy` exactly from data.
6. Answer in Vietnamese with evidence: show filters, date range, top rows/aggregates, and note any missing data or caveats.

## Evidence Requirements

Every analytical answer must include:

- Data source tables used, e.g. `Invoice`, `InvoiceItem`, `Order`, `OrderItem`, `InventorySnapshot`.
- Date range and status filters.
- At least one supporting table or bullet list with concrete numbers.
- A caveat if data may be stale, incomplete, not synced, or if a requested concept does not exist in the schema.

## Safety Rules

- Only run read-only queries unless the user explicitly asks to change data.
- Never expose `.env` secrets.
- Do not use KiotViet live API for analysis unless the user asks to sync/test first. Prefer local synced data.
- Do not answer from memory when the question asks for current business figures.
- If SQLite is locked or unavailable, report that analysis is blocked and suggest closing running dev servers or retrying.

## Common Interpretation

- `đặt`, `đơn đặt`, `phiếu tạm`: use `Order`/`OrderItem` with `statusValue = 'Phiếu tạm'`.
- `hóa đơn hoàn thành`, `đã bán`, `doanh thu`: use `Invoice`/`InvoiceItem` with `status = 'Hoàn thành'` unless the user asks otherwise.
- `bán chậm`: compare quantity/revenue in the selected recent period against a previous period or threshold; state the rule used.
- `tồn kho cao`: use the latest `InventorySnapshot.snapshotDate` per product/branch.
- `công nợ`: use available local fields only. Current schema has `Order.totalPayment`, `Order.total`, `Invoice.total`, but does not have a full receivables/payment ledger. Treat debt as approximate only if defined by the user, e.g. unpaid temporary order value = `total - totalPayment`.

## Resources

- `references/schema.md`: local schema, statuses, and data caveats.
- `references/analysis-playbook.md`: SQL templates and analysis patterns for common questions.
- `references/branch-warehouse-map.json`: canonical branch alias, customer code, warehouse, route day, activity status, and deprecated-code knowledge.
- `references/branch-warehouse-map.md`: human-readable branch and warehouse map.
- `scripts/query_yagami.py`: read-only SQLite query helper that returns JSON.
