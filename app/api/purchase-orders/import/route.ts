import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function normalizeHeader(val: string): string {
  return val
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export type ValidImportItem = {
  productId: number;
  productCode: string;
  productName: string;
  unit: string;
  quantity: number;
  price: number;
  amount: number;
  occurrences: number;
};

export type SkippedImportItem = {
  rowNumber: number;
  code: string;
  productName?: string;
  quantity?: number;
  reason: string;
};

import { canUserPurchase } from "@/lib/auth/purchase-permissions";

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

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ message: "Vui lòng chọn file Excel để tải lên." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ message: "Dung lượng file Excel không được vượt quá 10 MB." }, { status: 400 });
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
      return NextResponse.json({ message: "Chỉ hỗ trợ file Excel định dạng .xlsx hoặc .xls" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount === 0) {
      return NextResponse.json({ message: "File Excel rỗng, không tìm thấy sheet dữ liệu." }, { status: 400 });
    }

    // Xác định cột Mã hàng và Số lượng
    let colCodeIdx = -1;
    let colQtyIdx = -1;
    let startRow = 1;

    // Quét dòng tiêu đề (tối đa 5 dòng đầu) để tìm tên cột phù hợp
    for (let r = 1; r <= Math.min(5, worksheet.rowCount); r++) {
      const row = worksheet.getRow(r);
      let foundCode = -1;
      let foundQty = -1;

      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const text = normalizeHeader(cell.text || String(cell.value || ""));
        if (
          ["ma hang", "mahang", "sku", "ma san pham", "masanpham", "code", "ma sp", "masp"].some(
            (k) => text === k || text.includes(k)
          )
        ) {
          foundCode = colNumber;
        } else if (
          ["so luong", "soluong", "so luong nhap", "soluongnhap", "sl", "sl nhap", "slnhap", "quantity", "qty"].some(
            (k) => text === k || text.includes(k)
          )
        ) {
          foundQty = colNumber;
        }
      });

      if (foundCode !== -1 && foundQty !== -1) {
        colCodeIdx = foundCode;
        colQtyIdx = foundQty;
        startRow = r + 1;
        break;
      }
    }

    // Nếu không tìm thấy qua tên cột, mặc định Cột 1 = Mã hàng, Cột 2 = Số lượng
    if (colCodeIdx === -1 || colQtyIdx === -1) {
      colCodeIdx = 1;
      colQtyIdx = 2;
      // Kiểm tra dòng 1 xem có phải là tiêu đề chữ hay không
      const firstRowCol2 = worksheet.getRow(1).getCell(2).value;
      const numTest = Number(firstRowCol2);
      if (isNaN(numTest) || numTest <= 0) {
        startRow = 2;
      } else {
        startRow = 1;
      }
    }

    // Lấy tất cả sản phẩm đang kích hoạt từ cơ sở dữ liệu
    const allProducts = await prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        unit: true,
        basePrice: true,
        rawJson: true
      }
    });

    // Map mã sản phẩm (chữ hoa không dấu khoảng trắng)
    const productByCode = new Map<string, (typeof allProducts)[0]>();
    for (const p of allProducts) {
      if (p.code) {
        productByCode.set(p.code.trim().toUpperCase(), p);
      }
    }

    const validItemsMap = new Map<number, ValidImportItem>();
    const skippedItems: SkippedImportItem[] = [];
    let totalProcessedRows = 0;

    for (let r = startRow; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const codeCell = row.getCell(colCodeIdx);
      const qtyCell = row.getCell(colQtyIdx);

      const rawCode = String(codeCell.value ?? "").trim();
      const rawQtyVal = qtyCell.value;

      // Bỏ qua dòng trống hoàn toàn
      if (!rawCode && (rawQtyVal === null || rawQtyVal === undefined || rawQtyVal === "")) {
        continue;
      }

      totalProcessedRows++;

      if (!rawCode) {
        skippedItems.push({
          rowNumber: r,
          code: "(Trống)",
          reason: "Dòng không có mã hàng"
        });
        continue;
      }

      const qty = Number(rawQtyVal);
      if (isNaN(qty) || qty <= 0) {
        skippedItems.push({
          rowNumber: r,
          code: rawCode,
          quantity: qty,
          reason: "Số lượng nhập không hợp lệ (phải là số > 0)"
        });
        continue;
      }

      // Tra cứu sản phẩm trong hệ thống
      const product = productByCode.get(rawCode.toUpperCase());
      if (!product) {
        skippedItems.push({
          rowNumber: r,
          code: rawCode,
          quantity: qty,
          reason: "Mã hàng không tồn tại trong hệ thống"
        });
        continue;
      }

      // Kiểm tra loại sản phẩm từ rawJson
      let isInvalidType = false;
      let typeLabel = "";
      try {
        const raw = JSON.parse(product.rawJson || "{}");
        if (raw.type === 1 || raw.type === 3) {
          isInvalidType = true;
          typeLabel = raw.type === 1 ? "đóng gói / combo" : "dịch vụ";
        }
      } catch {
        // bỏ qua nếu lỗi parse
      }

      if (isInvalidType) {
        skippedItems.push({
          rowNumber: r,
          code: rawCode,
          productName: product.name,
          quantity: qty,
          reason: `Sản phẩm ${typeLabel} không được phép nhập kho`
        });
        continue;
      }

      // Hợp lệ: Cộng dồn nếu mã đã xuất hiện trước đó trong file
      const price = Number(product.basePrice || 0);
      if (validItemsMap.has(product.id)) {
        const existing = validItemsMap.get(product.id)!;
        existing.quantity += qty;
        existing.amount = existing.quantity * existing.price;
        existing.occurrences += 1;
      } else {
        validItemsMap.set(product.id, {
          productId: product.id,
          productCode: product.code || rawCode,
          productName: product.name,
          unit: product.unit || "Cái",
          quantity: qty,
          price,
          amount: qty * price,
          occurrences: 1
        });
      }
    }

    const validItems = Array.from(validItemsMap.values());

    return NextResponse.json({
      success: true,
      totalRows: totalProcessedRows,
      validCount: validItems.length,
      skippedCount: skippedItems.length,
      validItems,
      skippedItems
    });
  } catch (error) {
    console.error("Lỗi khi đọc file Excel phiếu nhập:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Không thể xử lý file Excel." },
      { status: 500 }
    );
  }
}
