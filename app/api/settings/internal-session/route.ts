import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/server";
import {
  getInternalSessionStatus,
  updateInternalSessionSecret,
  testInternalSessionConnection
} from "@/lib/kiotviet/internal-session";

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ message: "Bạn cần đăng nhập." }, { status: 401 });
    }

    const status = await getInternalSessionStatus();
    return NextResponse.json({
      ...status,
      canManage: session.role === "ADMIN"
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Không thể lấy trạng thái phiên KiotViet."
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json(
        { message: "Chỉ Quản trị viên mới có quyền cập nhật cấu hình hệ thống." },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: "test" | "update";
      curl?: string;
    };

    if (body.action === "test") {
      const result = await testInternalSessionConnection();
      return NextResponse.json(result);
    }

    if (!body.curl || !body.curl.trim()) {
      return NextResponse.json(
        { message: "Vui lòng dán lệnh cURL hoặc nội dung cấu hình phiên KiotViet." },
        { status: 400 }
      );
    }

    const newStatus = await updateInternalSessionSecret(body.curl);
    return NextResponse.json({
      ok: true,
      message: "Cập nhật và kích hoạt phiên quản trị KiotViet thành công!",
      status: newStatus
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Không thể cập nhật phiên KiotViet."
      },
      { status: 400 }
    );
  }
}
