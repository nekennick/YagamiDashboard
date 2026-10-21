import { NextRequest, NextResponse } from "next/server";
import { requireInventoryCountPermission, InventoryCountAccessError } from "@/lib/auth/inventory-count";
import { addInventoryCountAudit, completeSessionIfResolved, latestInventoryPosition } from "@/lib/inventory-count/service";
import { balanceRemoteStocktake, createRemoteStocktake } from "@/lib/kiotviet/internal-stocktake-write";
import { syncKiotVietBatch } from "@/lib/kiotviet/sync";
import { prisma } from "@/lib/prisma";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let batchId: string | null = null;
  try {
    const actor = await requireInventoryCountPermission("COUNT_BALANCE");
    const { id } = await params;
    batchId = id;
    const batch = await prisma.inventoryBalanceBatch.findUnique({
      where: { id },
      include: {
        branch: { select: { kvBranchId: true } },
        lines: { include: { line: { include: {
          product: { select: { kvProductId: true, name: true, code: true } },
          session: { select: { submittedAt: true } }
        } } } }
      }
    });
    if (!batch) return NextResponse.json({ message: "Không tìm thấy đợt cân bằng." }, { status: 404 });
    if (!["PENDING", "FAILED_RETRYABLE", "REMOTE_DRAFT"].includes(batch.status)) return NextResponse.json({ message: "Đợt này không còn ở trạng thái có thể cân bằng." }, { status: 409 });
    if (process.env.KIOTVIET_STOCKTAKE_WRITE_ENABLED !== "true") return NextResponse.json({ message: "Chế độ ghi KiotViet đang tắt. Thiết lập KIOTVIET_STOCKTAKE_WRITE_ENABLED=true sau khi kiểm tra dry-run." }, { status: 409 });
    const stale = await isStale(batch);
    if (stale) {
      await prisma.$transaction(async (tx) => {
        await tx.inventoryBalanceBatch.update({ where: { id }, data: { status: "STALE", lastError: "Tồn kho đã thay đổi sau khi nhân viên gửi kết quả." } });
        await tx.inventoryCountLine.updateMany({ where: { id: { in: batch.lines.map((item) => item.lineId) } }, data: { status: "AWAITING_DECISION" } });
        await addInventoryCountAudit(tx, { entityType: "BATCH", entityId: id, action: "STALE", actorId: actor.sub });
      });
      return NextResponse.json({ message: "Dữ liệu đã biến động sau khi gửi; toàn bộ đợt cân bằng đã dừng." }, { status: 409 });
    }
    const lines = batch.lines.map((item) => ({ kvProductId: item.line.product.kvProductId, name: item.line.product.name, code: item.line.product.code, actualCount: Number(item.actualCountSnapshot) }));
    let remote = batch.kvStocktakeId && batch.kvStocktakeCode ? { id: batch.kvStocktakeId, code: batch.kvStocktakeCode, uuid: batch.kvStocktakeUuid } : null;
    if (!remote) {
      remote = await createRemoteStocktake({ kvBranchId: batch.branch.kvBranchId, marker: batch.marker, lines });
      await prisma.inventoryBalanceBatch.update({ where: { id }, data: { status: "REMOTE_DRAFT", kvStocktakeId: remote.id, kvStocktakeCode: remote.code, kvStocktakeUuid: remote.uuid, remoteDraftAt: new Date() } });
    }
    if (await isStale(batch)) {
      await prisma.inventoryBalanceBatch.update({ where: { id }, data: { status: "REMOTE_DRAFT_STALE", lastError: "Dữ liệu thay đổi sau khi tạo phiếu tạm KiotViet." } });
      return NextResponse.json({ message: "Phiếu tạm đã tạo nhưng dữ liệu vừa biến động; hệ thống không cân bằng phiếu này." }, { status: 409 });
    }
    await prisma.inventoryBalanceBatch.update({ where: { id }, data: { status: "BALANCING", lastError: null } });
    await balanceRemoteStocktake({ kvBranchId: batch.branch.kvBranchId, marker: batch.marker, stocktake: remote, lines });
    await prisma.inventoryBalanceBatch.update({ where: { id }, data: { status: "BALANCED_SYNC_PENDING", balancedAt: new Date() } });
    await syncKiotVietBatch(["stocktakes", "inventory"]);
    await prisma.$transaction(async (tx) => {
      await tx.inventoryBalanceBatch.update({ where: { id }, data: { status: "BALANCED", lastError: null } });
      await tx.inventoryCountLine.updateMany({ where: { id: { in: batch.lines.map((item) => item.lineId) } }, data: { status: "BALANCED", activeLockKey: null } });
      for (const sessionId of new Set(batch.lines.map((item) => item.line.sessionId))) await completeSessionIfResolved(tx, sessionId);
      await addInventoryCountAudit(tx, { entityType: "BATCH", entityId: id, action: "BALANCED", actorId: actor.sub, payload: { kvStocktakeCode: remote.code } });
    });
    return NextResponse.json({ ok: true, stocktakeCode: remote.code });
  } catch (error) {
    if (batchId) {
      await prisma.inventoryBalanceBatch.updateMany({
        where: { id: batchId, status: { in: ["REMOTE_DRAFT", "BALANCING", "BALANCED_SYNC_PENDING"] } },
        data: { status: "FAILED_RETRYABLE", lastError: error instanceof Error ? error.message.slice(0, 1000) : "Lỗi không xác định khi cân bằng kho." }
      }).catch(() => undefined);
    }
    const status = error instanceof InventoryCountAccessError ? error.status : 500;
    return NextResponse.json({ message: error instanceof Error ? error.message : "Không thể cân bằng kho." }, { status });
  }
}

async function isStale(batch: { branchId: number; lines: Array<{ inventoryVersionSnapshot: number; systemOnHandSnapshot: unknown; line: { productId: number; session: { submittedAt: Date | null } } }> }) {
  const positions = await Promise.all(batch.lines.map((item) => latestInventoryPosition(item.line.productId, batch.branchId)));
  return batch.lines.some((line, index) => positions[index].version !== line.inventoryVersionSnapshot || Math.abs(positions[index].onHand - Number(line.systemOnHandSnapshot)) > 0.000001 || (positions[index].snapshotDate && line.line.session.submittedAt && positions[index].snapshotDate > line.line.session.submittedAt));
}
