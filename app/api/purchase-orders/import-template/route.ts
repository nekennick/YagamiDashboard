import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
    }

    const sampleProducts = await prisma.product.findMany({
      where: { isActive: true },
      take: 6,
      orderBy: { name: "asc" },
      select: { code: true, name: true, rawJson: true }
    });

    // Lọc mẫu chỉ lấy hàng hóa thông thường
    const validSamples = sampleProducts.filter((p) => {
      try {
        const raw = JSON.parse(p.rawJson || "{}");
        return raw.type !== 1 && raw.type !== 3;
      } catch {
        return true;
      }
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Yagami Dashboard";
    const sheet = workbook.addWorksheet("Mau_Nhap_Hang");

    // Header definition
    sheet.columns = [
      { header: "Mã hàng", key: "code", width: 22 },
      { header: "Số lượng nhập", key: "quantity", width: 18 },
      { header: "Tên sản phẩm (Ghi chú tham khảo)", key: "name", width: 40 }
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 28;

    headerRow.getCell(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" } // Indigo
    };
    headerRow.getCell(2).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" }
    };
    headerRow.getCell(3).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF6366F1" }
    };

    // Add sample rows
    if (validSamples.length > 0) {
      validSamples.forEach((p, index) => {
        const row = sheet.addRow({
          code: p.code || `SP00${index + 1}`,
          quantity: (index + 1) * 5,
          name: p.name
        });
        row.alignment = { vertical: "middle" };
        row.getCell(2).alignment = { horizontal: "right" };
      });
    } else {
      sheet.addRow({ code: "SP000028", quantity: 10, name: "A4 ép nhựa (Ví dụ mẫu)" });
      sheet.addRow({ code: "SP000024", quantity: 5, name: "Bao đường trắng (Ví dụ mẫu)" });
    }

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="Mau_Nhap_Hang_Yagami.xlsx"'
      }
    });
  } catch (error) {
    console.error("Lỗi khi tạo file mẫu Excel:", error);
    return NextResponse.json({ message: "Không thể tạo file mẫu Excel" }, { status: 500 });
  }
}
