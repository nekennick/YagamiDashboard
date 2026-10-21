import { NextRequest, NextResponse } from "next/server";
import { canManageInventoryCount, getInventoryCountActor, InventoryCountAccessError, requireInventoryCountPermission } from "@/lib/auth/inventory-count";
import { addInventoryCountAudit } from "@/lib/inventory-count/service";
import { prisma } from "@/lib/prisma";

const sessionInclude = { branch: { select: { id: true, name: true } }, assignee: { select: { id: true, displayName: true, username: true } }, lines: { include: { product: { select: { id: true, code: true, name: true, unit: true } } }, orderBy: { product: { name: "asc" as const } } } };

export async function GET() {
  try {
    const actor = await getInventoryCountActor();
    const canManage = canManageInventoryCount(actor.permissions);
    const sessions = await prisma.inventoryCountSession.findMany({
      where: canManage ? {} : { assigneeId: actor.sub },
      include: sessionInclude,
      orderBy: { updatedAt: "desc" },
      take: canManage ? 80 : 20
    });
    return NextResponse.json({ sessions, permissions: actor.permissions, actorId: actor.sub });
  } catch (error) { return responseError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireInventoryCountPermission("COUNT_MANAGE");
    const body = await request.json() as { branchId?: number; assigneeId?: number; productIds?: number[] };
    if (!positiveInt(body.branchId) || !positiveInt(body.assigneeId) || !Array.isArray(body.productIds) || body.productIds.length === 0) return NextResponse.json({ message: "Chọn kho, nhân viên và ít nhất một sản phẩm." }, { status: 400 });
    const productIds = [...new Set(body.productIds.filter(positiveInt))];
    const assignments = await prisma.inventoryCountAssignment.findMany({ where: { branchId: body.branchId, assigneeId: body.assigneeId, isActive: true, productId: { in: productIds } }, select: { productId: true } });
    if (assignments.length !== productIds.length) return NextResponse.json({ message: "Chỉ được tạo phiên từ các sản phẩm đã phân công cho nhân viên này." }, { status: 400 });
    const session = await prisma.$transaction(async (tx) => {
      const result = await tx.inventoryCountSession.create({
        data: { branchId: body.branchId!, assigneeId: body.assigneeId!, createdById: actor.sub, status: "IN_PROGRESS", lines: { create: productIds.map((productId) => ({ productId, activeLockKey: `${body.branchId}:${productId}` })) } },
        include: sessionInclude
      });
      await addInventoryCountAudit(tx, { entityType: "SESSION", entityId: result.id, action: "CREATED", actorId: actor.sub, payload: { branchId: body.branchId, assigneeId: body.assigneeId, productIds } });
      return result;
    });
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) { return responseError(error); }
}

function positiveInt(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value > 0; }
function responseError(error: unknown) { const status = error instanceof InventoryCountAccessError ? error.status : 400; const duplicate = error instanceof Error && error.message.includes("Unique constraint"); return NextResponse.json({ message: duplicate ? "Một sản phẩm trong danh sách đang thuộc phiên kiểm chưa kết thúc." : error instanceof Error ? error.message : "Không thể xử lý phiên Kiểm kho." }, { status }); }
