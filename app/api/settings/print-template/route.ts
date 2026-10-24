import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PRINT_SETTINGS as DEFAULT_PURCHASE_SETTINGS } from "@/components/purchase/purchase-order-print";
import { DEFAULT_STOCK_OUT_PRINT_SETTINGS } from "@/components/stock-out/stock-out-order-print";

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const isStockOut = type === "stock_out" || type === "stock-out";

    const settingKey = isStockOut ? "PRINT_TEMPLATE_STOCK_OUT" : "PRINT_TEMPLATE_PURCHASE_ORDER";
    const defaultSettings = isStockOut ? DEFAULT_STOCK_OUT_PRINT_SETTINGS : DEFAULT_PURCHASE_SETTINGS;

    const setting = await prisma.appSetting.findUnique({
      where: { key: settingKey }
    });

    if (!setting) {
      return NextResponse.json({ settings: defaultSettings });
    }

    const parsed = JSON.parse(setting.value);
    return NextResponse.json({
      settings: { ...defaultSettings, ...parsed }
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
    const isStockOut = body.type === "stock_out" || body.type === "stock-out";

    const settingKey = isStockOut ? "PRINT_TEMPLATE_STOCK_OUT" : "PRINT_TEMPLATE_PURCHASE_ORDER";
    const defaultSettings = isStockOut ? DEFAULT_STOCK_OUT_PRINT_SETTINGS : DEFAULT_PURCHASE_SETTINGS;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { type, ...configData } = body;
    const updated = {
      ...defaultSettings,
      ...configData
    };

    await prisma.appSetting.upsert({
      where: { key: settingKey },
      create: {
        key: settingKey,
        value: JSON.stringify(updated)
      },
      update: {
        value: JSON.stringify(updated)
      }
    });

    return NextResponse.json({ settings: updated, message: "Đã lưu cài đặt mẫu in thành công" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi lưu cấu hình in";
    return NextResponse.json({ message }, { status: 500 });
  }
}
