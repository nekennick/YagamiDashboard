import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { createPurchaseOrderOnKiotViet } from "@/lib/kiotviet/purchase";
import { canUserPurchase } from "@/lib/auth/purchase-permissions";
import { recordSyncedGoogleSheetRows } from "@/lib/google-sheets/purchase-sync";

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
    }

    const hasPermission = await canUserPurchase(session.sub, session.role);
    if (!hasPermission) {
      return NextResponse.json({ message: "Bạn chưa được cấp quyền Nhập kho" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId") ? Number(searchParams.get("branchId")) : undefined;
    const search = searchParams.get("search")?.trim();
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize = Math.max(1, Math.min(100, Number(searchParams.get("pageSize") || 20)));

    const where: Prisma.PurchaseOrderWhereInput = {};
    if (branchId) where.branchId = branchId;
    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { supplierName: { contains: search, mode: "insensitive" } },
        { delivererName: { contains: search, mode: "insensitive" } },
        { note: { contains: search, mode: "insensitive" } }
      ];
    }
    if (from || to) {
      where.purchaseDate = {};
      if (from) where.purchaseDate.gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        where.purchaseDate.lte = toDate;
      }
    }

    const [total, orders] = await Promise.all([
      prisma.purchaseOrder.count({ where }),
      prisma.purchaseOrder.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true, address: true, kvBranchId: true } },
          supplier: { select: { id: true, name: true, phone: true } },
          createdBy: { select: { id: true, displayName: true, username: true } },
          items: true
        },
        orderBy: { purchaseDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);

    return NextResponse.json({
      orders,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi lấy danh sách phiếu nhập";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
    }

    const hasPermission = await canUserPurchase(session.sub, session.role);
    if (!hasPermission) {
      return NextResponse.json({ message: "Bạn chưa được cấp quyền tạo phiếu nhập hàng" }, { status: 403 });
    }

    const body = (await request.json()) as {
      branchId: number;
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
      sheetSyncItems?: Array<{
        sheetRowId: string;
        rawMaPhieu?: string;
        productCode?: string;
        productName?: string;
        quantity?: number;
        receivedDate?: string;
        receivedTime?: string;
        staffName?: string;
      }>;
    };

    if (!body.branchId) {
      return NextResponse.json({ message: "Vui lòng chọn chi nhánh/kho nhập hàng" }, { status: 400 });
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ message: "Phiếu nhập phải có ít nhất 1 mặt hàng" }, { status: 400 });
    }

    // Lấy thông tin Branch
    const branch = await prisma.branch.findUnique({
      where: { id: body.branchId }
    });
    if (!branch) {
      return NextResponse.json({ message: "Chi nhánh không tồn tại" }, { status: 404 });
    }

    // Lấy thông tin Supplier nếu có
    let supplier = null;
    let supplierName = body.supplierName?.trim() || "";
    if (body.supplierId) {
      supplier = await prisma.supplier.findUnique({ where: { id: body.supplierId } });
      if (supplier) {
        supplierName = supplier.name;
      }
    }

    // Lấy thông tin các sản phẩm
    const productIds = body.items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } }
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Chuẩn hóa danh sách mặt hàng
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

      // Đơn giá bán lẻ tự động lấy từ basePrice
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
      return NextResponse.json({ message: "Số lượng các mặt hàng nhập phải lớn hơn 0" }, { status: 400 });
    }

    const purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : new Date();
    const isDraft = body.isDraft === true;

    // Sinh mã phiếu dự phòng (PT: Phiếu tạm, PN: Phiếu nhập)
    const datePrefix = purchaseDate.toISOString().slice(2, 10).replace(/-/g, "");
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    let orderCode = `${isDraft ? "PT" : "PN"}${datePrefix}-${randomSuffix}`;
    let kvPurchaseOrderId: number | null = null;
    let status = isDraft ? "DRAFT" : "COMPLETED";
    let syncStatus = "LOCAL_ONLY";
    let syncError: string | null = null;

    // Chỉ đồng bộ lên KiotViet nếu KHÔNG PHẢI là phiếu tạm
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
          description: body.note || `Phiếu nhập hàng Yagami - ${delivererText(body.delivererName)}`,
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
        console.warn("Không thể đồng bộ KiotViet ngay lúc tạo:", syncError);
      }
    }

    // Lưu phiếu vào Database Local (vẫn lưu lại dưới dạng draft để không mất dữ liệu người dùng nhập)
    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        code: orderCode,
        kvPurchaseOrderId,
        branchId: branch.id,
        supplierId: supplier?.id || null,
        supplierName: supplierName || null,
        delivererName: body.delivererName?.trim() || null,
        purchaseDate,
        totalAmount,
        totalQuantity,
        note: body.note?.trim() || null,
        status,
        syncStatus,
        syncError,
        createdById: session.sub,
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
        createdBy: { select: { displayName: true } },
        items: true
      }
    });

    if (Array.isArray(body.sheetSyncItems) && body.sheetSyncItems.length > 0) {
      await recordSyncedGoogleSheetRows(purchaseOrder.id, body.sheetSyncItems);
    }

    if (!isDraft && syncStatus !== "SYNCED") {
      return NextResponse.json(
        {
          order: purchaseOrder,
          message: `KiotViet từ chối: ${syncError}`
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      order: purchaseOrder,
      message:
        syncStatus === "SYNCED"
          ? `Đã tạo và đồng bộ KiotViet thành công (Mã phiếu: ${purchaseOrder.code})`
          : `Đã lưu phiếu tạm (Mã phiếu: ${purchaseOrder.code})`
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi tạo phiếu nhập hàng";
    return NextResponse.json({ message }, { status: 500 });
  }
}

function delivererText(name?: string) {
  return name ? `Người giao: ${name}` : "";
}
