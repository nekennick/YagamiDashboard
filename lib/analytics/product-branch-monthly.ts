import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const cancelledStatus = "Đã hủy";

export type ProductBranchMonthlyRow = {
  month: Date;
  productId: number;
  productCode: string | null;
  productName: string;
  categoryName: string | null;
  unit: string | null;
  branchId: number | null;
  branchName: string | null;
  quantity: number;
  revenue: number;
  invoiceCount: number;
};

export type ProductBranchMonthlyFilters = {
  fromDate: Date;
  toDate: Date;
  productId?: number;
  branchId?: number;
  category?: string;
  query?: string;
  limit?: number;
};

type ProductBranchMonthlyRawRow = {
  month: Date | string;
  productId: number;
  productCode: string | null;
  productName: string;
  categoryName: string | null;
  unit: string | null;
  branchId: number | null;
  branchName: string | null;
  quantity: unknown;
  revenue: unknown;
  invoiceCount: unknown;
};

export async function getProductBranchMonthlyRows(filters: ProductBranchMonthlyFilters) {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`ii."productId" IS NOT NULL`,
    Prisma.sql`(i.status IS NULL OR i.status != ${cancelledStatus})`,
    Prisma.sql`i."purchaseDate" >= ${filters.fromDate}`,
    Prisma.sql`i."purchaseDate" < ${filters.toDate}`
  ];

  if (filters.productId) {
    conditions.push(Prisma.sql`p.id = ${filters.productId}`);
  }

  if (filters.branchId) {
    conditions.push(Prisma.sql`b.id = ${filters.branchId}`);
  }

  if (filters.category) {
    conditions.push(Prisma.sql`p."categoryName" = ${filters.category}`);
  }

  if (filters.query) {
    const query = `%${filters.query}%`;
    conditions.push(Prisma.sql`(p.name LIKE ${query} OR p.code LIKE ${query} OR p."fullName" LIKE ${query})`);
  }

  const rows = await prisma.$queryRaw<ProductBranchMonthlyRawRow[]>`
    SELECT
      date(i."purchaseDate", 'start of month') AS "month",
      p.id AS "productId",
      p.code AS "productCode",
      p.name AS "productName",
      p."categoryName" AS "categoryName",
      p.unit AS "unit",
      b.id AS "branchId",
      b.name AS "branchName",
      SUM(ii.quantity) AS "quantity",
      SUM(ii.subtotal) AS "revenue",
      COUNT(DISTINCT i.id) AS "invoiceCount"
    FROM "InvoiceItem" ii
    JOIN "Invoice" i ON i.id = ii."invoiceId"
    JOIN "Product" p ON p.id = ii."productId"
    LEFT JOIN "Branch" b ON b.id = i."branchId"
    WHERE ${Prisma.join(conditions, " AND ")}
    GROUP BY
      date(i."purchaseDate", 'start of month'),
      p.id,
      p.code,
      p.name,
      p."categoryName",
      p.unit,
      b.id,
      b.name
    ORDER BY "month" DESC, "revenue" DESC
    LIMIT ${filters.limit ?? 1200}
  `;

  return rows.map((row) => ({
    ...row,
    month: new Date(row.month),
    quantity: toNumber(row.quantity),
    revenue: toNumber(row.revenue),
    invoiceCount: toNumber(row.invoiceCount)
  })) as ProductBranchMonthlyRow[];
}

export function parseMonthRange(fromMonth: string, toMonth: string) {
  const now = new Date();
  const defaultTo = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultFrom = addMonths(defaultTo, -5);
  const fromDate = fromMonth ? parseMonthStart(fromMonth) : defaultFrom;
  const toDate = toMonth ? addMonths(parseMonthStart(toMonth), 1) : addMonths(defaultTo, 1);

  return {
    fromDate,
    toDate,
    fromMonthValue: formatMonthInput(fromDate),
    toMonthValue: formatMonthInput(addMonths(toDate, -1))
  };
}

export function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

export function toNumber(value: unknown) {
  if (!value) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value);
  }

  if (typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    return value.toNumber();
  }

  return Number(value);
}

function parseMonthStart(value: string) {
  const [year, month] = value.split("-").map(Number);

  if (!year || !month || month < 1 || month > 12) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return new Date(year, month - 1, 1);
}

function formatMonthInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}
