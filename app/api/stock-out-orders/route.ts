import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId") ? Number(searchParams.get("branchId")) : undefined;
    const search = searchParams.get("search")?.trim();
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize = Math.max(1, Math.min(100, Number(searchParams.get("pageSize") || 20)));

    const where: Prisma.StockOutOrderWhereInput = {};
    if (branchId) where.branchId = branchId;
    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { receiverName: { contains: search, mode: "insensitive" } },
        { documentBasis: { contains: search, mode: "insensitive" } },
        { note: { contains: search, mode: "insensitive" } }
      ];
    }
    if (from || to) {
      where.issueDate = {};
      if (from) where.issueDate.gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        where.issueDate.lte = toDate;
      }
    }

    const [total, orders] = await Promise.all([
      prisma.stockOutOrder.count({ where }),
      prisma.stockOutOrder.findMany({
        where,
        orderBy: { issueDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          branch: { select: { id: true, name: true, address: true } },
          createdBy: { select: { id: true, displayName: true } },
          items: true
        }
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
    const message = error instanceof Error ? error.message : "Không thể lấy danh sách phiếu xuất kho";
    return NextResponse.json({ message }, { status: 500 });
  }
}

type StockOutOrderBody = {
  branchId: number;
  receiverName?: string;
  documentBasis?: string;
  issueDate?: string;
  reportDate?: string;
  note?: string;
  items: Array<{
    productId: number;
    quantity: number;
    price?: number;
    note?: string;
  }>;
};

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
    }

    const body = (await request.json()) as StockOutOrderBody;

    if (!body.branchId) {
      return NextResponse.json({ message: "Vui lòng chọn chi nhánh xuất kho" }, { status: 400 });
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ message: "Phiếu xuất kho phải có ít nhất 1 mặt hàng" }, { status: 400 });
    }

    const branch = await prisma.branch.findUnique({
      where: { id: body.branchId }
    });

    if (!branch) {
      return NextResponse.json({ message: "Chi nhánh không tồn tại" }, { status: 400 });
    }

    const productIds = body.items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } }
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    let totalAmount = 0;
    let totalQuantity = 0;
    const validatedItems = [];

    for (const item of body.items) {
      const p = productMap.get(item.productId);
      if (!p) {
        return NextResponse.json({ message: `Không tìm thấy thông tin sản phẩm #${item.productId}` }, { status: 400 });
      }

      const qty = Number(item.quantity) || 0;
      if (qty <= 0) continue;

      const price = item.price !== undefined ? Number(item.price) : Number(p.basePrice) || 0;
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
        note: item.note?.trim() || null
      });
    }

    if (validatedItems.length === 0) {
      return NextResponse.json({ message: "Số lượng các mặt hàng xuất phải lớn hơn 0" }, { status: 400 });
    }

    // Thời gian của phiếu xuất kho là thời điểm lấy dữ liệu / bấm tạo
    const issueDate = body.issueDate ? new Date(body.issueDate) : new Date();

    // Quy tắc sinh mã phiếu xuất kho:
    // Định dạng: PX + Năm + Tháng + Ngày (VD: PX20261023)
    // - Mỗi ngày chỉ có 1 phiếu xuất chính: PX<YYYYMMDD>
    // - Nếu trong ngày xuất thêm phiếu sau đó: PX<YYYYMMDD>.01, PX<YYYYMMDD>.02...
    let targetDateStr = "";
    if (body.reportDate && /^\d{4}-\d{2}-\d{2}$/.test(body.reportDate)) {
      targetDateStr = body.reportDate.replace(/-/g, "");
    } else {
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      });
      targetDateStr = formatter.format(issueDate).replace(/-/g, "");
    }

    const baseCode = `PX${targetDateStr}`;

    // Tìm các phiếu xuất kho đã có trong ngày có mã bắt đầu bằng baseCode
    const existingOrders = await prisma.stockOutOrder.findMany({
      where: {
        code: {
          startsWith: baseCode
        }
      },
      select: {
        code: true
      }
    });

    const existingCodes = new Set(existingOrders.map((o) => o.code));
    let orderCode = baseCode;

    if (existingCodes.has(baseCode)) {
      let maxSuffix = 0;
      for (const code of existingCodes) {
        if (code === baseCode) continue;
        const suffixStr = code.slice(baseCode.length);
        if (suffixStr.startsWith(".")) {
          const num = parseInt(suffixStr.slice(1), 10);
          if (!isNaN(num) && num > maxSuffix) {
            maxSuffix = num;
          }
        }
      }

      let nextNum = maxSuffix + 1;
      let candidate = `${baseCode}.${String(nextNum).padStart(2, "0")}`;
      while (existingCodes.has(candidate)) {
        nextNum++;
        candidate = `${baseCode}.${String(nextNum).padStart(2, "0")}`;
      }
      orderCode = candidate;
    }

    const order = await prisma.stockOutOrder.create({
      data: {
        code: orderCode,
        branchId: branch.id,
        receiverName: body.receiverName?.trim() || null,
        documentBasis: body.documentBasis?.trim() || null,
        issueDate,
        reportDate: body.reportDate || null,
        totalAmount,
        totalQuantity,
        note: body.note?.trim() || null,
        status: "COMPLETED",
        createdById: session.sub,
        items: {
          create: validatedItems
        }
      },
      include: {
        branch: true,
        createdBy: { select: { id: true, displayName: true } },
        items: true
      }
    });

    return NextResponse.json({
      order,
      message: `Tạo phiếu xuất kho thành công (Mã: ${order.code})`
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Tạo phiếu xuất kho thất bại";
    return NextResponse.json({ message }, { status: 500 });
  }
}
