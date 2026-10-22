import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { syncSuppliersToLocal } from "@/lib/kiotviet/purchase";

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const shouldSync = searchParams.get("sync") === "true";

    if (shouldSync && session.role === "ADMIN") {
      try {
        await syncSuppliersToLocal();
      } catch (err: unknown) {
        console.error("Lỗi sync nhà cung cấp từ KiotViet:", err);
      }
    }

    const suppliers = await prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" }
    });

    return NextResponse.json({ suppliers });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi tải danh sách nhà cung cấp";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ message: "Không có quyền thực hiện" }, { status: 403 });
    }

    const body = await request.json() as { name: string; phone?: string; address?: string };
    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ message: "Tên nhà cung cấp không được để trống" }, { status: 400 });
    }

    const supplier = await prisma.supplier.create({
      data: {
        name: body.name.trim(),
        phone: body.phone?.trim() || null,
        address: body.address?.trim() || null,
        isActive: true
      }
    });

    return NextResponse.json({ supplier });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi tạo nhà cung cấp";
    return NextResponse.json({ message }, { status: 500 });
  }
}
