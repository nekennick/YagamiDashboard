import { Prisma } from "@prisma/client";
import { getInventoryCountPermissions } from "@/lib/auth/inventory-count";
import { addInventoryCountAudit } from "@/lib/inventory-count/service";
import { prisma } from "@/lib/prisma";

export type AssignmentGroupInput = {
  branchId: number;
  assigneeId: number;
  productIds: number[];
};

export type AssignmentConflict = {
  productId: number;
  code: string | null;
  name: string;
  branchName: string;
  assigneeId: number;
  assigneeName: string;
};

export class AssignmentManagementError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly details?: { conflicts?: AssignmentConflict[]; lockedProducts?: AssignmentConflict[] }
  ) {
    super(message);
  }
}

export function parsePositiveInt(value: unknown) {
  const parsed = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof parsed === "number" && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function uniquePositiveInts(values: unknown) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(parsePositiveInt).filter((value): value is number => value !== null))];
}

async function validateGroupReferences(groups: AssignmentGroupInput[]) {
  if (!groups.length) throw new AssignmentManagementError("Danh sách phân công đang trống.");

  const branchIds = [...new Set(groups.map((group) => group.branchId))];
  const assigneeIds = [...new Set(groups.map((group) => group.assigneeId))];
  const productIds = [...new Set(groups.flatMap((group) => group.productIds))];
  const [branches, assignees, productCount] = await Promise.all([
    prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true } }),
    prisma.user.findMany({ where: { id: { in: assigneeIds }, isActive: true }, select: { id: true, role: true } }),
    productIds.length ? prisma.product.count({ where: { id: { in: productIds }, isActive: true } }) : Promise.resolve(0)
  ]);

  if (branches.length !== branchIds.length) throw new AssignmentManagementError("Có kho không còn tồn tại.");
  if (assignees.length !== assigneeIds.length) throw new AssignmentManagementError("Có tài khoản nhân viên không còn hoạt động.");
  if (productCount !== productIds.length) throw new AssignmentManagementError("Có sản phẩm không tồn tại hoặc đã ngừng kinh doanh.");

  for (const assignee of assignees) {
    const permissions = await getInventoryCountPermissions(assignee.id, assignee.role);
    if (!permissions.includes("COUNT_EXECUTE")) {
      throw new AssignmentManagementError(`Tài khoản #${assignee.id} chưa được cấp quyền thực hiện Kiểm kho.`);
    }
  }
}

function conflictDetails(
  rows: Array<{
    productId: number;
    product: { code: string | null; name: string };
    branch: { name: string };
    assignee: { id: number; displayName: string };
  }>
): AssignmentConflict[] {
  return rows.map((row) => ({
    productId: row.productId,
    code: row.product.code,
    name: row.product.name,
    branchName: row.branch.name,
    assigneeId: row.assignee.id,
    assigneeName: row.assignee.displayName
  }));
}

async function findConflicts(tx: Prisma.TransactionClient, groups: AssignmentGroupInput[]) {
  const requestedOwner = new Map<string, number>();
  for (const group of groups) {
    for (const productId of group.productIds) {
      const key = `${group.branchId}:${productId}`;
      const previousOwner = requestedOwner.get(key);
      if (previousOwner && previousOwner !== group.assigneeId) {
        throw new AssignmentManagementError("Một mã hàng trong dữ liệu đang được phân cho hai nhân viên khác nhau.", 409);
      }
      requestedOwner.set(key, group.assigneeId);
    }
  }

  const rows = await tx.inventoryCountAssignment.findMany({
    where: {
      isActive: true,
      OR: groups.map((group) => ({ branchId: group.branchId, productId: { in: group.productIds } }))
    },
    include: {
      product: { select: { code: true, name: true } },
      branch: { select: { name: true } },
      assignee: { select: { id: true, displayName: true } }
    }
  });

  return conflictDetails(rows.filter((row) => requestedOwner.get(`${row.branchId}:${row.productId}`) !== row.assigneeId));
}

