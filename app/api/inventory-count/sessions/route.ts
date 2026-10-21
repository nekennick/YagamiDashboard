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
    const body = await request.json() as { branchId?: number; assigneeId?: number; assigneeIds?: number[]; productIds?: number[] };
    if (!positiveInt(body.branchId)) return NextResponse.json({ message: "Chọn kho hợp lệ." }, { status: 400 });

    let targetAssigneeIds: number[] = [];
    if (Array.isArray(body.assigneeIds)) {
      targetAssigneeIds = [...new Set(body.assigneeIds.filter(positiveInt))];
    } else if (positiveInt(body.assigneeId)) {
      targetAssigneeIds = [body.assigneeId];
    }

    if (targetAssigneeIds.length === 0) {
      return NextResponse.json({ message: "Chọn ít nhất một nhân viên hợp lệ." }, { status: 400 });
    }

    const requestedProductIds = Array.isArray(body.productIds) ? [...new Set(body.productIds.filter(positiveInt))] : null;
    if (requestedProductIds && requestedProductIds.length === 0) return NextResponse.json({ message: "Chọn ít nhất một sản phẩm." }, { status: 400 });

    const createdSessions = await prisma.$transaction(async (tx) => {
      const sessions = [];
      for (const assigneeId of targetAssigneeIds) {
        const activeSession = await tx.inventoryCountSession.findFirst({
          where: { branchId: body.branchId, assigneeId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
          select: { id: true, assignee: { select: { displayName: true } } }
        });
        if (activeSession) {
          const name = activeSession.assignee?.displayName || `ID ${assigneeId}`;
          throw new Error(`Nhân viên "${name}" đang có một phiên kiểm chưa kết thúc tại kho đã chọn.`);
        }

        const assignments = await tx.inventoryCountAssignment.findMany({
          where: {
            branchId: body.branchId,
            assigneeId,
            isActive: true,
            ...(requestedProductIds ? { productId: { in: requestedProductIds } } : {})
          },
          select: { productId: true }
        });
        const productIds = assignments.map((assignment) => assignment.productId);
        if (!productIds.length || (requestedProductIds && assignments.length !== requestedProductIds.length)) {
          const user = await tx.user.findUnique({ where: { id: assigneeId }, select: { displayName: true } });
          throw new Error(`Nhân viên "${user?.displayName || assigneeId}" chưa có sản phẩm được phân công phù hợp để lập phiên.`);
        }

        const session = await tx.inventoryCountSession.create({
          data: {
            branchId: body.branchId!,
            assigneeId,
            createdById: actor.sub,
            status: "IN_PROGRESS",
            lines: {
              create: productIds.map((productId) => ({
                productId,
                activeLockKey: `${body.branchId}:${productId}`
              }))
            }
          },
          include: sessionInclude
        });
        await addInventoryCountAudit(tx, {
          entityType: "SESSION",
          entityId: session.id,
          action: "CREATED",
          actorId: actor.sub,
          payload: { branchId: body.branchId, assigneeId, productIds }
        });
        sessions.push(session);
      }
      return sessions;
    });

    return NextResponse.json({
      sessions: createdSessions,
      session: createdSessions[0],
      createdCount: createdSessions.length
    }, { status: 201 });
  } catch (error) { return responseError(error); }
}

function positiveInt(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value > 0; }
function responseError(error: unknown) { const status = error instanceof InventoryCountAccessError ? error.status : 400; const duplicate = error instanceof Error && error.message.includes("Unique constraint"); return NextResponse.json({ message: duplicate ? "Một sản phẩm trong danh sách đang thuộc phiên kiểm chưa kết thúc." : error instanceof Error ? error.message : "Không thể xử lý phiên Kiểm kho." }, { status }); }
