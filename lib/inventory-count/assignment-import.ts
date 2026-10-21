import ExcelJS from "exceljs";
import { getInventoryCountPermissions } from "@/lib/auth/inventory-count";
import type { AssignmentConflict, AssignmentGroupInput } from "@/lib/inventory-count/assignment-management";
import { prisma } from "@/lib/prisma";

export type AssignmentImportRow = {
  rowNumber: number;
  branchName: string;
  username: string;
  productCode: string;
};

export type AssignmentImportIssue = {
  rowNumber: number;
  message: string;
  value?: string;
};

export type AssignmentImportPreview = {
  rows: AssignmentImportRow[];
  groups: AssignmentGroupInput[];
  summaries: Array<{ branchId: number; branchName: string; assigneeId: number; assigneeName: string; username: string; productCount: number }>;
  errors: AssignmentImportIssue[];
  duplicates: AssignmentImportIssue[];
  conflicts: AssignmentConflict[];
  canApply: boolean;
};

export function normalizeImportValue(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi-VN");
}

function headerKind(value: string) {
  const normalized = normalizeImportValue(value);
  if (["kho", "chi nhanh", "ten kho"].includes(normalized)) return "branchName";
  if (["tai khoan", "username", "nhan vien", "tai khoan nhan vien"].includes(normalized)) return "username";
  if (["ma hang", "ma san pham", "sku", "product code"].includes(normalized)) return "productCode";
  return null;
}

export function parseAssignmentMatrix(matrix: string[][]) {
  if (!matrix.length) return { rows: [] as AssignmentImportRow[], errors: [{ rowNumber: 1, message: "File Excel không có dữ liệu." }] };
  const header = matrix[0] ?? [];
  const columns: Partial<Record<"branchName" | "username" | "productCode", number>> = {};
  header.forEach((value, index) => {
    const kind = headerKind(value);
    if (kind && columns[kind] === undefined) columns[kind] = index;
  });
  const missing = (["branchName", "username", "productCode"] as const).filter((key) => columns[key] === undefined);
  if (missing.length) {
    return { rows: [] as AssignmentImportRow[], errors: [{ rowNumber: 1, message: "Thiếu cột bắt buộc: Kho, Tài khoản, Mã hàng." }] };
  }

  const rows: AssignmentImportRow[] = [];
  const errors: AssignmentImportIssue[] = [];
  for (let index = 1; index < matrix.length; index += 1) {
    const source = matrix[index] ?? [];
    const branchName = (source[columns.branchName!] ?? "").trim();
    const username = (source[columns.username!] ?? "").trim();
    const productCode = (source[columns.productCode!] ?? "").trim();
    if (!branchName && !username && !productCode) continue;
    const rowNumber = index + 1;
    if (!branchName || !username || !productCode) {
      errors.push({ rowNumber, message: "Dòng phải có đủ Kho, Tài khoản và Mã hàng." });
      continue;
    }
    rows.push({ rowNumber, branchName, username, productCode });
  }
  if (!rows.length && !errors.length) errors.push({ rowNumber: 2, message: "File chưa có dòng phân công nào." });
  return { rows, errors };
}

export async function readAssignmentWorkbook(buffer: ArrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return { rows: [] as AssignmentImportRow[], errors: [{ rowNumber: 1, message: "File Excel không có sheet dữ liệu." }] };
  const matrix: string[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    while (matrix.length < rowNumber) matrix.push([]);
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => { values[columnNumber - 1] = cell.text.trim(); });
    matrix[rowNumber - 1] = values;
  });
  return parseAssignmentMatrix(matrix);
}

