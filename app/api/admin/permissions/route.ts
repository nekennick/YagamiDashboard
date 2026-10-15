import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/server";
import {
  MANAGEABLE_TABS,
  getMemberAllowedTabs,
  setMemberAllowedTabs,
  memberTabsCookieName
} from "@/lib/auth/permissions";

export async function GET() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ message: "Yêu cầu quyền Quản trị viên." }, { status: 403 });
  }

  const allowedTabs = await getMemberAllowedTabs();
  return NextResponse.json({
    tabs: MANAGEABLE_TABS,
    allowedTabs
  });
}

export async function PUT(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ message: "Yêu cầu quyền Quản trị viên." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { allowedTabs?: string[] };
    if (!Array.isArray(body.allowedTabs)) {
      return NextResponse.json({ message: "Dữ liệu không hợp lệ." }, { status: 400 });
    }

    const updatedAllowedTabs = await setMemberAllowedTabs(body.allowedTabs);

    const response = NextResponse.json({
      success: true,
      allowedTabs: updatedAllowedTabs,
      message: "Đã cập nhật phân quyền tab thành công."
    });

    response.cookies.set(memberTabsCookieName, encodeURIComponent(JSON.stringify(updatedAllowedTabs)), {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Lỗi lưu cấu hình phân quyền." },
      { status: 500 }
    );
  }
}
