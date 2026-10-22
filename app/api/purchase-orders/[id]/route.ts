import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { createPurchaseOrderOnKiotViet } from "@/lib/kiotviet/purchase";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
    }

    const { id } = await params;
    const orderId = Number(id);
    if (!orderId) {
      return NextResponse.json({ message: "ID phiếu không hợp lệ" }, { status: 400 });
    }

    const order = await prisma.purchaseOrder.findUnique({
      where: { id: orderId },
      include: {
        branch: true,
        supplier: true,
        createdBy: { select: { id: true, displayName: true, username: true } },
        items: {
          include: {
            product: { select: { id: true, code: true, name: true, unit: true, basePrice: true } }
          }
        }
      }
    });

    if (!order) {
      return NextResponse.json({ message: "Không tìm thấy phiếu nhập hàng" }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi lấy chi tiết phiếu nhập";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ message: "Không có quyền thực hiện" }, { status: 403 });
    }

    const { id } = await params;
    const orderId = Number(id);
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: orderId },
      include: {
        branch: true,
        supplier: true,
        items: { include: { product: true } }
      }
    });

    if (!order) {
      return NextResponse.json({ message: "Không tìm thấy phiếu nhập" }, { status: 404 });
    }

    if (order.syncStatus === "SYNCED" && order.kvPurchaseOrderId) {
      return NextResponse.json({ message: "Phiếu này đã được đồng bộ với KiotViet rồi", order });
    }

    if (!order.branch.kvBranchId) {
      return NextResponse.json({ message: "Chi nhánh chưa liên kết KiotViet Branch ID" }, { status: 400 });
    }

    const kvPayload = {
      branchId: order.branch.kvBranchId,
      supplierId: order.supplier?.kvSupplierId ?? undefined,
      purchaseDate: order.purchaseDate.toISOString(),
      description: order.note || `Phiếu nhập hàng Yagami - Người giao: ${order.delivererName || "N/A"}`,
      purchaseOrderDetails: order.items.map((i) => ({
        productId: i.product.kvProductId,
        quantity: Number(i.quantity),
        price: Number(i.price)
      }))
    };

    const kvRes = await createPurchaseOrderOnKiotViet(kvPayload);
    const updated = await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: {
        code: kvRes.code || order.code,
        kvPurchaseOrderId: kvRes.id,
        syncStatus: "SYNCED",
        syncError: null
      },
      include: {
        branch: true,
        supplier: true,
        items: true
      }
    });

    return NextResponse.json({ order: updated, message: "Đồng bộ KiotViet thành công" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Đồng bộ thất bại";
    return NextResponse.json({ message }, { status: 500 });
  }
}
