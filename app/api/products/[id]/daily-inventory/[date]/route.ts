import { NextRequest, NextResponse } from "next/server";
import { dateOnly, eachBusinessDate } from "@/lib/inventory-ledger";
import { prisma } from "@/lib/prisma";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string; date: string }> }) {
  try {
    const { id, date } = await context.params;
    const productId = positiveInt(id);
    const businessDate = validDate(date);
    const body = (await request.json()) as Record<string, unknown>;
    const branchId = positiveInt(body.branchId);
    const openingOverride = finiteNumberOrNull(body.openingOverride);
    const actualOnHand = finiteNumberOrNull(body.actualOnHand);
    const note = optionalNote(body.note);
    const expectedUpdatedAt = optionalIsoDate(body.expectedUpdatedAt);

    const [product, branch] = await Promise.all([
      prisma.product.findUnique({ where: { id: productId }, select: { id: true } }),
      prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } })
    ]);

    if (!product || !branch) {
      return NextResponse.json({ message: "Không tìm thấy sản phẩm hoặc kho." }, { status: 404 });
    }

    const existing = await prisma.productDailyInventoryEntry.findUnique({
      where: { productId_branchId_businessDate: { productId, branchId, businessDate: dateOnly(businessDate) } }
    });

    if (expectedUpdatedAt && existing && existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      return NextResponse.json({ message: "Dòng này vừa được cập nhật ở nơi khác. Hãy tải lại trước khi lưu." }, { status: 409 });
    }

    const next = { openingOverride, actualOnHand, note };
    const entry = await prisma.$transaction(async (tx) => {
      const saved = await tx.productDailyInventoryEntry.upsert({
        where: { productId_branchId_businessDate: { productId, branchId, businessDate: dateOnly(businessDate) } },
        create: { productId, branchId, businessDate: dateOnly(businessDate), ...next },
        update: next
      });
      await tx.productDailyInventoryAudit.create({
        data: {
          entryId: saved.id,
          previousJson: existing ? JSON.stringify(serializeEntry(existing)) : null,
          nextJson: JSON.stringify(serializeEntry(saved))
        }
      });
      return saved;
    });

    return NextResponse.json({
      entry: {
        date: businessDate,
        openingOverride: entry.openingOverride === null ? null : Number(entry.openingOverride),
        actualOnHand: entry.actualOnHand === null ? null : Number(entry.actualOnHand),
        note: entry.note,
        updatedAt: entry.updatedAt.toISOString()
      }
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Không thể lưu kiểm kê ngày." },
      { status: 400 }
    );
  }
}

function positiveInt(value: unknown) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("Mã sản phẩm hoặc kho không hợp lệ.");
  return parsed;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Ngày không hợp lệ.");
  eachBusinessDate(value, value);
  return value;
}

function finiteNumberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Số lượng không hợp lệ.");
  return parsed;
}

function optionalNote(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error("Ghi chú không hợp lệ.");
  const note = value.trim();
  if (note.length > 1000) throw new Error("Ghi chú không được vượt quá 1.000 ký tự.");
  return note || null;
}

function optionalIsoDate(value: unknown) {
  if (!value) return undefined;
  if (typeof value !== "string") throw new Error("Thời điểm cập nhật không hợp lệ.");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Thời điểm cập nhật không hợp lệ.");
  return date;
}

function serializeEntry(entry: {
  openingOverride: unknown;
  actualOnHand: unknown;
  note: string | null;
  updatedAt: Date;
}) {
  return {
    openingOverride: entry.openingOverride === null ? null : Number(entry.openingOverride),
    actualOnHand: entry.actualOnHand === null ? null : Number(entry.actualOnHand),
    note: entry.note,
    updatedAt: entry.updatedAt.toISOString()
  };
}
