import { NextRequest, NextResponse } from "next/server";
import { getInventoryCountActor, InventoryCountAccessError } from "@/lib/auth/inventory-count";
import { addInventoryCountAudit, latestInventoryPosition } from "@/lib/inventory-count/service";
import { prisma } from "@/lib/prisma";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getInventoryCountActor();
    if (!actor.permissions.includes("COUNT_EXECUTE")) throw new InventoryCountAccessError("Bạn không có quyền gửi kết quả kiểm kho.");
    const { id } = await params;
    const session = await prisma.inventoryCountSession.findUnique({ where: { id }, include: { lines: true } });
    if (!session) return NextResponse.json({ message: "Không tìm thấy phiên Kiểm kho." }, { status: 404 });
    if (session.assigneeId !== actor.sub || !["DRAFT", "IN_PROGRESS", "RETURNED"].includes(session.status)) throw new InventoryCountAccessError("Phiên này không thể gửi lại.");
    if (session.lines.some((line) => line.actualCount === null)) return NextResponse.json({ message: "Nhập đủ số kiểm thực tế cho tất cả sản phẩm trước khi gửi." }, { status: 400 });
    const positions = await Promise.all(session.lines.map((line) => latestInventoryPosition(line.productId, session.branchId)));
    if (positions.some((position) => !position.snapshotDate)) return NextResponse.json({ message: "Chưa có snapshot tồn kho mới nhất cho một số sản phẩm. Hãy đồng bộ tồn kho rồi thử lại." }, { status: 409 });
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      for (let index = 0; index < session.lines.length; index += 1) {
        const line = session.lines[index];
        const position = positions[index];
        const actual = Number(line.actualCount);
        const difference = actual - position.onHand;
        await tx.inventoryCountLine.update({ where: { id: line.id }, data: { systemOnHandAtSubmit: position.onHand, inventoryVersionAtSubmit: position.version, difference, status: Math.abs(difference) < 0.000001 ? "NO_ADJUSTMENT" : "AWAITING_DECISION" } });
      }
      await tx.inventoryCountSession.update({ where: { id }, data: { status: "SUBMITTED", submittedAt: now, returnReason: null } });
      await addInventoryCountAudit(tx, { entityType: "SESSION", entityId: id, action: "SUBMITTED", actorId: actor.sub, payload: { lineCount: session.lines.length } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) { const status = error instanceof InventoryCountAccessError ? error.status : 400; return NextResponse.json({ message: error instanceof Error ? error.message : "Không thể gửi phiên Kiểm kho." }, { status }); }
}
