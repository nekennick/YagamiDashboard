import { NextResponse } from "next/server";
import { getInventoryCountActor, InventoryCountAccessError } from "@/lib/auth/inventory-count";
import { addInventoryCountAudit } from "@/lib/inventory-count/service";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getInventoryCountActor();
    if (actor.role !== "ADMIN") throw new InventoryCountAccessError("Chỉ quản trị viên mới được kết thúc phiên Kiểm kho.");
    const { id } = await params;
    const session = await prisma.inventoryCountSession.findUnique({
      where: { id },
      include: { lines: { include: { batchLines: { include: { batch: { select: { status: true } } } } } } }
    });
    if (!session) return NextResponse.json({ message: "Không tìm thấy phiên Kiểm kho." }, { status: 404 });
    if (["COMPLETED", "CANCELLED"].includes(session.status)) return NextResponse.json({ message: "Phiên này đã kết thúc." }, { status: 409 });
    if (session.lines.some((line) => line.batchLines.length > 0)) {
      return NextResponse.json({ message: "Không thể kết thúc phiên vì đã có mặt hàng nằm trong danh sách chờ cân bằng. Hãy xử lý đợt cân bằng trước để tránh mất dấu vết số liệu." }, { status: 409 });
    }
    await prisma.$transaction(async (tx) => {
      await tx.inventoryCountLine.updateMany({ where: { sessionId: id }, data: { status: "CANCELLED", activeLockKey: null } });
      await tx.inventoryCountSession.update({ where: { id }, data: { status: "CANCELLED", completedAt: new Date() } });
      await addInventoryCountAudit(tx, { entityType: "SESSION", entityId: id, action: "CANCELLED_BY_ADMIN", actorId: actor.sub });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof InventoryCountAccessError ? error.status : 400;
    return NextResponse.json({ message: error instanceof Error ? error.message : "Không thể kết thúc phiên Kiểm kho." }, { status });
  }
}
