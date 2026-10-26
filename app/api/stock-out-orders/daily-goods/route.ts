import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { operationalDayEnd, operationalDayStart } from "@/lib/inventory-ledger";

export const dynamic = "force-dynamic";

function isStocktakeMovement(sourceType: string) {
  const normalized = sourceType.toUpperCase();
  return normalized === "STOCKTAKE" || normalized.includes("KIEM_KE");
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchIdStr = searchParams.get("branchId");
    const dateStr = searchParams.get("date") || new Date().toISOString().slice(0, 10);

    if (!branchIdStr) {
      return NextResponse.json({ message: "Vui lòng chọn chi nhánh xuất kho" }, { status: 400 });
    }

    const branchId = parseInt(branchIdStr, 10);
    if (isNaN(branchId)) {
      return NextResponse.json({ message: "Chi nhánh không hợp lệ" }, { status: 400 });
    }

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, name: true, address: true, kvBranchId: true }
    });

    if (!branch) {
      return NextResponse.json({ message: "Không tìm thấy chi nhánh" }, { status: 404 });
    }

    // Xác định khung giờ vận hành cho ngày được chọn (từ 18:00 ngày trước đến thời điểm hiện tại hoặc 18:00 hôm nay)
    const startBoundary = operationalDayStart(dateStr);
    const endBoundary = operationalDayEnd(dateStr);
    const now = new Date();
    // Nếu ngày truy vấn là hôm nay, lấy tới thời điểm hiện tại; nếu ngày quá khứ, lấy tới endBoundary
    const queryEndTime = now < endBoundary ? now : endBoundary;

    // Lấy tất cả các biến động kho có số lượng xuất (quantityDelta < 0)
    const movements = await prisma.inventoryMovement.findMany({
      where: {
        branchId,
        isActive: true,
        occurredAt: { gte: startBoundary, lte: queryEndTime },
        quantityDelta: { lt: 0 }
      },
      select: {
        id: true,
        productId: true,
        sourceType: true,
        quantityDelta: true,
        occurredAt: true,
        product: {
          select: {
            id: true,
            code: true,
            name: true,
            unit: true,
            basePrice: true
          }
        }
      }
    });

    // Lọc bỏ các điều chỉnh do kiểm kê (chỉ giữ lại hàng xuất thực tế: bán, xuất huỷ, xuất nội bộ, chuyển kho)
    const validMovements = movements.filter((m) => !isStocktakeMovement(m.sourceType));

    // Tổng hợp số lượng theo từng mặt hàng
    const productAggregation = new Map<
      number,
      {
        productId: number;
        productCode: string;
        productName: string;
        unit: string;
        quantity: number;
        price: number;
        amount: number;
      }
    >();

    for (const m of validMovements) {
      const p = m.product;
      if (!p) continue;

      const qty = Math.abs(Number(m.quantityDelta));
      const existing = productAggregation.get(p.id);

      if (existing) {
        existing.quantity += qty;
        existing.amount = existing.quantity * existing.price;
      } else {
        const price = Number(p.basePrice) || 0;
        productAggregation.set(p.id, {
          productId: p.id,
          productCode: p.code || "",
          productName: p.name,
          unit: p.unit || "",
          quantity: qty,
          price,
          amount: qty * price
        });
      }
    }

    const items = Array.from(productAggregation.values())
      .filter((item) => item.quantity > 0)
      .sort((a, b) => a.productName.localeCompare(b.productName, "vi"));

    const totalQuantity = items.reduce((acc, item) => acc + item.quantity, 0);
    const totalAmount = items.reduce((acc, item) => acc + item.amount, 0);

    return NextResponse.json({
      branch: {
        id: branch.id,
        name: branch.name,
        address: branch.address || "Xã Ba Sao, Tỉnh Đồng Tháp"
      },
      reportDate: dateStr,
      generatedAt: now.toISOString(),
      items,
      totalQuantity,
      totalAmount
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi khi lấy dữ liệu báo cáo cuối ngày";
    return NextResponse.json({ message }, { status: 500 });
  }
}
