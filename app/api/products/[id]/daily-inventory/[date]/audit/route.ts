import { NextRequest, NextResponse } from "next/server";
import { dateOnly } from "@/lib/inventory-ledger";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; date: string }> }
) {
  try {
    const { id, date } = await context.params;
    const productId = Number(id);
    const branchId = Number(request.nextUrl.searchParams.get("branchId"));

    if (!productId || !branchId) {
      return NextResponse.json({ message: "Thiếu productId hoặc branchId" }, { status: 400 });
    }

    const entry = await prisma.productDailyInventoryEntry.findUnique({
      where: {
        productId_branchId_businessDate: {
          productId,
          branchId,
          businessDate: dateOnly(date)
        }
      },
      include: {
        audits: {
          orderBy: { createdAt: "desc" },
          take: 50
        }
      }
    });

    if (!entry) {
      return NextResponse.json({ audits: [] });
    }

    const audits = entry.audits.map((a) => {
      let prev: Record<string, unknown> | null = null;
      let next: Record<string, unknown> | null = null;
      try {
        if (a.previousJson) prev = JSON.parse(a.previousJson);
      } catch {}
      try {
        if (a.nextJson) next = JSON.parse(a.nextJson);
      } catch {}
      return {
        id: a.id,
        actor: a.actor,
        createdAt: a.createdAt.toISOString(),
        previous: prev,
        next
      };
    });

    return NextResponse.json({ audits });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Lỗi khi tải lịch sử kiểm toán" },
      { status: 500 }
    );
  }
}
