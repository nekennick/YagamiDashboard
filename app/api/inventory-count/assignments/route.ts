import { NextRequest, NextResponse } from "next/server";
import { getInventoryCountPermissions, InventoryCountAccessError, requireInventoryCountPermission } from "@/lib/auth/inventory-count";
import { addInventoryCountAudit } from "@/lib/inventory-count/service";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireInventoryCountPermission("COUNT_MANAGE");
    const [assignments, users, branches, products] = await Promise.all([
      prisma.inventoryCountAssignment.findMany({
        orderBy: [{ branch: { name: "asc" } }, { product: { name: "asc" } }],
        include: { product: { select: { id: true, code: true, name: true, unit: true } }, branch: { select: { id: true, name: true } }, assignee: { select: { id: true, displayName: true, username: true } } }
      }),
      prisma.user.findMany({ where: { isActive: true }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true, username: true, role: true } }),
      prisma.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.product.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true, unit: true } })
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

export async function POST(request: NextRequest) {
  try {
    const actor = await requireInventoryCountPermission("COUNT_MANAGE");
    const body = await request.json() as { productId?: number; branchId?: number; assigneeId?: number };
    if (!positiveInt(body.productId) || !positiveInt(body.branchId) || !positiveInt(body.assigneeId)) return NextResponse.json({ message: "Chọn sản phẩm, kho và nhân viên hợp lệ." }, { status: 400 });
    const assignee = await prisma.user.findUnique({ where: { id: body.assigneeId }, select: { id: true, role: true, isActive: true } });
    if (!assignee?.isActive || !(await getInventoryCountPermissions(assignee.id, assignee.role)).includes("COUNT_EXECUTE")) return NextResponse.json({ message: "Nhân viên chưa được cấp quyền Kiểm kho." }, { status: 400 });
    const assignment = await prisma.$transaction(async (tx) => {
      const previous = await tx.inventoryCountAssignment.findUnique({ where: { productId_branchId: { productId: body.productId!, branchId: body.branchId! } } });
      const result = await tx.inventoryCountAssignment.upsert({
        where: { productId_branchId: { productId: body.productId!, branchId: body.branchId! } },
        create: { productId: body.productId!, branchId: body.branchId!, assigneeId: body.assigneeId!, assignedById: actor.sub, isActive: true },
        update: { assigneeId: body.assigneeId!, assignedById: actor.sub, isActive: true }
      });
      await tx.inventoryCountAssignmentAudit.create({ data: { assignmentId: result.id, action: previous ? "REASSIGNED" : "ASSIGNED", previousJson: previous ? JSON.stringify({ assigneeId: previous.assigneeId, isActive: previous.isActive }) : null, nextJson: JSON.stringify({ assigneeId: result.assigneeId, isActive: result.isActive }), actorId: actor.sub } });
      await addInventoryCountAudit(tx, { entityType: "ASSIGNMENT", entityId: String(result.id), action: previous ? "REASSIGNED" : "ASSIGNED", actorId: actor.sub, payload: { productId: body.productId, branchId: body.branchId, assigneeId: body.assigneeId } });
      return result;
    });
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    return responseError(error);
  }
}

function positiveInt(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value > 0; }
function responseError(error: unknown) { const status = error instanceof InventoryCountAccessError ? error.status : 400; return NextResponse.json({ message: error instanceof Error ? error.message : "Không thể xử lý phân công Kiểm kho." }, { status }); }
