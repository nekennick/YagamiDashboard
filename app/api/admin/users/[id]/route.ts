import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { getCurrentSession } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getCurrentSession();
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ message: "Chỉ Quản trị viên mới có quyền cập nhật tài khoản." }, { status: 403 });
    }

    const { id } = await params;
    const userId = Number(id);
    if (!Number.isInteger(userId)) return NextResponse.json({ message: "User không hợp lệ." }, { status: 400 });

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, role: true }
    });

    if (!existingUser) {
      return NextResponse.json({ message: "Không tìm thấy người dùng." }, { status: 404 });
    }

    const body = (await request.json()) as {
      username?: string;
      displayName?: string;
      password?: string;
      role?: "ADMIN" | "MEMBER";
      isActive?: boolean;
      canPurchaseOrder?: boolean;
      countPermissions?: Array<"COUNT_EXECUTE" | "COUNT_MANAGE" | "COUNT_BALANCE">;
    };

    const data: {
      username?: string;
      displayName?: string;
      passwordHash?: string;
      role?: "ADMIN" | "MEMBER";
      isActive?: boolean;
      canPurchaseOrder?: boolean;
    } = {};

    // Sửa tên hiển thị (displayName)
    if (body.displayName !== undefined) {
      const displayName = body.displayName.trim();
      if (!displayName) return NextResponse.json({ message: "Tên hiển thị không được để trống." }, { status: 400 });
      data.displayName = displayName;
    }

    // Sửa tên đăng nhập (username)
    if (body.username !== undefined) {
      const username = body.username.trim().toLowerCase();
      if (!username || !/^[a-z0-9._-]{3,40}$/.test(username)) {
        return NextResponse.json(
          { message: "Tên đăng nhập gồm 3–40 ký tự: chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang." },
          { status: 400 }
        );
      }

      if (existingUser.username === "admin" && username !== "admin") {
        return NextResponse.json({ message: "Không thể thay đổi tên đăng nhập của tài khoản admin gốc." }, { status: 400 });
      }

      if (username !== existingUser.username) {
        const duplicate = await prisma.user.findFirst({
          where: {
            username,
            id: { not: userId }
          }
        });
        if (duplicate) {
          return NextResponse.json({ message: `Tên đăng nhập "${username}" đã được sử dụng.` }, { status: 400 });
        }
        data.username = username;
      }
    }

    // Đổi vai trò (role)
    if (body.role !== undefined) {
      if (existingUser.username === "admin" && body.role !== "ADMIN") {
        return NextResponse.json({ message: "Không thể hạ quyền tài khoản admin gốc." }, { status: 400 });
      }
      data.role = body.role === "ADMIN" ? "ADMIN" : "MEMBER";
    }

    // Khóa / Mở khóa
    if (body.isActive !== undefined) {
      if (existingUser.username === "admin" && !body.isActive) {
        return NextResponse.json({ message: "Không thể khóa tài khoản admin gốc." }, { status: 400 });
      }
      data.isActive = body.isActive;
    }

    // Đổi mật khẩu
    if (body.password !== undefined && body.password.trim() !== "") {
      if (body.password.length < 6) return NextResponse.json({ message: "Mật khẩu cần ít nhất 6 ký tự." }, { status: 400 });
      data.passwordHash = await hashPassword(body.password);
    }

    // Quyền nhập kho
    if (body.canPurchaseOrder !== undefined) {
      data.canPurchaseOrder = Boolean(body.canPurchaseOrder);
    }

    const permissions =
      body.countPermissions === undefined
        ? undefined
        : [...new Set(body.countPermissions.filter((value) => ["COUNT_EXECUTE", "COUNT_MANAGE", "COUNT_BALANCE"].includes(value)))];

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...data,
        ...(permissions ? { countPermissions: { deleteMany: {}, create: permissions.map((permission) => ({ permission })) } } : {})
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
        canPurchaseOrder: true,
        createdAt: true,
        updatedAt: true,
        countPermissions: { select: { permission: true } }
      }
    });

    return NextResponse.json({
      user: {
        ...user,
        countPermissions: user.countPermissions.map((item) => item.permission)
      }
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Không thể cập nhật user." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getCurrentSession();
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ message: "Chỉ Quản trị viên mới có quyền xóa tài khoản." }, { status: 403 });
    }

    const { id } = await params;
    const userId = Number(id);
    if (!Number.isInteger(userId)) return NextResponse.json({ message: "User không hợp lệ." }, { status: 400 });

    if (session.sub === userId) {
      return NextResponse.json({ message: "Bạn không thể tự xóa tài khoản của chính mình." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, displayName: true }
    });

    if (!user) {
      return NextResponse.json({ message: "Không tìm thấy người dùng cần xóa." }, { status: 404 });
    }

    if (user.username === "admin") {
      return NextResponse.json({ message: "Không thể xóa tài khoản admin gốc của hệ thống." }, { status: 400 });
    }

    // Kiểm tra ràng buộc dữ liệu Restrict (InventoryCountAssignment, InventoryCountSession, InventoryBalanceBatch)
    const [countAssignmentsCount, countSessionsCount, countBatchesCount] = await Promise.all([
      prisma.inventoryCountAssignment.count({
        where: { OR: [{ assigneeId: userId }, { assignedById: userId }] }
      }),
      prisma.inventoryCountSession.count({
        where: { OR: [{ assigneeId: userId }, { createdById: userId }] }
      }),
      prisma.inventoryBalanceBatch.count({
        where: { createdById: userId }
      })
    ]);

    if (countAssignmentsCount > 0 || countSessionsCount > 0 || countBatchesCount > 0) {
      return NextResponse.json(
        {
          message: `Không thể xóa vĩnh viễn tài khoản "${user.displayName}" (${user.username}) vì đã có dữ liệu lịch sử liên kết (${countSessionsCount} phiên kiểm kho, ${countAssignmentsCount} lượt phân công, ${countBatchesCount} đợt cân bằng kho). Để bảo toàn lịch sử sổ sách, vui lòng sử dụng tính năng "Khóa tài khoản" thay thế.`
        },
        { status: 400 }
      );
    }

    // Xóa user (UserPermission tự cascade; PurchaseOrder và StockOutOrder tự setNull createdById)
    await prisma.user.delete({
      where: { id: userId }
    });

    return NextResponse.json({
      ok: true,
      message: `Đã xóa tài khoản "${user.displayName}" (${user.username}) thành công.`
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Đã có lỗi xảy ra khi xóa người dùng."
      },
      { status: 500 }
    );
  }
}
