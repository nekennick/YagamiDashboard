# Yagami Quick Reports

This folder documents repeatable local reports for Yagami Dashboard.

Reports read the local synced database through Prisma and write both Markdown and JSON into `reports/output`.
Each run also saves or updates a `ReportSnapshot` row in the local database.

## Daily Use

```bash
npm.cmd run report:daily
npm.cmd run report:website
npm.cmd run report:sales
npm.cmd run report:inventory
```

## Custom Date Range

Use `--` before report arguments when running through npm.

```bash
npm.cmd run report:daily -- --date 2026-06-24
npm.cmd run report:sales -- --from 2026-06-01 --to 2026-06-24
npm.cmd run report:website -- --from 2026-06-01 --to 2026-06-24
```

## Output

Each run creates:

- `reports/output/YYYYMMDD-<preset>.md`: readable report.
- `reports/output/YYYYMMDD-<preset>.json`: structured data for another AI agent or later automation.
- `ReportSnapshot` database row keyed by `<preset>:<period>`, e.g. `daily:20260624`.

## Presets

| Preset | Purpose |
| --- | --- |
| `daily` | Fast daily snapshot: completed invoices, temporary orders, top products, top customers, inventory alerts, sync freshness. |
| `sales` | Sales analysis for a selected date range. |
| `website` | Website-channel completed invoices and branches that have not generated website invoices. |
| `inventory` | Latest full inventory snapshot with negative and high-stock alerts. |

## Rules

- Reports must cite source tables, date range, and filters.
- Reports must not call KiotViet live API; sync first if data freshness is not enough.
- `website` uses `saleChannelId = 226442` or a sale channel name containing `website`.
- `inventory` uses only the latest `InventorySnapshot.snapshotDate`.
- Running the same preset for the same period overwrites that snapshot instead of creating duplicates.
