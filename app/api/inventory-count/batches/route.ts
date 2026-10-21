import { NextRequest, NextResponse } from "next/server";
import { InventoryCountAccessError, requireInventoryCountPermission } from "@/lib/auth/inventory-count";
import { addInventoryCountAudit } from "@/lib/inventory-count/service";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireInventoryCountPermission("COUNT_MANAGE");
    const [batches, readyLines] = await Promise.all([
      prisma.inventoryBalanceBatch.findMany({
        orderBy: { updatedAt: "desc" }, take: 40,
        include: {
          branch: { select: { name: true } },
          lines: { include: { line: { include: {
            product: { select: { name: true, code: true, unit: true } },
            session: { select: { submittedAt: true } }
          } } } }
        }
      }),
      prisma.inventoryCountLine.findMany({
        where: { status: "AWAITING_DECISION", session: { status: "APPROVED" } },
        include: { product: { select: { name: true, code: true, unit: true } }, session: { include: { branch: { select: { id: true, name: true } } } } },
        orderBy: { session: { submittedAt: "desc" } }
      })
    ]);
    return NextResponse.json({ batches, readyLines });
  } catch (error) { return responseError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireInventoryCountPermission("COUNT_MANAGE");
    const body = await request.json() as { lineIds?: string[] };
    const lineIds = [...new Set((body.lineIds ?? []).filter((value): value is string => typeof value === "string" && value.length > 0))];
    if (lineIds.length === 0) return NextResponse.json({ message: "Chọn ít nhất một dòng chênh lệch để cân bằng." }, { status: 400 });
    const lines = await prisma.inventoryCountLine.findMany({ where: { id: { in: lineIds }, status: "AWAITING_DECISION", session: { status: "APPROVED" } }, include: { session: { select: { branchId: true } } } });
    if (lines.length !== lineIds.length) return NextResponse.json({ message: "Một số dòng không còn đủ điều kiện đưa vào danh sách chờ." }, { status: 409 });
    const branchId = lines[0]?.session.branchId;
    if (!branchId || lines.some((line) => line.session.branchId !== branchId || line.actualCount === null || line.systemOnHandAtSubmit === null || line.difference === null || line.inventoryVersionAtSubmit === null)) return NextResponse.json({ message: "Một batch chỉ chứa các dòng đầy đủ dữ liệu của cùng một kho." }, { status: 400 });
    const batch = await prisma.$transaction(async (tx) => {
      const result = await tx.inventoryBalanceBatch.create({
        data: {
          branchId,
          createdById: actor.sub,
          marker: `YAGAMI-COUNT-${crypto.randomUUID()}`,
          lines: { create: lines.map((line) => ({ lineId: line.id, actualCountSnapshot: line.actualCount!, systemOnHandSnapshot: line.systemOnHandAtSubmit!, differenceSnapshot: line.difference!, inventoryVersionSnapshot: line.inventoryVersionAtSubmit! })) }
        },
        include: { branch: { select: { name: true } }, lines: true }
      });
      await tx.inventoryCountLine.updateMany({ where: { id: { in: lineIds } }, data: { status: "QUEUED" } });
      await addInventoryCountAudit(tx, { entityType: "BATCH", entityId: result.id, action: "QUEUED", actorId: actor.sub, payload: { lineIds } });
      return result;
    });
    return NextResponse.json({ batch }, { status: 201 });
  } catch (error) { return responseError(error); }
}

function responseError(error: unknown) { const status = error instanceof InventoryCountAccessError ? error.status : 400; return NextResponse.json({ message: error instanceof Error ? error.message : "Không thể tạo danh sách chờ cân bằng." }, { status }); }
