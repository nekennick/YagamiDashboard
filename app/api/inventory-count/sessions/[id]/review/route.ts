import { NextRequest, NextResponse } from "next/server";
import { InventoryCountAccessError, requireInventoryCountPermission } from "@/lib/auth/inventory-count";
import { addInventoryCountAudit } from "@/lib/inventory-count/service";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireInventoryCountPermission("COUNT_MANAGE");
    const { id } = await params;
    const body = await request.json() as { decision?: "approve" | "return"; action?: "approve" | "return"; reason?: string; lineId?: string };
    const decision = body.decision ?? body.action;
    if (decision !== "approve" && decision !== "return") return NextResponse.json({ message: "Chọn duyệt hoặc trả kiểm lại." }, { status: 400 });
    if (decision === "return" && !body.reason?.trim()) return NextResponse.json({ message: "Nhập lý do trả kiểm lại." }, { status: 400 });
    const session = await prisma.inventoryCountSession.findUnique({ where: { id }, select: { status: true } });
    if (!session) return NextResponse.json({ message: "Không tìm thấy phiên kiểm kho." }, { status: 404 });
    const canReview = session.status === "SUBMITTED" || (decision === "return" && session.status === "RETURNED");
    if (!canReview) return NextResponse.json({ message: "Chỉ có thể thao tác với phiên đã gửi hoặc đang yêu cầu kiểm lại." }, { status: 409 });
    if (decision === "approve" && session.status !== "SUBMITTED") return NextResponse.json({ message: "Chỉ có thể duyệt phiên đã gửi." }, { status: 409 });
    await prisma.$transaction(async (tx) => {
      if (decision === "approve") {
        await tx.inventoryCountSession.update({ where: { id }, data: { status: "APPROVED", reviewedById: actor.sub, reviewedAt: new Date(), returnReason: null } });
      } else if (body.lineId) {
        const line = await tx.inventoryCountLine.findFirst({
          where: { id: body.lineId, sessionId: id },
          include: { product: { select: { code: true, name: true } } }
        });
        if (!line) throw new Error("Không tìm thấy mặt hàng cần trả lại.");
        await tx.inventoryCountSession.update({ where: { id }, data: { status: "RETURNED", reviewedById: actor.sub, reviewedAt: new Date(), returnReason: body.reason!.trim() } });
        await tx.inventoryCountLine.update({
          where: { id: line.id },
          data: { actualCount: null, countedAt: null, status: "COUNTING", systemOnHandAtSubmit: null, inventoryVersionAtSubmit: null, difference: null, resolutionReason: body.reason!.trim() }
        });
        await addInventoryCountAudit(tx, {
          entityType: "LINE",
          entityId: line.id,
          action: "RETURNED_FOR_RECOUNT",
          actorId: actor.sub,
          payload: { reason: body.reason!.trim(), productCode: line.product.code, productName: line.product.name }
        });
      } else {
        await tx.inventoryCountSession.update({ where: { id }, data: { status: "RETURNED", reviewedById: actor.sub, reviewedAt: new Date(), returnReason: body.reason!.trim() } });
        await tx.inventoryCountLine.updateMany({ where: { sessionId: id, status: { in: ["NO_ADJUSTMENT", "AWAITING_DECISION", "COUNTING"] } }, data: { status: "COUNTING", actualCount: null, countedAt: null, systemOnHandAtSubmit: null, inventoryVersionAtSubmit: null, difference: null } });
      }
      await addInventoryCountAudit(tx, { entityType: "SESSION", entityId: id, action: decision === "approve" ? "APPROVED" : body.lineId ? "LINE_RETURNED" : "RETURNED", actorId: actor.sub, payload: { reason: body.reason?.trim() ?? null, lineId: body.lineId ?? null } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) { const status = error instanceof InventoryCountAccessError ? error.status : 400; return NextResponse.json({ message: error instanceof Error ? error.message : "Không thể duyệt phiên." }, { status }); }
}
