import ExcelJS from "exceljs";
import { getInventoryCountPermissions, InventoryCountAccessError, requireInventoryCountPermission } from "@/lib/auth/inventory-count";
import { excelResponse } from "@/lib/excel";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireInventoryCountPermission("COUNT_MANAGE");
    const [branches, users, products] = await Promise.all([
      prisma.branch.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
      prisma.user.findMany({ where: { isActive: true }, orderBy: { displayName: "asc" }, select: { id: true, username: true, displayName: true, role: true } }),
      prisma.product.findMany({ where: { isActive: true, code: { not: null } }, orderBy: { name: "asc" }, select: { code: true, name: true, unit: true } })
    ]);
    const executors = [];
    for (const user of users) {
      if ((await getInventoryCountPermissions(user.id, user.role)).includes("COUNT_EXECUTE")) executors.push(user);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Yagami Dashboard";
    const sheet = workbook.addWorksheet("Phan_cong");
    sheet.columns = [
      { header: "Kho", key: "branch", width: 34 },
      { header: "Tài khoản", key: "username", width: 24 },
      { header: "Mã hàng", key: "productCode", width: 22 }
    ];
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "C1" };

    const catalog = workbook.addWorksheet("Danh_muc");
    catalog.columns = [
      { header: "Kho", key: "branch", width: 34 },
      { header: "Tài khoản", key: "username", width: 24 },
      { header: "Tên nhân viên", key: "displayName", width: 30 },
      { header: "Mã hàng", key: "productCode", width: 22 },
      { header: "Tên hàng", key: "productName", width: 50 },
      { header: "ĐVT", key: "unit", width: 16 }
    ];
    const maxRows = Math.max(branches.length, executors.length, products.length);
    for (let index = 0; index < maxRows; index += 1) {
      catalog.addRow({
        branch: branches[index]?.name ?? "",
        username: executors[index]?.username ?? "",
        displayName: executors[index]?.displayName ?? "",
        productCode: products[index]?.code ?? "",
        productName: products[index]?.name ?? "",
        unit: products[index]?.unit ?? ""
      });
    }
    catalog.getRow(1).font = { bold: true };
    catalog.views = [{ state: "frozen", ySplit: 1 }];

    const branchEnd = Math.max(2, branches.length + 1);
    const userEnd = Math.max(2, executors.length + 1);
    const productEnd = Math.max(2, products.length + 1);
    for (let row = 2; row <= 501; row += 1) {
      sheet.getCell(`A${row}`).dataValidation = { type: "list", allowBlank: false, formulae: [`Danh_muc!$A$2:$A$${branchEnd}`] };
      sheet.getCell(`B${row}`).dataValidation = { type: "list", allowBlank: false, formulae: [`Danh_muc!$B$2:$B$${userEnd}`] };
      sheet.getCell(`C${row}`).dataValidation = { type: "list", allowBlank: false, formulae: [`Danh_muc!$D$2:$D$${productEnd}`] };
    }

    const guide = workbook.addWorksheet("Huong_dan");
    guide.getColumn(1).width = 110;
    [
      "Mỗi dòng là một sản phẩm được giao cho một nhân viên tại một kho.",
      "Không đổi tên ba cột Kho, Tài khoản, Mã hàng.",
      "Có thể nhập nhiều nhân viên và nhiều kho trong cùng một file.",
      "Nhập Excel chỉ gộp thêm; không xóa các phân công hiện có.",
      "Nếu mã hàng tại cùng kho đang thuộc nhân viên khác, hệ thống sẽ chặn toàn bộ file và liệt kê xung đột."
    ].forEach((text, index) => { guide.getCell(index + 1, 1).value = text; });

    return excelResponse(await workbook.xlsx.writeBuffer(), "mau-phan-cong-kiem-kho.xlsx");
  } catch (error) {
    const status = error instanceof InventoryCountAccessError ? error.status : 400;
    return Response.json({ message: error instanceof Error ? error.message : "Không thể tạo file mẫu." }, { status });
  }
}
