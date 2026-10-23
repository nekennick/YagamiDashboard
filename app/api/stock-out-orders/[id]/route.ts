import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
    }

    const { id } = await params;
    const orderId = parseInt(id, 10);
    if (isNaN(orderId)) {
      return NextResponse.json({ message: "ID không hợp lệ" }, { status: 400 });
    }

    const order = await prisma.stockOutOrder.findUnique({
      where: { id: orderId },
      include: {
        branch: true,
        createdBy: { select: { id: true, displayName: true } },
        items: {
          orderBy: { id: "asc" }
        }
      }
    });

    if (!order) {
      return NextResponse.json({ message: "Không tìm thấy phiếu xuất kho" }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Không thể tải phiếu xuất kho";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
    }

    const { id } = await params;
    const orderId = parseInt(id, 10);
    if (isNaN(orderId)) {
      return NextResponse.json({ message: "ID không hợp lệ" }, { status: 400 });
    }

    const order = await prisma.stockOutOrder.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      return NextResponse.json({ message: "Không tìm thấy phiếu xuất kho" }, { status: 404 });
    }

    await prisma.stockOutOrder.delete({
      where: { id: orderId }
    });

    return NextResponse.json({ message: `Đã xóa phiếu xuất kho ${order.code}` });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Xóa phiếu xuất kho thất bại";
    return NextResponse.json({ message }, { status: 500 });
  }
}
