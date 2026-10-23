import { prisma } from "@/lib/prisma";

export const DEFAULT_PURCHASE_ORDER_GOOGLE_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1-VZCT-zf4_GID4my8JrS2eZ19184rzOd3Vm7Xy_NQNg/edit?gid=1128418770#gid=1128418770";

export const GOOGLE_SHEET_SETTING_KEY = "purchase_orders_google_sheet_url";

export type GoogleSheetRowItem = {
  sheetRowId: string;
  maPhieu: string;
  ngayNhan: string;
  thoiGian: string;
  nhanVien: string;
  maHang: string;
  tenHang: string;
  donViTinh: string;
  soLuong: number;
  ghiChu: string;
  hinhAnh: string;
};

export type GoogleSheetValidItem = {
  productId: number;
  productCode: string;
  productName: string;
  unit: string;
  quantity: number;
  price: number;
  amount: number;
  occurrences: number;
  sheetRowIds: string[];
  rawMaPhieuList: string[];
  suggestedDate?: string;
  suggestedDeliverer?: string;
};

export type GoogleSheetSkippedItem = {
  rowNumber: number;
  maPhieu?: string;
  code?: string;
  productName?: string;
  quantity?: number;
  reason: string;
};

export type GoogleSheetAlreadySyncedItem = {
  sheetRowId: string;
  maPhieu: string;
  productCode: string;
  productName: string;
  quantity: number;
  receivedDate: string;
  syncedAt?: string;
};

export type GoogleSheetPreviewResult = {
  success: boolean;
  sheetUrl: string;
  totalRows: number;
  alreadySyncedCount: number;
  newValidCount: number;
  skippedCount: number;
  validItems: GoogleSheetValidItem[];
  alreadySyncedItems: GoogleSheetAlreadySyncedItem[];
  skippedItems: GoogleSheetSkippedItem[];
  suggestedDate?: string;
  suggestedDeliverer?: string;
};

export function buildGoogleSheetCsvUrl(rawUrl: string): string {
  const url = rawUrl.trim();
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) {
    throw new Error("Đường dẫn Google Sheet không hợp lệ. Vui lòng cung cấp link dạng https://docs.google.com/spreadsheets/d/.../edit");
  }

  const docId = idMatch[1];
  const gidMatch = url.match(/gid=([0-9]+)/);
  const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : "";
  return `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv${gidParam}`;
}

export function parseCsv(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        row.push(field.trim());
        field = "";
      } else if (char === "\r") {
        // ignore carriage return
      } else if (char === "\n") {
        row.push(field.trim());
        if (row.some((cell) => cell.length > 0)) {
          lines.push(row);
        }
        row = [];
        field = "";
      } else {
        field += char;
      }
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((cell) => cell.length > 0)) {
      lines.push(row);
    }
  }

  return lines;
}

function normalizeHeader(val: string): string {
  return val
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function parseDecimal(val: unknown): number {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (!val) return 0;
  const str = String(val).trim().replace(/\s+/g, "").replace(",", ".");
  const num = Number(str);
  return Number.isFinite(num) ? num : 0;
}

export async function getSavedGoogleSheetUrl(): Promise<string> {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: GOOGLE_SHEET_SETTING_KEY }
    });
    return setting?.value?.trim() || DEFAULT_PURCHASE_ORDER_GOOGLE_SHEET_URL;
  } catch {
    return DEFAULT_PURCHASE_ORDER_GOOGLE_SHEET_URL;
  }
}

export async function saveGoogleSheetUrl(url: string): Promise<void> {
  const cleaned = url.trim();
  buildGoogleSheetCsvUrl(cleaned); // validate URL format
  await prisma.appSetting.upsert({
    where: { key: GOOGLE_SHEET_SETTING_KEY },
    create: { key: GOOGLE_SHEET_SETTING_KEY, value: cleaned },
    update: { value: cleaned }
  });
}

export async function fetchAndPreviewGoogleSheet(customUrl?: string): Promise<GoogleSheetPreviewResult> {
  const sheetUrl = customUrl?.trim() || (await getSavedGoogleSheetUrl());
  const csvUrl = buildGoogleSheetCsvUrl(sheetUrl);

  const response = await fetch(csvUrl, {
    cache: "no-store",
    headers: {
      "User-Agent": "YagamiDashboard/1.0"
    }
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Không tìm thấy Google Sheet. Vui lòng kiểm tra lại link hoặc gid của trang tính.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("Google Sheet chưa được mở quyền xem công khai (bất kỳ ai có đường liên kết). Vui lòng cấp quyền xem cho file.");
    }
    throw new Error(`Google Sheet trả về mã lỗi ${response.status}.`);
  }

  const csvText = await response.text();
  const rows = parseCsv(csvText);

  if (rows.length === 0) {
    throw new Error("File Google Sheet không có dữ liệu.");
  }

  // Quét dòng tiêu đề (tối đa 5 dòng đầu) để tìm chỉ mục cột
  let colMaPhieu = -1;
  let colNgayNhan = -1;
  let colThoiGian = -1;
  let colNhanVien = -1;
  let colMaHang = -1;
  let colTenHang = -1;
  let colDonViTinh = -1;
  let colSoLuong = -1;
  let headerRowIndex = 0;

  for (let r = 0; r < Math.min(5, rows.length); r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const h = normalizeHeader(row[c]);
      if (["maphieu", "ma phieu", "so phieu", "sophieu", "id"].some((k) => h === k)) {
        colMaPhieu = c;
      } else if (["ngay nhan", "ngaynhan", "ngay", "date"].some((k) => h === k || h.includes(k))) {
        colNgayNhan = c;
      } else if (["thoigian", "thoi gian", "time", "gio"].some((k) => h === k || h.includes(k))) {
        colThoiGian = c;
      } else if (["nhanvien", "nhan vien", "nguoi nhan", "staff"].some((k) => h === k || h.includes(k))) {
        colNhanVien = c;
      } else if (["mahang", "ma hang", "sku", "code", "ma sp", "masp"].some((k) => h === k || h.includes(k))) {
        colMaHang = c;
      } else if (["tenhang", "ten hang", "ten san pham", "name"].some((k) => h === k || h.includes(k))) {
        colTenHang = c;
      } else if (["donvitinh", "don vi tinh", "dvt", "unit"].some((k) => h === k || h.includes(k))) {
        colDonViTinh = c;
      } else if (["soluongnhan", "so luong nhan", "soluong", "so luong", "sl", "qty", "quantity"].some((k) => h === k || h.includes(k))) {
        colSoLuong = c;
      }
    }

    if (colMaHang !== -1 && colSoLuong !== -1) {
      headerRowIndex = r;
      break;
    }
  }

  // Fallback nếu không khớp được tên cột
  if (colMaHang === -1 || colSoLuong === -1) {
    colMaPhieu = 0;
    colNgayNhan = 1;
    colThoiGian = 2;
    colNhanVien = 3;
    colMaHang = 4;
    colTenHang = 5;
    colDonViTinh = 6;
    colSoLuong = 7;
    headerRowIndex = 0;
  }

  // 1. Lấy danh sách các dòng Google Sheet đã đồng bộ trước đó từ Database
  const existingSyncs = await prisma.googleSheetPurchaseSync.findMany({
    select: {
      sheetRowId: true,
      rawMaPhieu: true,
      productCode: true,
      productName: true,
      quantity: true,
      receivedDate: true,
      syncedAt: true
    }
  });

  const syncedRowIdSet = new Set(existingSyncs.map((s) => s.sheetRowId));
  const syncedByMaPhieuSet = new Set(
    existingSyncs.filter((s) => s.rawMaPhieu).map((s) => s.rawMaPhieu!.trim().toLowerCase())
  );

  // 2. Lấy toàn bộ sản phẩm đang hoạt động trong hệ thống
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

  const productByCode = new Map<string, (typeof allProducts)[0]>();
  for (const p of allProducts) {
    if (p.code) {
      productByCode.set(p.code.trim().toUpperCase(), p);
    }
  }

  const validItemsMap = new Map<number, GoogleSheetValidItem>();
  const alreadySyncedItems: GoogleSheetAlreadySyncedItem[] = [];
  const skippedItems: GoogleSheetSkippedItem[] = [];

  let latestDate: string | undefined;
  let latestStaff: string | undefined;
  let totalProcessedRows = 0;

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    const rawMaPhieu = (colMaPhieu >= 0 && row[colMaPhieu] ? row[colMaPhieu].trim() : "");
    const rawNgayNhan = (colNgayNhan >= 0 && row[colNgayNhan] ? row[colNgayNhan].trim() : "");
    const rawThoiGian = (colThoiGian >= 0 && row[colThoiGian] ? row[colThoiGian].trim() : "");
    const rawNhanVien = (colNhanVien >= 0 && row[colNhanVien] ? row[colNhanVien].trim() : "");
    const rawCode = (colMaHang >= 0 && row[colMaHang] ? row[colMaHang].trim() : "");
    const rawTenHang = (colTenHang >= 0 && row[colTenHang] ? row[colTenHang].trim() : "");
    const rawDvt = (colDonViTinh >= 0 && row[colDonViTinh] ? row[colDonViTinh].trim() : "");
    const rawQty = (colSoLuong >= 0 && row[colSoLuong] ? row[colSoLuong].trim() : "");

    // Bỏ qua dòng trống hoàn toàn
    if (!rawMaPhieu && !rawCode && !rawQty) {
      continue;
    }

    totalProcessedRows++;

    // Xây dựng sheetRowId nhận diện duy nhất dòng này
    // Ưu tiên dùng MaPhieu (nếu có mã phiếu). Nếu 1 mã phiếu có nhiều dòng thì kết hợp mã hàng.
    const rowKey = rawMaPhieu
      ? rawCode
        ? `${rawMaPhieu}:${rawCode.toUpperCase()}`
        : rawMaPhieu
      : `row_${r + 1}_${rawCode}`;

    const qty = parseDecimal(rawQty);

    // Kiểm tra xem dòng này đã được nạp/tạo phiếu trước đây chưa
    const isAlreadySynced =
      syncedRowIdSet.has(rowKey) ||
      (rawMaPhieu && syncedByMaPhieuSet.has(rawMaPhieu.toLowerCase()) && !rawCode);

    if (isAlreadySynced) {
      alreadySyncedItems.push({
        sheetRowId: rowKey,
        maPhieu: rawMaPhieu,
        productCode: rawCode,
        productName: rawTenHang,
        quantity: qty,
        receivedDate: `${rawNgayNhan} ${rawThoiGian}`.trim()
      });
      continue;
    }

    if (!rawCode) {
      skippedItems.push({
        rowNumber: r + 1,
        maPhieu: rawMaPhieu,
        code: "(Trống)",
        productName: rawTenHang,
        reason: "Dòng không có mã hàng"
      });
      continue;
    }

    if (qty <= 0) {
      skippedItems.push({
        rowNumber: r + 1,
        maPhieu: rawMaPhieu,
        code: rawCode,
        productName: rawTenHang,
        quantity: qty,
        reason: "Số lượng nhận không hợp lệ (phải > 0)"
      });
      continue;
    }

    // Tra cứu sản phẩm trong hệ thống
    const product = productByCode.get(rawCode.toUpperCase());
    if (!product) {
      skippedItems.push({
        rowNumber: r + 1,
        maPhieu: rawMaPhieu,
        code: rawCode,
        productName: rawTenHang,
        quantity: qty,
        reason: "Mã hàng không tồn tại trong hệ thống"
      });
      continue;
    }

    // Kiểm tra loại sản phẩm
    let isInvalidType = false;
    let typeLabel = "";
    try {
      const raw = JSON.parse(product.rawJson || "{}");
      if (raw.type === 1 || raw.type === 3) {
        isInvalidType = true;
        typeLabel = raw.type === 1 ? "đóng gói / combo" : "dịch vụ";
      }
    } catch {}

    if (isInvalidType) {
      skippedItems.push({
        rowNumber: r + 1,
        maPhieu: rawMaPhieu,
        code: rawCode,
        productName: product.name,
        quantity: qty,
        reason: `Sản phẩm ${typeLabel} không được phép nhập kho`
      });
      continue;
    }

    // Ghi nhận thông tin gợi ý
    if (rawNgayNhan) latestDate = rawNgayNhan;
    if (rawNhanVien) latestStaff = rawNhanVien;

    // Hợp lệ: cộng dồn vào danh sách các mặt hàng sẽ nhập
    const price = Number(product.basePrice || 0);
    if (validItemsMap.has(product.id)) {
      const existing = validItemsMap.get(product.id)!;
      existing.quantity += qty;
      existing.amount = existing.quantity * existing.price;
      existing.occurrences += 1;
      existing.sheetRowIds.push(rowKey);
      if (rawMaPhieu && !existing.rawMaPhieuList.includes(rawMaPhieu)) {
        existing.rawMaPhieuList.push(rawMaPhieu);
      }
    } else {
      validItemsMap.set(product.id, {
        productId: product.id,
        productCode: product.code || rawCode,
        productName: product.name,
        unit: product.unit || rawDvt || "Cái",
        quantity: qty,
        price,
        amount: qty * price,
        occurrences: 1,
        sheetRowIds: [rowKey],
        rawMaPhieuList: rawMaPhieu ? [rawMaPhieu] : [],
        suggestedDate: rawNgayNhan,
        suggestedDeliverer: rawNhanVien
      });
    }
  }

  const validItems = Array.from(validItemsMap.values());

  return {
    success: true,
    sheetUrl,
    totalRows: totalProcessedRows,
    alreadySyncedCount: alreadySyncedItems.length,
    newValidCount: validItems.length,
    skippedCount: skippedItems.length,
    validItems,
    alreadySyncedItems,
    skippedItems,
    suggestedDate: latestDate,
    suggestedDeliverer: latestStaff
  };
}

export async function recordSyncedGoogleSheetRows(
  purchaseOrderId: number,
  sheetRowItems: Array<{
    sheetRowId: string;
    rawMaPhieu?: string;
    productCode?: string;
    productName?: string;
    quantity?: number;
    receivedDate?: string;
    receivedTime?: string;
    staffName?: string;
  }>
): Promise<number> {
  let count = 0;
  for (const item of sheetRowItems) {
    if (!item.sheetRowId) continue;
    try {
      await prisma.googleSheetPurchaseSync.upsert({
        where: { sheetRowId: item.sheetRowId },
        create: {
          sheetRowId: item.sheetRowId,
          rawMaPhieu: item.rawMaPhieu || null,
          productCode: item.productCode || null,
          productName: item.productName || null,
          quantity: item.quantity !== undefined ? item.quantity : null,
          receivedDate: item.receivedDate || null,
          receivedTime: item.receivedTime || null,
          staffName: item.staffName || null,
          purchaseOrderId
        },
        update: {
          purchaseOrderId
        }
      });
      count++;
    } catch (err) {
      console.warn("Lỗi ghi nhận dòng sync Google Sheet:", item.sheetRowId, err);
    }
  }
  return count;
}
