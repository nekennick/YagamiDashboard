import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/server";
import { canUserPurchase } from "@/lib/auth/purchase-permissions";
import {
  fetchAndPreviewGoogleSheet,
  saveGoogleSheetUrl
} from "@/lib/google-sheets/purchase-sync";

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
    const customUrl = searchParams.get("url") || undefined;

    const result = await fetchAndPreviewGoogleSheet(customUrl);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Lỗi khi đọc Google Sheet phiếu nhập:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Không thể kết nối hoặc đọc Google Sheet."
      },
      { status: 400 }
    );
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
      return NextResponse.json({ message: "Bạn chưa được cấp quyền Nhập kho" }, { status: 403 });
    }

    const body = (await request.json()) as { url?: string };
    if (!body.url || !body.url.trim()) {
      return NextResponse.json({ message: "Vui lòng nhập đường dẫn Google Sheet" }, { status: 400 });
    }

    await saveGoogleSheetUrl(body.url);
    const result = await fetchAndPreviewGoogleSheet(body.url);

    return NextResponse.json({
      ...result,
      message: "Đã lưu đường dẫn Google Sheet thành công"
    });
  } catch (error) {
    console.error("Lỗi khi lưu cấu hình Google Sheet:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Đường dẫn Google Sheet không hợp lệ."
      },
      { status: 400 }
    );
  }
}
