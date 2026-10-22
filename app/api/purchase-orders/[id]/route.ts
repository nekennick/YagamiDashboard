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
  let orderId = 0;
  try {
    const session = await getCurrentSession();
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ message: "Không có quyền thực hiện" }, { status: 403 });
    }

    const { id } = await params;
    orderId = Number(id);
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

    return NextResponse.json({
      order: updated,
      message: `Đồng bộ KiotViet thành công (Mã phiếu: ${updated.code})`
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Đồng bộ thất bại";
    if (orderId) {
      await prisma.purchaseOrder
        .update({
          where: { id: orderId },
          data: { syncStatus: "FAILED", syncError: message }
        })
        .catch(() => {});
    }
    return NextResponse.json({ message: `KiotViet từ chối: ${message}` }, { status: 400 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ message: "Không có quyền thực hiện" }, { status: 403 });
    }

    const { id } = await params;
    const orderId = Number(id);
    const existing = await prisma.purchaseOrder.findUnique({
      where: { id: orderId },
      include: { branch: true }
    });

    if (!existing) {
      return NextResponse.json({ message: "Không tìm thấy phiếu" }, { status: 404 });
    }

    if (existing.syncStatus === "SYNCED") {
      return NextResponse.json(
        { message: "Phiếu đã đồng bộ lên KiotViet nên không thể chỉnh sửa" },
        { status: 400 }
      );
    }

    const body = (await request.json()) as {
      branchId?: number;
      supplierId?: number;
      supplierName?: string;
      delivererName?: string;
      purchaseDate?: string;
      note?: string;
      isDraft?: boolean;
      items: Array<{
        productId: number;
        quantity: number;
        price?: number;
        note?: string;
      }>;
    };

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ message: "Phiếu phải có ít nhất 1 mặt hàng" }, { status: 400 });
    }

    const branchId = body.branchId ?? existing.branchId;
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      return NextResponse.json({ message: "Chi nhánh không tồn tại" }, { status: 404 });
    }

    let supplierName = body.supplierName?.trim() || "";
    let supplier = null;
    if (body.supplierId) {
      supplier = await prisma.supplier.findUnique({ where: { id: body.supplierId } });
      if (supplier) supplierName = supplier.name;
    }

    const productIds = body.items.map((i) => i.productId);
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
    const productMap = new Map(products.map((p) => [p.id, p]));

    let totalQuantity = 0;
    let totalAmount = 0;
    const validatedItems: Array<{
      productId: number;
      productCode: string;
      productName: string;
      unit: string;
      quantity: number;
      price: number;
      amount: number;
      note?: string;
      kvProductId: number;
    }> = [];

    for (const item of body.items) {
      const p = productMap.get(item.productId);
      if (!p) continue;
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) continue;
      const price = item.price !== undefined ? Number(item.price) : Number(p.basePrice || 0);
      const amount = qty * price;
      totalQuantity += qty;
      totalAmount += amount;
      validatedItems.push({
        productId: p.id,
        productCode: p.code || "",
        productName: p.name,
        unit: p.unit || "",
        quantity: qty,
        price,
        amount,
        note: item.note,
        kvProductId: p.kvProductId
      });
    }

    if (validatedItems.length === 0) {
      return NextResponse.json({ message: "Số lượng các mặt hàng phải lớn hơn 0" }, { status: 400 });
    }

    const purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : existing.purchaseDate;
    const isDraft = body.isDraft === true;
    let orderCode = existing.code;
    let kvPurchaseOrderId = existing.kvPurchaseOrderId;
    let status = isDraft ? "DRAFT" : "COMPLETED";
    let syncStatus = isDraft ? "LOCAL_ONLY" : "LOCAL_ONLY";
    let syncError: string | null = null;

    if (!isDraft) {
      for (const item of validatedItems) {
        const prod = productMap.get(item.productId);
        if (prod?.rawJson) {
          try {
            const raw = JSON.parse(prod.rawJson);
            if (raw.type === 1 || raw.type === 3) {
              const typeLabel = raw.type === 1 ? "đóng gói / combo" : "dịch vụ";
              return NextResponse.json(
                { message: `Không thể nhập hàng đối với sản phẩm ${typeLabel}: ${prod.name} (${prod.code || prod.id})` },
                { status: 400 }
              );
            }
          } catch {}
        }
      }

      if (!branch.kvBranchId) {
        return NextResponse.json(
          { message: "Chi nhánh chưa liên kết KiotViet Branch ID" },
          { status: 400 }
        );
      }

      try {
        const kvPayload = {
          branchId: branch.kvBranchId,
          supplierId: supplier?.kvSupplierId ?? undefined,
          purchaseDate: purchaseDate.toISOString(),
          description: body.note || `Phiếu nhập hàng Yagami - Người giao: ${body.delivererName || "N/A"}`,
          purchaseOrderDetails: validatedItems.map((item) => ({
            productId: item.kvProductId,
            quantity: item.quantity,
            price: item.price
          }))
        };

        const kvRes = await createPurchaseOrderOnKiotViet(kvPayload);
        if (kvRes && kvRes.code) {
          orderCode = kvRes.code;
          kvPurchaseOrderId = kvRes.id;
          status = "COMPLETED";
          syncStatus = "SYNCED";
        }
      } catch (err: unknown) {
        status = "DRAFT";
        syncStatus = "FAILED";
        syncError = err instanceof Error ? err.message : "Lỗi đồng bộ KiotViet";
        console.warn("Không thể đồng bộ KiotViet khi sửa phiếu:", syncError);
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.purchaseOrderItem.deleteMany({
        where: { purchaseOrderId: existing.id }
      });

      return await tx.purchaseOrder.update({
        where: { id: existing.id },
        data: {
          code: orderCode,
          kvPurchaseOrderId,
          branchId: branch.id,
          supplierId: supplier?.id ?? null,
          supplierName: supplierName || null,
          delivererName: body.delivererName !== undefined ? body.delivererName.trim() : existing.delivererName,
          purchaseDate,
          totalAmount,
          totalQuantity,
          note: body.note !== undefined ? body.note.trim() : existing.note,
          status,
          syncStatus,
          syncError,
          items: {
            create: validatedItems.map((item) => ({
              productId: item.productId,
              productCode: item.productCode,
              productName: item.productName,
              unit: item.unit,
              quantity: item.quantity,
              price: item.price,
              amount: item.amount,
              note: item.note
            }))
          }
        },
        include: {
          branch: true,
          supplier: true,
          items: true
        }
      });
    });

    if (!isDraft && syncStatus !== "SYNCED") {
      return NextResponse.json(
        {
          order: updated,
          message: `KiotViet từ chối: ${syncError}`
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      order: updated,
      message:
        syncStatus === "SYNCED"
          ? `Đã cập nhật và đẩy lên KiotViet thành công (Mã phiếu: ${updated.code})`
          : `Đã lưu cập nhật phiếu tạm (Mã phiếu: ${updated.code})`
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi cập nhật phiếu";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(
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
    if (!orderId) {
      return NextResponse.json({ message: "ID không hợp lệ" }, { status: 400 });
    }

    const existing = await prisma.purchaseOrder.findUnique({
      where: { id: orderId }
    });

    if (!existing) {
      return NextResponse.json({ message: "Không tìm thấy phiếu" }, { status: 404 });
    }

    if (existing.syncStatus === "SYNCED") {
      return NextResponse.json(
        { message: "Phiếu đã đồng bộ lên KiotViet nên không thể xóa" },
        { status: 400 }
      );
    }

    await prisma.$transaction([
      prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: orderId } }),
      prisma.purchaseOrder.delete({ where: { id: orderId } })
    ]);

    return NextResponse.json({ message: "Đã xóa phiếu tạm thành công" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi xóa phiếu tạm";
    return NextResponse.json({ message }, { status: 500 });
  }
}
