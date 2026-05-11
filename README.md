# KiotViet Local Analytics Dashboard

Local-first dashboard dung de test va phan tich du lieu KiotViet Public API. Du an nay di theo roadmap trong `docs/PROJECT_REQUIREMENTS.md` va khong build vuot phase.

## Da co trong phase hien tai

- Next.js 15 App Router
- TypeScript
- TailwindCSS
- Khung shadcn/ui toi thieu
- Layout co sidebar
- Dashboard rong
- Prisma + PostgreSQL config
- Trang test KiotViet API tai `/settings/api-test`
- `.env.example`

## Chua build trong phase nay

- Sync database
- Dashboard du lieu that
- Analytics
- Export Excel
- Scheduler

Nhung phan tren chi lam sau khi token, san pham, khach hang, hoa don va ton kho deu test thanh cong.

## Cai dat

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
npm.cmd run dev
```

## Bien moi truong

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

Ung dung hien dung PostgreSQL thay cho SQLite de tranh lock khi sync hoa don va dong hoa don lon.

Can tao database truoc khi migrate:

```bash
createdb yagami_dashboard
npm run prisma:migrate
```

Neu PostgreSQL dung user/password khac, cap nhat `DATABASE_URL` trong `.env`.

## Thu tu lam tiep

1. Dien `.env`.
2. Chay app va mo `/settings/api-test`.
3. Test Access Token.
4. Test products, customers, invoices, inventory.
5. Chay migrate PostgreSQL.
6. Sync chi nhanh, san pham, khach hang, hoa don 30 ngay, lich su hoa don, ton kho.
