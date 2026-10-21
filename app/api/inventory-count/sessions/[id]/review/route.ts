import { NextRequest, NextResponse } from "next/server";
import { InventoryCountAccessError, requireInventoryCountPermission } from "@/lib/auth/inventory-count";
import { addInventoryCountAudit } from "@/lib/inventory-count/service";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireInventoryCountPermission("COUNT_MANAGE");
    const { id } = await params;
    const body = await request.json() as { decision?: "approve" | "return"; reason?: string };
    if (body.decision !== "approve" && body.decision !== "return") return NextResponse.json({ message: "Chọn duyệt hoặc trả kiểm lại." }, { status: 400 });
    if (body.decision === "return" && !body.reason?.trim()) return NextResponse.json({ message: "Nhập lý do trả kiểm lại." }, { status: 400 });
    const session = await prisma.inventoryCountSession.findUnique({ where: { id }, select: { status: true } });
    if (!session || session.status !== "SUBMITTED") return NextResponse.json({ message: "Chỉ có thể duyệt phiên đã gửi." }, { status: 409 });
    await prisma.$transaction(async (tx) => {
      if (body.decision === "approve") {
        await tx.inventoryCountSession.update({ where: { id }, data: { status: "APPROVED", reviewedById: actor.sub, reviewedAt: new Date(), returnReason: null } });
      } else {
        await tx.inventoryCountSession.update({ where: { id }, data: { status: "RETURNED", reviewedById: actor.sub, reviewedAt: new Date(), returnReason: body.reason!.trim() } });
        await tx.inventoryCountLine.updateMany({ where: { sessionId: id, status: { in: ["NO_ADJUSTMENT", "AWAITING_DECISION"] } }, data: { status: "COUNTING", systemOnHandAtSubmit: null, inventoryVersionAtSubmit: null, difference: null } });
      }
      await addInventoryCountAudit(tx, { entityType: "SESSION", entityId: id, action: body.decision === "approve" ? "APPROVED" : "RETURNED", actorId: actor.sub, payload: { reason: body.reason?.trim() ?? null } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) { const status = error instanceof InventoryCountAccessError ? error.status : 400; return NextResponse.json({ message: error instanceof Error ? error.message : "Không thể duyệt phiên." }, { status }); }
}
