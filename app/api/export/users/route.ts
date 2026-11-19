import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { createWorkbookBuffer, excelResponse } from "@/lib/excel";

function formatVietnamDateTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(d);
}

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json(
        { message: "Chỉ Quản trị viên mới có quyền xuất danh sách người dùng." },
        { status: 403 }
      );
    }

    const users = await prisma.user.findMany({
      orderBy: [{ role: "asc" }, { username: "asc" }],
      include: {
        countPermissions: { select: { permission: true } }
      }
    });

    const permissionLabels: Record<string, string> = {
      COUNT_EXECUTE: "Nhập kiểm",
      COUNT_MANAGE: "Quản lý kiểm",
      COUNT_BALANCE: "Cân bằng kho"
    };

    const rows = users.map((user, index) => {
      const permissions = user.countPermissions.map(
        (p) => permissionLabels[p.permission] || p.permission
      );

      const countPermText =
        user.role === "ADMIN"
          ? "Toàn quyền"
          : permissions.length > 0
          ? permissions.join(", ")
          : "Không có";

      const purchasePermText =
        user.role === "ADMIN"
          ? "Toàn quyền"
          : user.canPurchaseOrder
          ? "Cho phép nhập hàng"
          : "Không";

      return {
        stt: index + 1,
        displayName: user.displayName,
        username: user.username,
        role: user.role === "ADMIN" ? "Quản trị viên (ADMIN)" : "User thường (MEMBER)",
        status: user.isActive ? "Đang hoạt động" : "Đã khóa",
        countPermissions: countPermText,
        canPurchaseOrder: purchasePermText,
        createdAt: formatVietnamDateTime(user.createdAt),
        updatedAt: formatVietnamDateTime(user.updatedAt)
      };
    });

    const buffer = await createWorkbookBuffer({
      sheetName: "Nhan vien",
      columns: [
        { header: "STT", key: "stt", width: 8 },
        { header: "Tên nhân viên", key: "displayName", width: 28 },
        { header: "Tên đăng nhập", key: "username", width: 20 },
        { header: "Vai trò", key: "role", width: 24 },
        { header: "Trạng thái", key: "status", width: 18 },
        { header: "Quyền Kiểm kho", key: "countPermissions", width: 34 },
        { header: "Quyền Nhập kho", key: "canPurchaseOrder", width: 24 },
        { header: "Ngày tạo", key: "createdAt", width: 22 },
        { header: "Cập nhật lần cuối", key: "updatedAt", width: 22 }
      ],
      rows
    });

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    return excelResponse(buffer, `danh-sach-nhan-vien-${dateStr}.xlsx`);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Không thể xuất danh sách nhân viên." },
      { status: 500 }
    );
  }
}
