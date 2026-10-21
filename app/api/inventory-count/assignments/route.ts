import { NextRequest, NextResponse } from "next/server";
import { getInventoryCountPermissions, InventoryCountAccessError, requireInventoryCountPermission } from "@/lib/auth/inventory-count";
import {
  AssignmentManagementError,
  mergeAssignmentGroups,
  parsePositiveInt,
  replaceAssignmentList,
  uniquePositiveInts
} from "@/lib/inventory-count/assignment-management";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireInventoryCountPermission("COUNT_MANAGE");
    const [assignments, users, branches, products] = await Promise.all([
      prisma.inventoryCountAssignment.findMany({
        where: { isActive: true },
        orderBy: [{ branch: { name: "asc" } }, { product: { name: "asc" } }],
        include: {
          product: { select: { id: true, code: true, name: true, unit: true, categoryName: true } },
          branch: { select: { id: true, name: true } },
          assignee: { select: { id: true, displayName: true, username: true } }
        }
      }),
      prisma.user.findMany({ where: { isActive: true }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true, username: true, role: true } }),
      prisma.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.product.findMany({ where: { isActive: true }, orderBy: [{ categoryName: "asc" }, { name: "asc" }], select: { id: true, code: true, name: true, unit: true, categoryName: true } })
    ]);
    const executors = [];
    for (const user of users) {
      const permissions = await getInventoryCountPermissions(user.id, user.role);
      if (permissions.includes("COUNT_EXECUTE")) executors.push({ id: user.id, displayName: user.displayName, username: user.username });
    }
    return NextResponse.json({ assignments, executors, branches, products });
  } catch (error) {
    return responseError(error);
  }
}

// Giữ endpoint cũ để các client đã triển khai vẫn có thể thêm một mã hàng.
export async function POST(request: NextRequest) {
  try {
    const actor = await requireInventoryCountPermission("COUNT_MANAGE");
    const body = await request.json() as { productId?: unknown; branchId?: unknown; assigneeId?: unknown };
    const productId = parsePositiveInt(body.productId);
    const branchId = parsePositiveInt(body.branchId);
    const assigneeId = parsePositiveInt(body.assigneeId);
    if (!productId || !branchId || !assigneeId) return NextResponse.json({ message: "Chọn sản phẩm, kho và nhân viên hợp lệ." }, { status: 400 });
    const result = await mergeAssignmentGroups([{ branchId, assigneeId, productIds: [productId] }], actor.sub);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return responseError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await requireInventoryCountPermission("COUNT_MANAGE");
    const body = await request.json() as { branchId?: unknown; assigneeId?: unknown; productIds?: unknown };
    const branchId = parsePositiveInt(body.branchId);
    const assigneeId = parsePositiveInt(body.assigneeId);
    if (!branchId || !assigneeId || !Array.isArray(body.productIds)) {
      return NextResponse.json({ message: "Chọn kho, nhân viên và danh sách sản phẩm hợp lệ." }, { status: 400 });
    }
    const result = await replaceAssignmentList({
      branchId,
      assigneeId,
      productIds: uniquePositiveInts(body.productIds),
      actorId: actor.sub
    });
    return NextResponse.json(result);
  } catch (error) {
    return responseError(error);
  }
}

function responseError(error: unknown) {
  const status = error instanceof InventoryCountAccessError || error instanceof AssignmentManagementError ? error.status : 400;
  const details = error instanceof AssignmentManagementError ? error.details : undefined;
  return NextResponse.json({
    message: error instanceof Error ? error.message : "Không thể xử lý phân công Kiểm kho.",
    ...details
  }, { status });
}
