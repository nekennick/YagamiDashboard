import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";

export const DEFAULT_PRINT_SETTINGS = {
  companyName: "CÔNG TY TNHH YAGAMI KITCHEN",
  warehouseName: "TỔNG KHO YAGAMI",
  formNumber: "Mẫu số: 01 - VT",
  circular: "(Kèm theo Thông tư số 99/2025/TT-BTC ngày 27 tháng 10 năm 2025 của Bộ trưởng Bộ Tài chính)",
  defaultAddress: "Phường 2, Thành phố Cao Lãnh, Đồng Tháp",
  footerNote: "“Đơn giá và thành tiền trên phiếu chỉ phục vụ quản lý nội bộ theo giá bán; không phải giá nhập, giá vốn hoặc căn cứ ghi sổ kế toán.”",
  showLogo: true,
  showSignatures: true
};

const SETTING_KEY = "PRINT_TEMPLATE_PURCHASE_ORDER";

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
    }

    const setting = await prisma.appSetting.findUnique({
      where: { key: SETTING_KEY }
    });

    if (!setting) {
      return NextResponse.json({ settings: DEFAULT_PRINT_SETTINGS });
    }

    const parsed = JSON.parse(setting.value);
    return NextResponse.json({
      settings: { ...DEFAULT_PRINT_SETTINGS, ...parsed }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi đọc cấu hình in";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ message: "Không có quyền thực hiện" }, { status: 403 });
    }

    const body = await request.json();
    const updated = {
      ...DEFAULT_PRINT_SETTINGS,
      ...body
    };

    await prisma.appSetting.upsert({
      where: { key: SETTING_KEY },
      create: {
        key: SETTING_KEY,
        value: JSON.stringify(updated)
      },
      update: {
        value: JSON.stringify(updated)
      }
    });

    return NextResponse.json({ settings: updated, message: "Đã lưu cài đặt mẫu in" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi lưu cấu hình in";
    return NextResponse.json({ message }, { status: 500 });
  }
}
