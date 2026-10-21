import { NextRequest, NextResponse } from "next/server";
import { canManageInventoryCount, getInventoryCountActor, InventoryCountAccessError } from "@/lib/auth/inventory-count";
import { addInventoryCountAudit, parseCount } from "@/lib/inventory-count/service";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getInventoryCountActor();
    if (!actor.permissions.includes("COUNT_EXECUTE")) throw new InventoryCountAccessError("Bạn không có quyền nhập số kiểm kho.");
    const { id } = await params;
    const body = await request.json() as { lineId?: string; actualCount?: string | number };
    if (!body.lineId) return NextResponse.json({ message: "Thiếu dòng sản phẩm cần lưu." }, { status: 400 });
    const actualCount = parseCount(body.actualCount);
    if (actualCount === null) return NextResponse.json({ message: "Số kiểm thực tế phải là số không âm." }, { status: 400 });
    const line = await prisma.inventoryCountLine.findFirst({ where: { id: body.lineId, sessionId: id }, include: { session: { select: { assigneeId: true, status: true } } } });
    if (!line) return NextResponse.json({ message: "Không tìm thấy dòng kiểm kho." }, { status: 404 });
    if (line.session.assigneeId !== actor.sub || !["DRAFT", "IN_PROGRESS", "RETURNED"].includes(line.session.status)) throw new InventoryCountAccessError("Phiên này không còn cho phép sửa số kiểm.");
    const saved = await prisma.$transaction(async (tx) => {
      const next = await tx.inventoryCountLine.update({ where: { id: line.id }, data: { actualCount, countedAt: new Date(), status: "COUNTING" }, select: { id: true, actualCount: true, countedAt: true } });
      await tx.inventoryCountSession.update({ where: { id }, data: { status: "IN_PROGRESS", returnReason: null } });
      await addInventoryCountAudit(tx, { entityType: "LINE", entityId: line.id, action: "COUNT_SAVED", actorId: actor.sub, payload: { actualCount } });
      return next;
    });
    return NextResponse.json({ line: saved });
  } catch (error) { return responseError(error); }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getInventoryCountActor();
    const { id } = await params;
    const session = await prisma.inventoryCountSession.findUnique({ where: { id }, include: { branch: { select: { id: true, name: true } }, assignee: { select: { id: true, displayName: true } }, lines: { include: { product: { select: { id: true, code: true, name: true, unit: true } } }, orderBy: { product: { name: "asc" } } } } });
    if (!session) return NextResponse.json({ message: "Không tìm thấy phiên Kiểm kho." }, { status: 404 });
    if (session.assigneeId !== actor.sub && !canManageInventoryCount(actor.permissions)) throw new InventoryCountAccessError("Bạn không có quyền xem phiên này.");
    return NextResponse.json({ session, permissions: actor.permissions });
  } catch (error) { return responseError(error); }
}

function responseError(error: unknown) { const status = error instanceof InventoryCountAccessError ? error.status : 400; return NextResponse.json({ message: error instanceof Error ? error.message : "Không thể xử lý dòng kiểm kho." }, { status }); }
