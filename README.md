# KiotViet Local Analytics Dashboard

Local-first dashboard de test, dong bo va phan tich du lieu KiotViet Public API tren may local. App dung Next.js 15, Prisma, PostgreSQL va ExcelJS.

## Tinh nang da co

- Test KiotViet API tai `/settings/api-test`.
- Dong bo chi nhanh, san pham, khach hang, hoa don 30 ngay, lich su hoa don va ton kho tai `/settings/sync`.
- PostgreSQL local de tranh lock khi sync hoa don lon.
- Dashboard KPI that voi bo loc thoi gian: hom nay, 7 ngay, 30 ngay, thang nay, thang truoc, 3 thang, 6 thang, nam nay va tuy chon.
- Trang du lieu: `/products`, `/customers`, `/invoices`, `/inventory`.
- Analytics: `/analytics/customer-frequency`, `/analytics/product-frequency`.
- Xuat Excel cho san pham, khach hang, hoa don, ton kho va 2 trang analytics.
- Lich dong bo tu dong tai `/settings/schedule` khi app local dang chay.
- Fallback UI khi PostgreSQL chua chay.

## Cai dat nhanh

```bash
npm install
cp .env.example .env
npm run prisma:migrate
npm run prisma:generate
npm run dev
```

PowerShell tren Windows co the chan `npm.ps1`. Neu gap loi execution policy, dung:

```bash
npm.cmd install
npm.cmd run prisma:migrate
npm.cmd run prisma:generate
npm.cmd run dev
```

Mo app tai:

```txt
http://localhost:3000
```

## Bien moi truong

Tao `.env` tu `.env.example` va dien thong tin KiotViet:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/yagami_dashboard?schema=public"

KIOTVIET_CLIENT_ID=
KIOTVIET_CLIENT_SECRET=
KIOTVIET_RETAILER=
KIOTVIET_AUTH_URL=https://id.kiotviet.vn/connect/token
KIOTVIET_API_URL=https://public.kiotapi.com
```

Khong hardcode API key trong source code.

## PostgreSQL local

Ung dung can PostgreSQL chay o `localhost:5432`.

Tao database truoc khi migrate:

```bash
createdb yagami_dashboard
npm run prisma:migrate
```

Neu PostgreSQL dung user/password khac, cap nhat `DATABASE_URL` trong `.env`.

## Quy trinh van hanh

1. Chay PostgreSQL.
2. Chay `npm.cmd run dev`.
3. Mo `/settings/api-test` va test token, products, customers, invoices, inventory.
4. Mo `/settings/sync` va sync theo thu tu: chi nhanh, san pham, khach hang, hoa don 30 ngay, lich su hoa don, ton kho.
5. Xem dashboard va cac trang analytics.
6. Tai Excel tu nut `Xuat Excel` tren tung trang.
7. Neu muon tu dong sync, mo `/settings/schedule`, bat lich va chon chu ky.

## Lenh hay dung

```bash
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
npm.cmd run prisma:migrate
npm.cmd run prisma:generate
```

## Backup va restore PostgreSQL

Tao backup tu `DATABASE_URL` trong `.env`:

```bash
powershell -ExecutionPolicy Bypass -File scripts/backup-postgres.ps1
```

File backup se nam trong thu muc `backups/` va khong duoc commit len Git.

Restore tu mot file backup:

```bash
powershell -ExecutionPolicy Bypass -File scripts/restore-postgres.ps1 -BackupFile backups/yagami-dashboard-YYYYMMDD-HHMMSS.dump
```

Restore se hoi xac nhan truoc khi ghi de du lieu. Neu muon chay khong hoi:

```bash
powershell -ExecutionPolicy Bypass -File scripts/restore-postgres.ps1 -BackupFile backups/yagami-dashboard-YYYYMMDD-HHMMSS.dump -Force
```

Checklist release MVP nam tai `docs/MVP_RELEASE_CHECKLIST.md`.

## Ghi chu local

- Lich sync tu dong chi chay khi app local dang mo.
- Nut `Chay thu ngay` trong `/settings/schedule` se sync that voi KiotViet.
- Export Excel xuat toan bo ket qua khop bo loc cua trang, khong chi cac dong dang hien thi trong bang.
- Neu trang bao khong ket noi duoc database, hay kiem tra PostgreSQL service va `DATABASE_URL`.