export async function resolveAssignmentImport(rows: AssignmentImportRow[], initialErrors: AssignmentImportIssue[] = []): Promise<AssignmentImportPreview> {
  const errors = [...initialErrors];
  const duplicates: AssignmentImportIssue[] = [];
  if (rows.length > 5000) errors.push({ rowNumber: 1, message: "Mỗi file chỉ được tối đa 5.000 dòng." });

  const [branches, users, products, assignments] = await Promise.all([
    prisma.branch.findMany({ select: { id: true, name: true } }),
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, username: true, displayName: true, role: true } }),
    prisma.product.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true } }),
    prisma.inventoryCountAssignment.findMany({
      where: { isActive: true },
      include: {
        product: { select: { id: true, code: true, name: true } },
        branch: { select: { id: true, name: true } },
        assignee: { select: { id: true, displayName: true } }
      }
    })
  ]);

  const executableUsers = [];
  for (const user of users) {
    if ((await getInventoryCountPermissions(user.id, user.role)).includes("COUNT_EXECUTE")) executableUsers.push(user);
  }
  const branchMap = new Map(branches.map((branch) => [normalizeImportValue(branch.name), branch]));
  const userMap = new Map(executableUsers.map((user) => [user.username.trim().toLocaleLowerCase(), user]));
  const productsByCode = new Map<string, typeof products>();
  for (const product of products) {
    const code = product.code?.trim().toLocaleUpperCase();
    if (!code) continue;
    productsByCode.set(code, [...(productsByCode.get(code) ?? []), product]);
  }

  const seenRows = new Map<string, number>();
  const claims = new Map<string, { branchId: number; branchName: string; assigneeId: number; assigneeName: string; username: string; productId: number; productCode: string; productName: string; rowNumber: number }>();
  for (const row of rows) {
    const branch = branchMap.get(normalizeImportValue(row.branchName));
    const user = userMap.get(row.username.trim().toLocaleLowerCase());
    const matchingProducts = productsByCode.get(row.productCode.trim().toLocaleUpperCase()) ?? [];
    if (!branch) errors.push({ rowNumber: row.rowNumber, message: "Không tìm thấy kho.", value: row.branchName });
    if (!user) errors.push({ rowNumber: row.rowNumber, message: "Không tìm thấy tài khoản có quyền Kiểm kho.", value: row.username });
    if (matchingProducts.length === 0) errors.push({ rowNumber: row.rowNumber, message: "Không tìm thấy mã hàng đang kinh doanh.", value: row.productCode });
    if (matchingProducts.length > 1) errors.push({ rowNumber: row.rowNumber, message: "Mã hàng không duy nhất trong dữ liệu sản phẩm.", value: row.productCode });
    if (!branch || !user || matchingProducts.length !== 1) continue;

    const product = matchingProducts[0]!;
    const duplicateKey = `${branch.id}:${user.id}:${product.id}`;
    if (seenRows.has(duplicateKey)) {
      duplicates.push({ rowNumber: row.rowNumber, message: `Trùng với dòng ${seenRows.get(duplicateKey)}.`, value: row.productCode });
      continue;
    }
    seenRows.set(duplicateKey, row.rowNumber);

    const claimKey = `${branch.id}:${product.id}`;
    const previousClaim = claims.get(claimKey);
    if (previousClaim && previousClaim.assigneeId !== user.id) {
      errors.push({ rowNumber: row.rowNumber, message: `Mã hàng đã được phân cho ${previousClaim.assigneeName} tại dòng ${previousClaim.rowNumber}.`, value: row.productCode });
      continue;
    }
    claims.set(claimKey, { branchId: branch.id, branchName: branch.name, assigneeId: user.id, assigneeName: user.displayName, username: user.username, productId: product.id, productCode: product.code ?? row.productCode, productName: product.name, rowNumber: row.rowNumber });
  }

  const conflicts: AssignmentConflict[] = [];
  for (const claim of claims.values()) {
    const existing = assignments.find((assignment) => assignment.branchId === claim.branchId && assignment.productId === claim.productId);
    if (existing && existing.assigneeId !== claim.assigneeId) {
      conflicts.push({
        productId: claim.productId,
        code: existing.product.code,
        name: existing.product.name,
        branchName: existing.branch.name,
        assigneeId: existing.assignee.id,
        assigneeName: existing.assignee.displayName
      });
    }
  }

  const grouped = new Map<string, AssignmentGroupInput & { branchName: string; assigneeName: string; username: string }>();
  for (const claim of claims.values()) {
    const key = `${claim.branchId}:${claim.assigneeId}`;
    const group = grouped.get(key) ?? { branchId: claim.branchId, branchName: claim.branchName, assigneeId: claim.assigneeId, assigneeName: claim.assigneeName, username: claim.username, productIds: [] };
    group.productIds.push(claim.productId);
    grouped.set(key, group);
  }
  const groups = [...grouped.values()].map(({ branchId, assigneeId, productIds }) => ({ branchId, assigneeId, productIds }));
  const summaries = [...grouped.values()].map((group) => ({ branchId: group.branchId, branchName: group.branchName, assigneeId: group.assigneeId, assigneeName: group.assigneeName, username: group.username, productCount: group.productIds.length }));
  return { rows, groups, summaries, errors, duplicates, conflicts, canApply: errors.length === 0 && duplicates.length === 0 && conflicts.length === 0 && groups.length > 0 };
}
