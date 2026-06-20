import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Tìm ngày snapshot tồn kho gần đây nhất
    const latestInventoryDate = await prisma.inventorySnapshot.aggregate({
      _max: { snapshotDate: true },
    });

    if (!latestInventoryDate._max.snapshotDate) {
      return NextResponse.json([]);
    }

    // Truy vấn tất cả sản phẩm tồn kho thuộc ngày snapshot đó, sắp xếp theo tồn kho tăng dần
    const lowStockItems = await prisma.inventorySnapshot.findMany({
      where: {
        snapshotDate: latestInventoryDate._max.snapshotDate,
      },
      include: {
        product: {
          select: {
            code: true,
            name: true,
          },
        },
        branch: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        onHand: "asc",
      },
    });

    return NextResponse.json(lowStockItems);
  } catch (error) {
    console.error("Lỗi khi lấy danh sách sản phẩm tồn kho thấp:", error);
    return NextResponse.json(
      { error: "Lỗi máy chủ nội bộ" },
      { status: 500 }
    );
  }
}
