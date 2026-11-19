import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";
import { fetchKiotVietList } from "../lib/kiotviet/client";

interface InvoiceDetail {
  productId: number;
  productCode: string;
  productName: string;
  categoryName?: string;
  quantity: number;
  price: number;
  discount?: number;
  subTotal?: number;
  note?: string;
}

interface Invoice {
  id: number;
  code: string;
  purchaseDate: string;
  createdDate: string;
  branchId: number;
  branchName: string;
  soldByName?: string;
  customerId: number;
  customerCode: string;
  customerName: string;
  orderCode?: string;
  total: number;
  totalPayment: number;
  discount: number;
  status: number;
  statusValue: string;
  description?: string;
  invoiceDetails: InvoiceDetail[];
}

interface ItemSummary {
  code: string;
  name: string;
  category: string;
  unit: string;
  totalQty: number;
  totalAmount: number;
}

async function run() {
  console.log("Đang tải toàn bộ hóa đơn chi nhánh Xuyên Mộc từ KiotViet API (từ 01/01/2026 đến nay)...");

  const fromDate = "2026-01-01T00:00:00";
  const toDate = "2026-11-16T23:59:59";

  const rawInvoices = (await fetchKiotVietList(
    `/invoices?customerCode=KH000106&fromPurchaseDate=${fromDate}&toPurchaseDate=${toDate}`,
    100
  )) as Invoice[];

  console.log(`Đã tải về tổng cộng ${rawInvoices.length} hóa đơn.`);

  const validInvoices = rawInvoices
    .filter((inv) => inv.status === 1)
    .sort((a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime());

  const cancelledInvoices = rawInvoices
    .filter((inv) => inv.status === 2)
    .sort((a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime());

  console.log(`Hóa đơn hoàn thành: ${validInvoices.length} | Hóa đơn đã hủy: ${cancelledInvoices.length}`);

  // Lấy đơn vị tính từ DB
  const allProducts = await prisma.product.findMany({
    select: { code: true, name: true, unit: true, categoryName: true }
  });
  const productUnitMap = new Map<string, { unit: string; category: string }>();
  for (const p of allProducts) {
    if (p.code) {
      productUnitMap.set(p.code.trim().toUpperCase(), {
        unit: p.unit || "",
        category: p.categoryName || ""
      });
    }
  }

  // Tổng hợp theo mặt hàng
  const itemMap = new Map<string, ItemSummary>();
  let totalGrandAmount = 0;

  for (const inv of validInvoices) {
    totalGrandAmount += inv.total || 0;
    for (const d of inv.invoiceDetails || []) {
      const code = (d.productCode || "").trim();
      const codeUpper = code.toUpperCase();
      const name = (d.productName || "").trim();
      const qty = Number(d.quantity) || 0;
      const amount = Number(d.subTotal) || (qty * Number(d.price)) || 0;
      const dbInfo = productUnitMap.get(codeUpper);

      let item = itemMap.get(codeUpper);
      if (!item) {
        item = {
          code,
          name,
          category: d.categoryName || dbInfo?.category || "Khác",
          unit: dbInfo?.unit || "",
          totalQty: 0,
          totalAmount: 0
        };
        itemMap.set(codeUpper, item);
      }
      item.totalQty += qty;
      item.totalAmount += amount;
    }
  }

  const sortedItems = Array.from(itemMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);

  // Tạo Excel Workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "YAGAMI Dashboard";
  workbook.created = new Date();

  const headerFont: Partial<ExcelJS.Font> = {
    name: "Segoe UI",
    size: 10,
    bold: true,
    color: { argb: "FFFFFFFF" }
  };

  const headerFill: ExcelJS.FillPattern = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E293B" } // Navy slate
  };

  const borderStyle: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FFE2E8F0" } },
    left: { style: "thin", color: { argb: "FFE2E8F0" } },
    bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
    right: { style: "thin", color: { argb: "FFE2E8F0" } }
  };

  // ==========================================
  // SHEET 1: BẢNG KÊ HÓA ĐƠN HOÀN THÀNH
  // ==========================================
  const wsInvoices = workbook.addWorksheet("Bảng kê hóa đơn", {
    views: [{ showGridLines: true }]
  });

  // Title & Header info
  wsInvoices.mergeCells("A1:J1");
  const t1 = wsInvoices.getCell("A1");
  t1.value = "BẢNG KÊ HÓA ĐƠN XUẤT HÀNG - CHI NHÁNH YAGAMI XUYÊN MỘC";
  t1.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FF1E3A8A" } };
  t1.alignment = { vertical: "middle", horizontal: "center" };
  wsInvoices.getRow(1).height = 32;

  wsInvoices.mergeCells("A2:J2");
  const sub1 = wsInvoices.getCell("A2");
  sub1.value = `Khách hàng: YAGAMI XUYÊN MỘC (Mã: KH000106) | Thời gian: Từ 01/01/2026 đến 16/11/2026 | Ngày xuất báo cáo: ${new Date().toLocaleString("vi-VN")}`;
  sub1.font = { name: "Segoe UI", size: 9.5, italic: true, color: { argb: "FF475569" } };
  sub1.alignment = { vertical: "middle", horizontal: "center" };
  wsInvoices.getRow(2).height = 20;

  const invHeaders = [
    "STT",
    "Mã hóa đơn",
    "Ngày xuất hàng",
    "Kho xuất hàng",
    "Nhân viên bán",
    "Tổng tiền hàng (đ)",
    "Đã thanh toán (đ)",
    "Còn lại (đ)",
    "Trạng thái",
    "Ghi chú"
  ];

  const invHeaderRow = wsInvoices.addRow(invHeaders);
  invHeaderRow.height = 26;
  invHeaderRow.eachCell((cell) => {
    cell.font = headerFont;
    cell.fill = headerFill;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = borderStyle;
  });

  let rIdx1 = 4;
  for (let i = 0; i < validInvoices.length; i++) {
    const inv = validInvoices[i];
    const dateFormatted = new Date(inv.purchaseDate).toLocaleString("vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
    const total = inv.total || 0;
    const paid = inv.totalPayment || 0;
    const debt = total - paid;

    const row = wsInvoices.addRow([
      i + 1,
      inv.code,
      dateFormatted,
      inv.branchName,
      inv.soldByName || "—",
      total,
      paid,
      debt,
      inv.statusValue || "Hoàn thành",
      inv.description || ""
    ]);
    row.height = 20;

    const isEven = i % 2 === 0;
    const rowFill: ExcelJS.FillPattern = isEven
      ? { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } }
      : { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };

    row.eachCell((cell, colNumber) => {
      cell.fill = rowFill;
      cell.border = borderStyle;
      cell.font = { name: "Segoe UI", size: 9.5 };

      if (colNumber === 1 || colNumber === 3) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
      } else if (colNumber === 2) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.font = { name: "Segoe UI", size: 9.5, bold: true };
      } else if (colNumber >= 6 && colNumber <= 8) {
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.numFmt = "#,##0";
      } else if (colNumber === 9) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.font = { name: "Segoe UI", size: 9, color: { argb: "FF16A34A" }, bold: true };
      } else {
        cell.alignment = { vertical: "middle", horizontal: "left" };
      }
    });

    rIdx1++;
  }

  // Dòng Tổng Cộng
  const invTotalRow = wsInvoices.addRow([
    "",
    "TỔNG CỘNG",
    `${validInvoices.length} hóa đơn`,
    "",
    "",
    { formula: `SUM(F4:F${rIdx1 - 1})` },
    { formula: `SUM(G4:G${rIdx1 - 1})` },
    { formula: `SUM(H4:H${rIdx1 - 1})` },
    "",
    ""
  ]);
  invTotalRow.height = 25;
  invTotalRow.eachCell((cell, colNumber) => {
    cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF1E293B" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    cell.border = borderStyle;

    if (colNumber === 2) cell.alignment = { vertical: "middle", horizontal: "center" };
    else if (colNumber >= 6 && colNumber <= 8) {
      cell.alignment = { vertical: "middle", horizontal: "right" };
      cell.numFmt = "#,##0";
    }
  });

  wsInvoices.columns = [
    { width: 6 },  // STT
    { width: 15 }, // Mã HĐ
    { width: 20 }, // Ngày xuất
    { width: 26 }, // Kho xuất
    { width: 24 }, // NV bán
    { width: 22 }, // Tổng tiền
    { width: 22 }, // Đã thanh toán
    { width: 18 }, // Còn nợ
    { width: 16 }, // Trạng thái
    { width: 28 }  // Ghi chú
  ];

  // ==========================================
  // SHEET 2: TỔNG HỢP THEO MẶT HÀNG
  // ==========================================
  const wsItems = workbook.addWorksheet("Tổng hợp theo mặt hàng", {
    views: [{ showGridLines: true }]
  });

  wsItems.mergeCells("A1:H1");
  const t2 = wsItems.getCell("A1");
  t2.value = "TỔNG HỢP HÀNG HÓA XUẤT CHO YAGAMI XUYÊN MỘC (2026)";
  t2.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FF1E3A8A" } };
  t2.alignment = { vertical: "middle", horizontal: "center" };
  wsItems.getRow(1).height = 32;

  const itemHeaders = [
    "STT",
    "Mã hàng",
    "Tên sản phẩm",
    "Nhóm hàng",
    "ĐVT",
    "Tổng số lượng mua",
    "Đơn giá mua TB (đ)",
    "Tổng thành tiền (đ)"
  ];

  const itemHeaderRow = wsItems.addRow(itemHeaders);
  itemHeaderRow.height = 26;
  itemHeaderRow.eachCell((cell) => {
    cell.font = headerFont;
    cell.fill = headerFill;
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = borderStyle;
  });

  let rIdx2 = 3;
  for (let i = 0; i < sortedItems.length; i++) {
    const item = sortedItems[i];
    const avgPrice = item.totalQty > 0 ? Math.round(item.totalAmount / item.totalQty) : 0;

    const row = wsItems.addRow([
      i + 1,
      item.code,
      item.name,
      item.category,
      item.unit,
      item.totalQty,
      avgPrice,
      item.totalAmount
    ]);
    row.height = 20;

    const isEven = i % 2 === 0;
    const rowFill: ExcelJS.FillPattern = isEven
      ? { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } }
      : { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };

    row.eachCell((cell, colNumber) => {
      cell.fill = rowFill;
      cell.border = borderStyle;
      cell.font = { name: "Segoe UI", size: 9.5 };

      if (colNumber === 1 || colNumber === 5) cell.alignment = { vertical: "middle", horizontal: "center" };
      else if (colNumber === 2) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.font = { name: "Segoe UI", size: 9.5, bold: true };
      } else if (colNumber === 3 || colNumber === 4) cell.alignment = { vertical: "middle", horizontal: "left" };
      else if (colNumber === 6) {
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.numFmt = "#,##0.##";
      } else if (colNumber >= 7) {
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.numFmt = "#,##0";
      }
    });

    rIdx2++;
  }

  // Dòng Tổng Cộng
  const itemTotalRow = wsItems.addRow([
    "",
    "TỔNG CỘNG",
    `${sortedItems.length} mặt hàng`,
    "",
    "",
    { formula: `SUM(F3:F${rIdx2 - 1})` },
    "",
    { formula: `SUM(H3:H${rIdx2 - 1})` }
  ]);
  itemTotalRow.height = 25;
  itemTotalRow.eachCell((cell, colNumber) => {
    cell.font = { name: "Segoe UI", size: 10, bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    cell.border = borderStyle;

    if (colNumber === 2) cell.alignment = { vertical: "middle", horizontal: "center" };
    else if (colNumber === 6) {
      cell.alignment = { vertical: "middle", horizontal: "right" };
      cell.numFmt = "#,##0.##";
    } else if (colNumber === 8) {
      cell.alignment = { vertical: "middle", horizontal: "right" };
      cell.numFmt = "#,##0";
    }
  });

  wsItems.columns = [
    { width: 6 },
    { width: 14 },
    { width: 40 },
    { width: 22 },
    { width: 10 },
    { width: 20 },
    { width: 22 },
    { width: 24 }
  ];

  // ==========================================
  // SHEET 3: CHI TIẾT TỪNG DÒNG HÓA ĐƠN (LINE ITEMS)
  // ==========================================
  const wsLines = workbook.addWorksheet("Chi tiết từng món xuất", {
    views: [{ showGridLines: true }]
  });

  wsLines.mergeCells("A1:I1");
  const t3 = wsLines.getCell("A1");
  t3.value = "CHI TIẾT MẶT HÀNG THEO TỪNG HÓA ĐƠN - YAGAMI XUYÊN MỘC";
  t3.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FF1E3A8A" } };
  t3.alignment = { vertical: "middle", horizontal: "center" };
  wsLines.getRow(1).height = 32;

  const lineHeaders = [
    "STT",
    "Mã HĐ",
    "Ngày xuất",
    "Mã hàng",
    "Tên sản phẩm",
    "ĐVT",
    "Số lượng",
    "Đơn giá (đ)",
    "Thành tiền (đ)"
  ];

  const lineHeaderRow = wsLines.addRow(lineHeaders);
  lineHeaderRow.height = 26;
  lineHeaderRow.eachCell((cell) => {
    cell.font = headerFont;
    cell.fill = headerFill;
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = borderStyle;
  });

  let lineCounter = 1;
  let rIdx3 = 3;

  for (const inv of validInvoices) {
    const dateFormatted = new Date(inv.purchaseDate).toLocaleDateString("vi-VN");
    for (const d of inv.invoiceDetails || []) {
      const code = (d.productCode || "").trim();
      const codeUpper = code.toUpperCase();
      const dbInfo = productUnitMap.get(codeUpper);
      const qty = Number(d.quantity) || 0;
      const price = Number(d.price) || 0;
      const subTotal = Number(d.subTotal) || (qty * price) || 0;

      const row = wsLines.addRow([
        lineCounter++,
        inv.code,
        dateFormatted,
        code,
        d.productName,
        dbInfo?.unit || "",
        qty,
        price,
        subTotal
      ]);
      row.height = 19;

      const isEven = lineCounter % 2 === 0;
      const rowFill: ExcelJS.FillPattern = isEven
        ? { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } }
        : { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };

      row.eachCell((cell, colNumber) => {
        cell.fill = rowFill;
        cell.border = borderStyle;
        cell.font = { name: "Segoe UI", size: 9 };

        if (colNumber === 1 || colNumber === 3 || colNumber === 6) {
          cell.alignment = { vertical: "middle", horizontal: "center" };
        } else if (colNumber === 2 || colNumber === 4) {
          cell.alignment = { vertical: "middle", horizontal: "center" };
          cell.font = { name: "Segoe UI", size: 9, bold: true };
        } else if (colNumber === 5) {
          cell.alignment = { vertical: "middle", horizontal: "left" };
        } else if (colNumber === 7) {
          cell.alignment = { vertical: "middle", horizontal: "right" };
          cell.numFmt = "#,##0.##";
        } else if (colNumber >= 8) {
          cell.alignment = { vertical: "middle", horizontal: "right" };
          cell.numFmt = "#,##0";
        }
      });

      rIdx3++;
    }
  }

  // Dòng Tổng Cộng Line items
  const lineTotalRow = wsLines.addRow([
    "",
    "TỔNG CỘNG",
    "",
    "",
    `${lineCounter - 1} dòng chi tiết`,
    "",
    { formula: `SUM(G3:G${rIdx3 - 1})` },
    "",
    { formula: `SUM(I3:I${rIdx3 - 1})` }
  ]);
  lineTotalRow.height = 25;
  lineTotalRow.eachCell((cell, colNumber) => {
    cell.font = { name: "Segoe UI", size: 10, bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    cell.border = borderStyle;

    if (colNumber === 2) cell.alignment = { vertical: "middle", horizontal: "center" };
    else if (colNumber === 7) {
      cell.alignment = { vertical: "middle", horizontal: "right" };
      cell.numFmt = "#,##0.##";
    } else if (colNumber === 9) {
      cell.alignment = { vertical: "middle", horizontal: "right" };
      cell.numFmt = "#,##0";
    }
  });

  wsLines.columns = [
    { width: 6 },
    { width: 15 },
    { width: 14 },
    { width: 14 },
    { width: 38 },
    { width: 10 },
    { width: 16 },
    { width: 18 },
    { width: 22 }
  ];

  // ==========================================
  // SHEET 4: HÓA ĐƠN ĐÃ HỦY
  // ==========================================
  if (cancelledInvoices.length > 0) {
    const wsCancel = workbook.addWorksheet("Hóa đơn đã hủy", {
      views: [{ showGridLines: true }]
    });

    wsCancel.mergeCells("A1:H1");
    const t4 = wsCancel.getCell("A1");
    t4.value = "DANH SÁCH HÓA ĐƠN ĐÃ HỦY - YAGAMI XUYÊN MỘC (2026)";
    t4.font = { name: "Segoe UI", size: 13, bold: true, color: { argb: "FF991B1B" } };
    t4.alignment = { vertical: "middle", horizontal: "center" };
    wsCancel.getRow(1).height = 30;

    const cHeaders = [
      "STT",
      "Mã HĐ hủy",
      "Ngày tạo",
      "Kho xuất",
      "Người bán",
      "Tổng tiền hàng (đ)",
      "Trạng thái",
      "Ghi chú"
    ];

    const cHeaderRow = wsCancel.addRow(cHeaders);
    cHeaderRow.height = 24;
    cHeaderRow.eachCell((cell) => {
      cell.font = headerFont;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7F1D1D" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = borderStyle;
    });

    let cIdx = 3;
    for (let i = 0; i < cancelledInvoices.length; i++) {
      const inv = cancelledInvoices[i];
      const dateFormatted = new Date(inv.purchaseDate).toLocaleString("vi-VN");
      const row = wsCancel.addRow([
        i + 1,
        inv.code,
        dateFormatted,
        inv.branchName,
        inv.soldByName || "—",
        inv.total || 0,
        "Đã hủy",
        inv.description || ""
      ]);
      row.height = 20;

      row.eachCell((cell, colNumber) => {
        cell.border = borderStyle;
        cell.font = { name: "Segoe UI", size: 9.5 };
        if (colNumber === 1 || colNumber === 3) cell.alignment = { vertical: "middle", horizontal: "center" };
        else if (colNumber === 2) {
          cell.alignment = { vertical: "middle", horizontal: "center" };
          cell.font = { name: "Segoe UI", size: 9.5, bold: true, strike: true };
        } else if (colNumber === 6) {
          cell.alignment = { vertical: "middle", horizontal: "right" };
          cell.numFmt = "#,##0";
        } else if (colNumber === 7) {
          cell.alignment = { vertical: "middle", horizontal: "center" };
          cell.font = { name: "Segoe UI", size: 9, color: { argb: "FFDC2626" }, bold: true };
        } else {
          cell.alignment = { vertical: "middle", horizontal: "left" };
        }
      });
      cIdx++;
    }

    const cTotalRow = wsCancel.addRow([
      "",
      "TỔNG CỘNG",
      `${cancelledInvoices.length} hóa đơn hủy`,
      "",
      "",
      { formula: `SUM(F3:F${cIdx - 1})` },
      "",
      ""
    ]);
    cTotalRow.height = 24;
    cTotalRow.eachCell((cell, colNumber) => {
      cell.font = { name: "Segoe UI", size: 10, bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
      cell.border = borderStyle;
      if (colNumber === 2) cell.alignment = { vertical: "middle", horizontal: "center" };
      else if (colNumber === 6) {
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.numFmt = "#,##0";
      }
    });

    wsCancel.columns = [
      { width: 6 },
      { width: 16 },
      { width: 20 },
      { width: 26 },
      { width: 24 },
      { width: 22 },
      { width: 16 },
      { width: 30 }
    ];
  }

  // Ghi file
  const exportDir = path.join(process.cwd(), "public", "exports");
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const exportPathWeb = path.join(exportDir, "Bang_Ke_Hoa_Don_Chi_Nhanh_Xuyen_Moc_2026.xlsx");
  const exportPathRoot = path.join(process.cwd(), "Bang_Ke_Hoa_Don_Chi_Nhanh_Xuyen_Moc_2026.xlsx");

  await workbook.xlsx.writeFile(exportPathWeb);
  await workbook.xlsx.writeFile(exportPathRoot);

  console.log("Đã xuất file thành công!");
  console.log(`- Web: ${exportPathWeb}`);
  console.log(`- Root: ${exportPathRoot}`);
}

run().catch(console.error);
