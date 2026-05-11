# MVP Release Checklist

Dung checklist nay truoc khi coi mot commit la ban local on dinh de van hanh.

## 1. Moi truong

- [ ] PostgreSQL dang chay tren `localhost:5432`.
- [ ] Database `yagami_dashboard` da duoc tao.
- [ ] `.env` co `DATABASE_URL` dung.
- [ ] `.env` co day du KiotViet client id, secret, retailer, auth url, api url.

## 2. Cai dat va schema

- [ ] `npm.cmd install` da chay thanh cong.
- [ ] `npm.cmd run prisma:migrate` da chay thanh cong.
- [ ] `npm.cmd run prisma:generate` da chay thanh cong.

## 3. Kiem tra API KiotViet

- [ ] `/settings/api-test` lay Access Token thanh cong.
- [ ] Test products thanh cong.
- [ ] Test customers thanh cong.
- [ ] Test invoices thanh cong.
- [ ] Test inventory thanh cong.

## 4. Dong bo du lieu

- [ ] Sync chi nhanh thanh cong.
- [ ] Sync san pham thanh cong.
- [ ] Sync khach hang thanh cong.
- [ ] Sync hoa don 30 ngay thanh cong.
- [ ] Sync lich su hoa don thanh cong neu can lay du lieu cu.
- [ ] Sync ton kho thanh cong.
- [ ] Dashboard hien KPI tu du lieu that.

## 5. Bao cao va export

- [ ] `/products` mo duoc va xuat Excel duoc.
- [ ] `/customers` mo duoc va xuat Excel duoc.
- [ ] `/invoices` mo duoc va xuat Excel duoc.
- [ ] `/inventory` mo duoc va xuat Excel duoc.
- [ ] `/analytics/customer-frequency` mo duoc va xuat Excel duoc.
- [ ] `/analytics/product-frequency` mo duoc va xuat Excel duoc.

## 6. Lich sync

- [ ] `/settings/schedule` mo duoc.
- [ ] Luu cau hinh lich sync thanh cong.
- [ ] Nut `Chay thu ngay` thanh cong.
- [ ] Neu bat auto sync, log moi xuat hien sau dung chu ky.

## 7. Backup

- [ ] Chay `powershell -ExecutionPolicy Bypass -File scripts/backup-postgres.ps1` thanh cong.
- [ ] File backup nam trong `backups/`.
- [ ] Da luu file backup ra noi an toan neu day la ban release quan trong.

## 8. Verification truoc khi tag

- [ ] `npm.cmd run lint` thanh cong.
- [ ] `npx.cmd tsc --noEmit` thanh cong.
- [ ] `npm.cmd run build` thanh cong.
- [ ] `git status --short` sach.
- [ ] Commit da push len GitHub.

## 9. Thong tin release

- Commit release:
- Ngay release:
- Ghi chu du lieu/sync:
