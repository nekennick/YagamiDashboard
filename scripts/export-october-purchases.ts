import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";
import { fetchKiotVietList } from "../lib/kiotviet/client";

interface PurchaseOrderDetail {
  productId: number;
  productCode: string;
  productName: string;
  quantity: number;
  price: number;
  discount?: number;
}

interface PurchaseOrder {
  id: number;
  code: string;
  branchId: number;
  branchName: string;
  purchaseDate: string;
  createdDate: string;
  purchaseName?: string;
  supplierName?: string;
  description?: string;
  total: number;
  status: number;
  purchaseOrderDetails: PurchaseOrderDetail[];
}

interface ItemAgg {
  code: string;
  name: string;
  unit: string;
  totalQty: number;
  totalAmount: number;
  branchQty: Record<string, number>;
  branchAmount: Record<string, number>;
}

async function run() {
  console.log("Đang tải dữ liệu phiếu nhập hàng tháng 10/2026 từ KiotViet API...");

  const fromDate = "2026-10-01T00:00:00";
  const toDate = "2026-10-31T23:59:59";

  const rawOrders = (await fetchKiotVietList(
    `/purchaseorders?fromPurchaseDate=${fromDate}&toPurchaseDate=${toDate}`,
    100
  )) as PurchaseOrder[];

  console.log(`Đã tải về tổng cộng ${rawOrders.length} phiếu từ KiotViet.`);

  // Lọc các phiếu đã nhập hàng thành công (status = 3)
  const validOrders = rawOrders.filter((r) => r.status === 3);
  console.log(`Số phiếu hợp lệ (status = 3): ${validOrders.length} phiếu.`);

  // Lấy danh bạ sản phẩm để có đơn vị tính (unit)
  const allProducts = await prisma.product.findMany({
    select: { code: true, name: true, unit: true }
  });
  const productUnitMap = new Map<string, string>();
  for (const p of allProducts) {
    if (p.code) {
      productUnitMap.set(p.code.trim().toUpperCase(), p.unit || "");
    }
  }

  // Tổng hợp theo mặt hàng
  const itemMap = new Map<string, ItemAgg>();

  // Danh sách các chi nhánh xuất hiện
  const branchesSet = new Set<string>();

  for (const order of validOrders) {
    const branch = (order.branchName || "Khác").trim();
    branchesSet.add(branch);

    for (const d of order.purchaseOrderDetails || []) {
      const code = (d.productCode || "").trim();
      const codeUpper = code.toUpperCase();
      const name = (d.productName || "").trim();
      const qty = Number(d.quantity) || 0;
      const price = Number(d.price) || 0;
      const amount = qty * price;

      let item = itemMap.get(codeUpper);
      if (!item) {
        item = {
          code,
          name,
          unit: productUnitMap.get(codeUpper) || "",
          totalQty: 0,
          totalAmount: 0,
          branchQty: {},
          branchAmount: {}
        };
        itemMap.set(codeUpper, item);
      }

      item.totalQty += qty;
      item.totalAmount += amount;
      item.branchQty[branch] = (item.branchQty[branch] || 0) + qty;
      item.branchAmount[branch] = (item.branchAmount[branch] || 0) + amount;
    }
  }

  const sortedBranches = Array.from(branchesSet).sort();
  const allItems = Array.from(itemMap.values()).sort((a, b) => b.totalQty - a.totalQty);

  console.log(`Tổng hợp được ${allItems.length} mặt hàng nhập trong tháng 10.`);

  // Khởi tạo Workbook
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
  // SHEET 1: TỔNG HỢP TOÀN HỆ THỐNG
  // ==========================================
  const wsAll = workbook.addWorksheet("Tổng hợp tất cả kho", {
    views: [{ showGridLines: true }]
  });

  // Title
  wsAll.mergeCells("A1:H1");
  const titleCell = wsAll.getCell("A1");
  titleCell.value = "BÁO CÁO TỔNG KẾT HÀNG NHẬP THÁNG 10/2026 - TOÀN BỘ KHO KIOTVIET";
  titleCell.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FF1E3A8A" } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  wsAll.getRow(1).height = 32;

  // Subtitle
  wsAll.mergeCells("A2:H2");
  const subCell = wsAll.getCell("A2");
  subCell.value = `Thời gian trích xuất: ${new Date().toLocaleString("vi-VN")} | Tổng số phiếu nhập: ${validOrders.length} phiếu`;
  subCell.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: "FF64748B" } };
  subCell.alignment = { vertical: "middle", horizontal: "center" };
  wsAll.getRow(2).height = 18;

  // Headers
  const headers = [
    "STT",
    "Mã hàng",
    "Tên sản phẩm",
    "ĐVT",
    "SL Nhập (Tổng kho YAGAMI)",
    "SL Nhập (Kho Bình Dương)",
    "Tổng số lượng nhập",
    "Tổng thành tiền (đ)"
  ];

  const headerRow = wsAll.addRow(headers);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = headerFont;
    cell.fill = headerFill;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = borderStyle;
  });

  // Data rows
  let rowIdx = 4;
  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];
    const qtyTongKho = item.branchQty["Tổng kho YAGAMI"] || 0;
    const qtyBinhDuong = item.branchQty["KHO YAGAMI BÌNH DƯƠNG"] || 0;

    const row = wsAll.addRow([
      i + 1,
      item.code,
      item.name,
      item.unit,
      qtyTongKho,
      qtyBinhDuong,
      item.totalQty,
      item.totalAmount
    ]);

    row.height = 20;

    // Zebra striping
    const isEven = i % 2 === 0;
    const rowFill: ExcelJS.FillPattern = isEven
      ? { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } }
      : { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };

    row.eachCell((cell, colNumber) => {
      cell.fill = rowFill;
      cell.border = borderStyle;
      cell.font = { name: "Segoe UI", size: 9.5 };

      if (colNumber === 1) cell.alignment = { vertical: "middle", horizontal: "center" };
      else if (colNumber === 2) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.font = { name: "Segoe UI", size: 9.5, bold: true };
      } else if (colNumber === 3) cell.alignment = { vertical: "middle", horizontal: "left" };
      else if (colNumber === 4) cell.alignment = { vertical: "middle", horizontal: "center" };
      else if (colNumber >= 5 && colNumber <= 7) {
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.numFmt = "#,##0.##";
      } else if (colNumber === 8) {
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.numFmt = "#,##0";
      }
    });

    rowIdx++;
  }

  // Dòng Tổng Cộng
  const totalRow = wsAll.addRow([
    "",
    "TỔNG CỘNG",
    `${allItems.length} mặt hàng`,
    "",
    { formula: `SUM(E4:E${rowIdx - 1})` },
    { formula: `SUM(F4:F${rowIdx - 1})` },
    { formula: `SUM(G4:G${rowIdx - 1})` },
    { formula: `SUM(H4:H${rowIdx - 1})` }
  ]);
  totalRow.height = 24;
  totalRow.eachCell((cell, colNumber) => {
    cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF1E293B" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    cell.border = borderStyle;

    if (colNumber === 2) cell.alignment = { vertical: "middle", horizontal: "center" };
    else if (colNumber === 3) cell.alignment = { vertical: "middle", horizontal: "left" };
    else if (colNumber >= 5 && colNumber <= 7) {
      cell.alignment = { vertical: "middle", horizontal: "right" };
      cell.numFmt = "#,##0.##";
    } else if (colNumber === 8) {
      cell.alignment = { vertical: "middle", horizontal: "right" };
      cell.numFmt = "#,##0";
    }
  });

  // Độ rộng cột
  wsAll.columns = [
    { width: 6 },  // STT
    { width: 14 }, // Mã hàng
    { width: 40 }, // Tên sản phẩm
    { width: 10 }, // ĐVT
    { width: 28 }, // SL Tổng kho
    { width: 26 }, // SL Bình Dương
    { width: 22 }, // Tổng số lượng
    { width: 24 }  // Tổng thành tiền
  ];

  // ==========================================
  // SHEET 2: TỔNG KHO YAGAMI
  // ==========================================
  const wsTongKho = workbook.addWorksheet("Tổng kho YAGAMI", { views: [{ showGridLines: true }] });
  buildBranchSheet(wsTongKho, "Tổng kho YAGAMI", allItems, borderStyle, headerFont, headerFill);

  // ==========================================
  // SHEET 3: KHO BÌNH DƯƠNG
  // ==========================================
  const wsBD = workbook.addWorksheet("Kho YAGAMI Bình Dương", { views: [{ showGridLines: true }] });
  buildBranchSheet(wsBD, "KHO YAGAMI BÌNH DƯƠNG", allItems, borderStyle, headerFont, headerFill);

  // ==========================================
  // SHEET 4: DANH SÁCH TẤT CẢ PHIẾU NHẬP (127 PHIẾU)
  // ==========================================
  const wsOrders = workbook.addWorksheet("Danh sách phiếu nhập", { views: [{ showGridLines: true }] });
  wsOrders.mergeCells("A1:G1");
  const oTitle = wsOrders.getCell("A1");
  oTitle.value = "DANH SÁCH PHIẾU NHẬP HÀNG KIOTVIET THÁNG 10/2026";
  oTitle.font = { name: "Segoe UI", size: 13, bold: true, color: { argb: "FF1E3A8A" } };
  oTitle.alignment = { vertical: "middle", horizontal: "center" };
  wsOrders.getRow(1).height = 30;

  const orderHeaders = [
    "STT",
    "Mã phiếu nhập",
    "Ngày nhập hàng",
    "Chi nhánh / Kho",
    "Nhà cung cấp",
    "Người tạo phiếu",
    "Tổng tiền hàng (đ)"
  ];
  const oHeaderRow = wsOrders.addRow(orderHeaders);
  oHeaderRow.height = 24;
  oHeaderRow.eachCell((cell) => {
    cell.font = headerFont;
    cell.fill = headerFill;
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = borderStyle;
  });

  const sortedOrders = [...validOrders].sort(
    (a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime()
  );

  let oRowIdx = 3;
  for (let i = 0; i < sortedOrders.length; i++) {
    const o = sortedOrders[i];
    const dateStr = new Date(o.purchaseDate).toLocaleString("vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });

    const row = wsOrders.addRow([
      i + 1,
      o.code,
      dateStr,
      o.branchName,
      o.supplierName || "—",
      o.purchaseName || "—",
      o.total || 0
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

      if (colNumber === 1 || colNumber === 3) cell.alignment = { vertical: "middle", horizontal: "center" };
      else if (colNumber === 2) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.font = { name: "Segoe UI", size: 9.5, bold: true };
      } else if (colNumber === 7) {
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.numFmt = "#,##0";
      } else {
        cell.alignment = { vertical: "middle", horizontal: "left" };
      }
    });

    oRowIdx++;
  }

  // Dòng tổng phiếu
  const oTotalRow = wsOrders.addRow([
    "",
    "TỔNG CỘNG",
    `${sortedOrders.length} phiếu`,
    "",
    "",
    "",
    { formula: `SUM(G3:G${oRowIdx - 1})` }
  ]);
  oTotalRow.height = 24;
  oTotalRow.eachCell((cell, colNumber) => {
    cell.font = { name: "Segoe UI", size: 10, bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    cell.border = borderStyle;
    if (colNumber === 2) cell.alignment = { vertical: "middle", horizontal: "center" };
    else if (colNumber === 7) {
      cell.alignment = { vertical: "middle", horizontal: "right" };
      cell.numFmt = "#,##0";
    }
  });

  wsOrders.columns = [
    { width: 6 },
    { width: 16 },
    { width: 20 },
    { width: 26 },
    { width: 28 },
    { width: 22 },
    { width: 22 }
  ];

  // Lưu file
  const exportDir = path.join(process.cwd(), "public", "exports");
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const exportPathWeb = path.join(exportDir, "Bao_Cao_Nhap_Hang_Thang_10_2026.xlsx");
  const exportPathRoot = path.join(process.cwd(), "Bao_Cao_Nhap_Hang_Thang_10_2026.xlsx");

  await workbook.xlsx.writeFile(exportPathWeb);
  await workbook.xlsx.writeFile(exportPathRoot);

  console.log(`Đã xuất file thành công:`);
  console.log(`- Web: ${exportPathWeb}`);
  console.log(`- Root: ${exportPathRoot}`);
}

function buildBranchSheet(
  ws: ExcelJS.Worksheet,
  branchName: string,
  allItems: ItemAgg[],
  borderStyle: Partial<ExcelJS.Borders>,
  headerFont: Partial<ExcelJS.Font>,
  headerFill: ExcelJS.FillPattern
) {
  const branchItems = allItems
    .filter((item) => (item.branchQty[branchName] || 0) > 0)
    .sort((a, b) => (b.branchQty[branchName] || 0) - (a.branchQty[branchName] || 0));

  ws.mergeCells("A1:G1");
  const title = ws.getCell("A1");
  title.value = `BÁO CÁO NHẬP HÀNG THÁNG 10/2026 - ${branchName.toUpperCase()}`;
  title.font = { name: "Segoe UI", size: 13, bold: true, color: { argb: "FF1E3A8A" } };
  title.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 30;

  const headers = [
    "STT",
    "Mã hàng",
    "Tên sản phẩm",
    "ĐVT",
    "Số lượng nhập",
    "Đơn giá nhập TB (đ)",
    "Tổng thành tiền (đ)"
  ];

  const headerRow = ws.addRow(headers);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = headerFont;
    cell.fill = headerFill;
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = borderStyle;
  });

  let rowIdx = 3;
  for (let i = 0; i < branchItems.length; i++) {
    const item = branchItems[i];
    const qty = item.branchQty[branchName] || 0;
    const amount = item.branchAmount[branchName] || 0;
    const avgPrice = qty > 0 ? Math.round(amount / qty) : 0;

    const row = ws.addRow([
      i + 1,
      item.code,
      item.name,
      item.unit,
      qty,
      avgPrice,
      amount
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

      if (colNumber === 1 || colNumber === 4) cell.alignment = { vertical: "middle", horizontal: "center" };
      else if (colNumber === 2) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.font = { name: "Segoe UI", size: 9.5, bold: true };
      } else if (colNumber === 3) cell.alignment = { vertical: "middle", horizontal: "left" };
      else if (colNumber === 5) {
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.numFmt = "#,##0.##";
      } else if (colNumber >= 6) {
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.numFmt = "#,##0";
      }
    });

    rowIdx++;
  }

  // Dòng Tổng Cộng
  const totalRow = ws.addRow([
    "",
    "TỔNG CỘNG",
    `${branchItems.length} mặt hàng`,
    "",
    { formula: `SUM(E3:E${rowIdx - 1})` },
    "",
    { formula: `SUM(G3:G${rowIdx - 1})` }
  ]);
  totalRow.height = 24;
  totalRow.eachCell((cell, colNumber) => {
    cell.font = { name: "Segoe UI", size: 10, bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    cell.border = borderStyle;

    if (colNumber === 2) cell.alignment = { vertical: "middle", horizontal: "center" };
    else if (colNumber === 5) {
      cell.alignment = { vertical: "middle", horizontal: "right" };
      cell.numFmt = "#,##0.##";
    } else if (colNumber === 7) {
      cell.alignment = { vertical: "middle", horizontal: "right" };
      cell.numFmt = "#,##0";
    }
  });

  ws.columns = [
    { width: 6 },
    { width: 14 },
    { width: 40 },
    { width: 10 },
    { width: 20 },
    { width: 22 },
    { width: 24 }
  ];
}

run().catch(console.error);