async function upsertGroup(
  tx: Prisma.TransactionClient,
  group: AssignmentGroupInput,
  actorId: number
) {
  for (const productId of group.productIds) {
    const previous = await tx.inventoryCountAssignment.findUnique({
      where: { productId_branchId: { productId, branchId: group.branchId } }
    });
    if (previous?.isActive && previous.assigneeId === group.assigneeId) continue;

    const assignment = await tx.inventoryCountAssignment.upsert({
      where: { productId_branchId: { productId, branchId: group.branchId } },
      create: { productId, branchId: group.branchId, assigneeId: group.assigneeId, assignedById: actorId, isActive: true },
      update: { assigneeId: group.assigneeId, assignedById: actorId, isActive: true }
    });
    await tx.inventoryCountAssignmentAudit.create({
      data: {
        assignmentId: assignment.id,
        action: previous ? "REACTIVATED" : "ASSIGNED",
        previousJson: previous ? JSON.stringify({ assigneeId: previous.assigneeId, isActive: previous.isActive }) : null,
        nextJson: JSON.stringify({ assigneeId: assignment.assigneeId, isActive: assignment.isActive }),
        actorId
      }
    });
    await addInventoryCountAudit(tx, {
      entityType: "ASSIGNMENT",
      entityId: String(assignment.id),
      action: previous ? "REACTIVATED" : "ASSIGNED",
      actorId,
      payload: { productId, branchId: group.branchId, assigneeId: group.assigneeId }
    });
  }
}

export async function replaceAssignmentList(input: AssignmentGroupInput & { actorId: number }) {
  const group = { branchId: input.branchId, assigneeId: input.assigneeId, productIds: uniquePositiveInts(input.productIds) };
  await validateGroupReferences([group]);

  return prisma.$transaction(async (tx) => {
    const conflicts = await findConflicts(tx, [group]);
    if (conflicts.length) {
      throw new AssignmentManagementError("Có mã hàng đang được nhân viên khác phụ trách.", 409, { conflicts });
    }

    const current = await tx.inventoryCountAssignment.findMany({
      where: { branchId: group.branchId, assigneeId: group.assigneeId, isActive: true },
      select: { id: true, productId: true }
    });
    const desired = new Set(group.productIds);
    const removed = current.filter((assignment) => !desired.has(assignment.productId));

    if (removed.length) {
      const locked = await tx.inventoryCountLine.findMany({
        where: {
          productId: { in: removed.map((item) => item.productId) },
          session: {
            branchId: group.branchId,
            assigneeId: group.assigneeId,
            status: { notIn: ["COMPLETED", "CANCELLED"] }
          }
        },
        include: {
          product: { select: { code: true, name: true } },
          session: { include: { branch: { select: { name: true } }, assignee: { select: { id: true, displayName: true } } } }
        }
      });
      if (locked.length) {
        const lockedProducts = locked.map((line) => ({
          productId: line.productId,
          code: line.product.code,
          name: line.product.name,
          branchName: line.session.branch.name,
          assigneeId: line.session.assignee.id,
          assigneeName: line.session.assignee.displayName
        }));
        throw new AssignmentManagementError("Không thể gỡ sản phẩm đang nằm trong phiên kiểm chưa kết thúc.", 409, { lockedProducts });
      }
    }

    await upsertGroup(tx, group, input.actorId);
    for (const assignment of removed) {
      const updated = await tx.inventoryCountAssignment.update({ where: { id: assignment.id }, data: { isActive: false, assignedById: input.actorId } });
      await tx.inventoryCountAssignmentAudit.create({
        data: {
          assignmentId: assignment.id,
          action: "UNASSIGNED",
          previousJson: JSON.stringify({ assigneeId: group.assigneeId, isActive: true }),
          nextJson: JSON.stringify({ assigneeId: updated.assigneeId, isActive: false }),
          actorId: input.actorId
        }
      });
      await addInventoryCountAudit(tx, { entityType: "ASSIGNMENT", entityId: String(assignment.id), action: "UNASSIGNED", actorId: input.actorId, payload: { productId: assignment.productId, branchId: group.branchId, assigneeId: group.assigneeId } });
    }

    return { assignedCount: group.productIds.length, addedCount: group.productIds.filter((id) => !current.some((item) => item.productId === id)).length, removedCount: removed.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function mergeAssignmentGroups(groups: AssignmentGroupInput[], actorId: number) {
  const normalized = groups.map((group) => ({ ...group, productIds: uniquePositiveInts(group.productIds) })).filter((group) => group.productIds.length > 0);
  await validateGroupReferences(normalized);
  return prisma.$transaction(async (tx) => {
    const conflicts = await findConflicts(tx, normalized);
    if (conflicts.length) throw new AssignmentManagementError("Có mã hàng đang được nhân viên khác phụ trách.", 409, { conflicts });
    for (const group of normalized) await upsertGroup(tx, group, actorId);
    return { groupCount: normalized.length, productCount: normalized.reduce((total, group) => total + group.productIds.length, 0) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
