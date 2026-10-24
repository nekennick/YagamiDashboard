import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId");
    const date = searchParams.get("date");

    if (!branchId || !date) {
      return NextResponse.json({ error: "Thiếu branchId hoặc date" }, { status: 400 });
    }

    const prefix = `ack:discrepancy:${branchId}:`;
    const suffix = `:${date}`;

    const settings = await prisma.appSetting.findMany({
      where: {
        key: {
          startsWith: prefix
        }
      }
    });

    const matching = settings.filter((s) => s.key.endsWith(suffix));
    const acks: Record<number, { acknowledged: boolean; acknowledgedAt: string; note?: string }> = {};

    for (const item of matching) {
      const parts = item.key.split(":");
      // key format: ack:discrepancy:branchId:productId:date
      const prodId = Number(parts[3]);
      if (prodId) {
        try {
          const parsed = JSON.parse(item.value);
          if (parsed.acknowledged) {
            acks[prodId] = parsed;
          }
        } catch {
          // ignore parsing error
        }
      }
    }

    return NextResponse.json({ success: true, acknowledgments: acks });
  } catch (error) {
    console.error("Lỗi khi đọc danh sách xác nhận:", error);
    return NextResponse.json({ error: "Lỗi hệ thống" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { branchId, productId, date, acknowledged, note } = body;

    if (!branchId || !productId || !date) {
      return NextResponse.json({ error: "Thiếu branchId, productId, hoặc date" }, { status: 400 });
    }

    const key = `ack:discrepancy:${branchId}:${productId}:${date}`;

    if (acknowledged) {
      const payload = {
        acknowledged: true,
        acknowledgedAt: new Date().toISOString(),
        note: note || undefined
      };
      await prisma.appSetting.upsert({
        where: { key },
        create: { key, value: JSON.stringify(payload) },
        update: { value: JSON.stringify(payload) }
      });
      return NextResponse.json({ success: true, acknowledged: true });
    } else {
      await prisma.appSetting.deleteMany({
        where: { key }
      });
      return NextResponse.json({ success: true, acknowledged: false });
    }
  } catch (error) {
    console.error("Lỗi khi lưu xác nhận lệch kho:", error);
    return NextResponse.json({ error: "Lỗi hệ thống khi lưu xác nhận" }, { status: 500 });
  }
}
