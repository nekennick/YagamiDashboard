import { prisma } from "@/lib/prisma";
import { fetchKiotVietPage } from "@/lib/kiotviet/client";
import { kiotVietInternalUseUrl, kiotVietInvoiceUrl, kiotVietPurchaseOrderUrl, kiotVietReturnUrl, kiotVietStocktakeUrl } from "@/lib/kiotviet/links";
import { operationalDayEnd, operationalDayStart, closestSnapshotTo } from "@/lib/inventory-ledger";
import { parseKiotVietDate } from "@/lib/kiotviet/datetime";

function formatDateTimeVN(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(d);
}

export interface SuspectDocument {
  documentType: "INVOICE" | "STOCKTAKE" | "DAMAGED_GOODS" | "INTERNAL_USE" | "RETURN" | "PURCHASE_ORDER";
  code: string;
  action: "CANCELLED" | "MODIFIED" | "CREATED" | "BACKDATED";
  actionTime: string;
  operatorName?: string;
  partnerName?: string;
  originalDate?: string;
  branchName?: string;
  quantityDelta: number;
  quantityBefore?: number;
  quantityAfter?: number;
  replacementCode?: string;
  note?: string;
  kiotVietUrl?: string;
}

export interface InvestigationResult {
  found: boolean;
  summary: string;
  suspectDocuments: SuspectDocument[];
  snapshotJump?: {
    beforeTime: string;
    beforeOnHand: number;
    afterTime: string;
    afterOnHand: number;
    delta: number;
    explanation?: string;
  } | null;
  productName: string;
  productCode: string;
  adjustment: number;
  fromCache?: boolean;
  cachedAt?: string;
}

interface RawInvoiceDetail {
  productId?: number;
  productCode?: string;
  productName?: string;
  quantity?: number;
}

interface RawInvoice {
  id?: number;
  code?: string;
  branchId?: number;
  branchName?: string;
  soldByName?: string;
  customerName?: string;
  customerCode?: string;
  status?: number;
  statusValue?: string;
  modifiedDate?: string;
  createdDate?: string;
  purchaseDate?: string;
  total?: number;
  invoiceDetails?: RawInvoiceDetail[];
}

interface RawPurchaseOrderDetail {
  productId?: number;
  productCode?: string;
  productName?: string;
  quantity?: number;
}

interface RawPurchaseOrder {
  id?: number;
  code?: string;
  branchId?: number;
  branchName?: string;
  purchaseName?: string;
  status?: number;
  statusValue?: string;
  modifiedDate?: string;
  createdDate?: string;
  purchaseDate?: string;
  total?: number;
  purchaseOrderDetails?: RawPurchaseOrderDetail[];
}

interface RawReturnDetail {
  productId?: number;
  productCode?: string;
  productName?: string;
  quantity?: number;
}

interface RawReturn {
  id?: number;
  code?: string;
  branchId?: number;
  branchName?: string;
  status?: number;
  statusValue?: string;
  modifiedDate?: string;
  createdDate?: string;
  returnDate?: string;
  returnDetails?: RawReturnDetail[];
}

export async function investigateDiscrepancy({
  productId,
  branchId,
  operationalDate,
  dateStr: dateParam,
  adjustment,
  forceRefresh
}: {
  productId: number;
  branchId: number;
  operationalDate?: string;
  dateStr?: string;
  adjustment: number;
  forceRefresh?: boolean;
}): Promise<InvestigationResult> {
  const [product, branch] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId } }),
    prisma.branch.findUnique({ where: { id: branchId } })
  ]);

  if (!product) {
    throw new Error(`Không tìm thấy sản phẩm có ID: ${productId}`);
  }

  const dateStr = operationalDate || dateParam || new Date().toISOString().slice(0, 10);
  const cacheKey = `inv_cache:${branchId}:${productId}:${dateStr}:${adjustment}`;

  // Kiểm tra bộ nhớ đệm (Cache) nếu không yêu cầu quét lại cưỡng bức
  if (!forceRefresh) {
    try {
      const cached = await prisma.appSetting.findUnique({ where: { key: cacheKey } });
      if (cached?.value) {
        const parsed = JSON.parse(cached.value);
        if (parsed && typeof parsed === "object" && parsed.found) {
          return {
            ...parsed,
            fromCache: true,
            cachedAt: cached.updatedAt.toISOString()
          };
        }
      }
    } catch (err) {
      console.error("Lỗi khi đọc cache điều tra:", err);
    }
  }

  const operationalStart = operationalDayStart(dateStr);
  const operationalEnd = operationalDayEnd(dateStr);

  // 1. Phân tích snapshot trong cơ sở dữ liệu để tìm khung giờ có bước nhảy tồn kho và mốc chốt ca thực tế
  const snapshots = await prisma.inventorySnapshot.findMany({
    where: {
      productId,
      branchId,
      snapshotDate: {
        gte: new Date(operationalStart.getTime() - 2 * 60 * 60 * 1000),
        lte: new Date(operationalEnd.getTime() + 2 * 60 * 60 * 1000)
      }
    },
    orderBy: { snapshotDate: "asc" }
  });

  const closingSnapshot = closestSnapshotTo(snapshots, operationalEnd);
  const shiftCutoffTime = closingSnapshot ? closingSnapshot.snapshotDate : operationalEnd;

  let snapshotJump: InvestigationResult["snapshotJump"] = null;
  if (snapshots.length >= 2) {
    let closestDiff = Number.POSITIVE_INFINITY;
    // Cho phép dung sai: bước nhảy phải cùng chiều với adjustment VÀ độ lệch không quá 25% hoặc 5 đơn vị
    const maxAllowedDiff = Math.max(5, Math.abs(adjustment) * 0.25);
    for (let i = 0; i < snapshots.length - 1; i++) {
      const before = snapshots[i];
      const after = snapshots[i + 1];
      const delta = Number(after.onHand) - Number(before.onHand);
      if (Math.abs(delta) > 0.000001) {
        // Chỉ chấp nhận bước nhảy cùng chiều (cùng dấu) với adjustment và nằm trong ngưỡng sai số cho phép
        if (Math.sign(delta) === Math.sign(adjustment)) {
          const diff = Math.abs(delta - adjustment);
          if (diff <= maxAllowedDiff && diff < closestDiff) {
            closestDiff = diff;
            snapshotJump = {
              beforeTime: before.snapshotDate.toISOString(),
              beforeOnHand: Number(before.onHand),
              afterTime: after.snapshotDate.toISOString(),
              afterOnHand: Number(after.onHand),
              delta
            };
          }
        }
      }
    }
  }

  const suspectDocuments: SuspectDocument[] = [];
  const kvBranchId = branch?.kvBranchId ? Number(branch.kvBranchId) : null;
  let apiInvoices: RawInvoice[] = [];
  let apiPurchaseOrders: RawPurchaseOrder[] = [];
  let apiReturns: RawReturn[] = [];

  // 2. Tra cứu phiếu kiểm kho bị hủy trong cơ sở dữ liệu
  // KiotViet Stocktake: Status 0 = Phiếu tạm (Draft - không ảnh hưởng kho), Status 1 = Đã cân bằng, Status 2 = Đã hủy
  const cancelledStocktakes = await prisma.stocktakeLine.findMany({
    where: {
      productId,
      adjustmentValue: { not: 0 },
      stocktakeDocument: {
        status: 2, // Chỉ lấy phiếu ĐÃ HỦY (status 2), tuyệt đối không lấy phiếu tạm (status 0)
        branchId,
        OR: [
          { sourceModifiedAt: { gte: operationalStart, lt: operationalEnd } },
          { sourceModifiedAt: null, sourceCreatedAt: { gte: operationalStart, lt: operationalEnd } }
        ]
      }
    },
    include: {
      stocktakeDocument: true
    }
  });

  for (const st of cancelledStocktakes) {
    const delta = Number(st.adjustmentValue);
    if (!delta || Math.abs(delta) < 0.000001) continue;

    suspectDocuments.push({
      documentType: "STOCKTAKE",
      code: st.stocktakeDocument.code,
      action: "CANCELLED",
      actionTime: (st.stocktakeDocument.sourceModifiedAt ?? st.stocktakeDocument.sourceCreatedAt)?.toISOString() ?? "",
      operatorName: st.stocktakeDocument.createdByName ?? undefined,
      branchName: branch?.name,
      quantityDelta: delta,
      note: `Phiếu kiểm kho đã hủy làm hoàn lại lượng kiểm kê ${delta > 0 ? "+" : ""}${delta}`,
      kiotVietUrl: kiotVietStocktakeUrl(st.stocktakeDocument.code)
    });
  }

  // 3. Tra cứu hóa đơn bị sửa, hủy hoặc lập lùi ngày (kết hợp cả DB và KiotViet API)
  try {
    const modifiedInvoicesRes = await fetchKiotVietPage(
      `/invoices?lastModifiedFrom=${encodeURIComponent(operationalStart.toISOString())}&pageSize=100`
    );
    apiInvoices = (modifiedInvoicesRes.records as RawInvoice[]) || [];

    // Lấy tất cả hóa đơn của sản phẩm này tại chi nhánh trong vòng 45 ngày trước mốc kết thúc ca
    // để bao quát toàn bộ: hóa đơn trong ca, hóa đơn lập lùi ngày, và các hóa đơn cũ bị chỉnh sửa/hủy trong ca này
    const candidateInvoices = await prisma.invoice.findMany({
      where: {
        branchId,
        items: { some: { productId } },
        purchaseDate: {
          gte: new Date(operationalStart.getTime() - 45 * 24 * 60 * 60 * 1000),
          lte: new Date(shiftCutoffTime.getTime() + 2 * 24 * 60 * 60 * 1000)
        }
      },
      include: {
        items: { where: { productId } },
        customer: true,
        branch: true
      }
    });

    // Gom nhóm tất cả hóa đơn theo mã gốc (ví dụ HD049092 và HD049092.01)
    type UnifiedInvoice = {
      code: string;
      baseCode: string;
      isCancelled: boolean;
      purchaseDate: Date;
      createdDate?: Date;
      modifiedDate?: Date;
      quantity: number;
      operatorName?: string;
      customerName?: string;
      branchName?: string;
    };

    const invoiceGroupMap = new Map<string, UnifiedInvoice[]>();

    const addUnifiedInvoice = (inv: UnifiedInvoice) => {
      const list = invoiceGroupMap.get(inv.baseCode) || [];
      if (!list.some((existing) => existing.code === inv.code)) {
        list.push(inv);
        invoiceGroupMap.set(inv.baseCode, list);
      }
    };

    // Nạp từ DB
    for (const inv of candidateInvoices) {
      if (!inv.code) continue;
      const baseCode = inv.code.replace(/\.\d+$/, "");
      const raw = JSON.parse(inv.rawJson || "{}");
      const createdDate = parseKiotVietDate(raw.createdDate || raw.CreatedDate);
      const modifiedDate = parseKiotVietDate(raw.modifiedDate || raw.ModifiedDate);
      const isCancelled = inv.status === "Đã hủy" || inv.status === "Hủy";
      const quantity = inv.items.reduce((s, it) => s + Number(it.quantity), 0);

      addUnifiedInvoice({
        code: inv.code,
        baseCode,
        isCancelled,
        purchaseDate: inv.purchaseDate,
        createdDate,
        modifiedDate,
        quantity,
        operatorName: raw.soldByName || raw.createdByName || raw.user,
        customerName: raw.customerName || inv.customer?.name,
        branchName: raw.branchName || inv.branch?.name
      });
    }

    // Nạp từ KiotViet API nếu có
    for (const inv of apiInvoices) {
      if (!inv.code) continue;
      const baseCode = inv.code.replace(/\.\d+$/, "");
      const isCancelled = inv.status === 2 || inv.statusValue === "Đã hủy";
      const purchaseDate = parseKiotVietDate(inv.purchaseDate) || new Date();
      const createdDate = parseKiotVietDate(inv.createdDate);
      const modifiedDate = parseKiotVietDate(inv.modifiedDate);
      const detail = (inv.invoiceDetails || []).find(
        (d) => d.productCode === product.code || d.productId === Number(product.kvProductId)
      );
      const quantity = detail?.quantity ?? 0;

      addUnifiedInvoice({
        code: inv.code,
        baseCode,
        isCancelled,
        purchaseDate,
        createdDate,
        modifiedDate,
        quantity,
        operatorName: inv.soldByName,
        customerName: inv.customerName,
        branchName: inv.branchName
      });
    }

    // Duyệt qua từng nhóm hóa đơn để nhận diện chính xác nguyên nhân
    for (const [baseCode, group] of invoiceGroupMap.entries()) {
      const hasItem = group.some((g) => g.quantity > 0);
      if (!hasItem) continue;

      const cancelledInvs = group.filter((g) => g.isCancelled);
      const activeInvs = group.filter((g) => !g.isCancelled);

      // Trường hợp 1: Hóa đơn được chỉnh sửa (có bản hủy và bản mới thay thế)
      if (cancelledInvs.length > 0 && activeInvs.length > 0) {
        const cancelled = cancelledInvs[0];
        const active = activeInvs[0];
        const oldQty = cancelled.quantity;
        const newQty = active.quantity;
        const diff = newQty - oldQty;

        if (Math.abs(diff) > 0.000001) {
          const modTime = cancelled.modifiedDate || active.createdDate;

          // TH1a: Đơn thuộc ca này, nhưng bị sửa SAU KHI ca đã chốt sổ (modTime > shiftCutoffTime)
          // Snapshot chốt ca đã trừ oldQty. Sổ sách tính theo newQty -> Chênh lệch (snapshot - ledger) = diff
          if (
            cancelled.purchaseDate >= operationalStart &&
            cancelled.purchaseDate < shiftCutoffTime &&
            modTime &&
            modTime.getTime() > shiftCutoffTime.getTime() + 5 * 60 * 1000
          ) {
            const impact = diff; // ví dụ: từ 2 xuống 1 -> diff = -1
            suspectDocuments.push({
              documentType: "INVOICE",
              code: `${cancelled.code} (${active.code})`,
              action: "MODIFIED",
              actionTime: modTime.toISOString(),
              operatorName: active.operatorName || cancelled.operatorName,
              partnerName: active.customerName || cancelled.customerName,
              originalDate: cancelled.purchaseDate.toISOString(),
              branchName: active.branchName || cancelled.branchName,
              quantityBefore: oldQty,
              quantityAfter: newQty,
              quantityDelta: impact,
              replacementCode: active.code,
              note: `Hóa đơn được chỉnh sửa từ ${oldQty} thành ${newQty} (thay thế bởi ${active.code}) vào lúc ${formatDateTimeVN(modTime)} (sau khi ca đã chốt sổ lúc ${formatDateTimeVN(shiftCutoffTime)}). Snapshot chốt ca đã trừ ${oldQty}, nhưng sổ sách thẻ kho cập nhật lại chỉ trừ ${newQty}, tạo nên chênh lệch: ${impact > 0 ? "+" : ""}${impact}.`,
              kiotVietUrl: kiotVietInvoiceUrl(active.code || baseCode)
            });
          }
          // TH1b: Đơn thuộc ca cũ, nhưng được sửa trong ca này -> KiotViet hoàn/trừ tồn trong ca này
          else if (
            cancelled.purchaseDate < operationalStart &&
            modTime &&
            modTime.getTime() >= operationalStart.getTime() &&
            modTime.getTime() < shiftCutoffTime.getTime()
          ) {
            const impact = -diff; // ví dụ: ngày cũ xuất ít đi 1 -> kho ca này nhận lại +1
            suspectDocuments.push({
              documentType: "INVOICE",
              code: `${cancelled.code} (${active.code})`,
              action: "MODIFIED",
              actionTime: modTime.toISOString(),
              operatorName: active.operatorName || cancelled.operatorName,
              partnerName: active.customerName || cancelled.customerName,
              originalDate: cancelled.purchaseDate.toISOString(),
              branchName: active.branchName || cancelled.branchName,
              quantityBefore: oldQty,
              quantityAfter: newQty,
              quantityDelta: impact,
              replacementCode: active.code,
              note: `Hóa đơn cũ (ngày ${formatDateTimeVN(cancelled.purchaseDate)}) được chỉnh sửa từ ${oldQty} thành ${newQty} trong ca này lúc ${formatDateTimeVN(modTime)}. KiotViet tự động điều chỉnh tồn kho trong ca này ${impact > 0 ? "+" : ""}${impact}, trong khi sổ sách ca này không có dòng xuất tương ứng.`,
              kiotVietUrl: kiotVietInvoiceUrl(active.code || baseCode)
            });
          }
        }
      }
      // Trường hợp 2: Hóa đơn bị hủy hoàn toàn (không có đơn thay thế)
      else if (cancelledInvs.length > 0 && activeInvs.length === 0) {
        for (const cancelled of cancelledInvs) {
          if (cancelled.quantity <= 0) continue;
          const modTime = cancelled.modifiedDate;

          // Nếu bị hủy sau khi ca đã chốt sổ:
          if (
            cancelled.purchaseDate >= operationalStart &&
            cancelled.purchaseDate < shiftCutoffTime &&
            modTime &&
            modTime.getTime() > shiftCutoffTime.getTime() + 5 * 60 * 1000
          ) {
            const impact = -cancelled.quantity;
            suspectDocuments.push({
              documentType: "INVOICE",
              code: cancelled.code,
              action: "CANCELLED",
              actionTime: modTime.toISOString(),
              operatorName: cancelled.operatorName,
              partnerName: cancelled.customerName,
              originalDate: cancelled.purchaseDate.toISOString(),
              branchName: cancelled.branchName,
              quantityBefore: cancelled.quantity,
              quantityAfter: 0,
              quantityDelta: impact,
              note: `Hóa đơn bán ${cancelled.quantity} bị hủy vào lúc ${formatDateTimeVN(modTime)} (sau khi ca đã chốt sổ). Snapshot chốt ca đã trừ lượng này, nhưng sổ sách đã xóa bỏ dòng xuất, tạo nên chênh lệch: ${impact}.`,
              kiotVietUrl: kiotVietInvoiceUrl(cancelled.code || baseCode)
            });
          }
          // Nếu đơn ngày cũ bị hủy trong ca này:
          else if (
            cancelled.purchaseDate < operationalStart &&
            modTime &&
            modTime.getTime() >= operationalStart.getTime() &&
            modTime.getTime() < shiftCutoffTime.getTime()
          ) {
            const impact = cancelled.quantity;
            suspectDocuments.push({
              documentType: "INVOICE",
              code: cancelled.code,
              action: "CANCELLED",
              actionTime: modTime.toISOString(),
              operatorName: cancelled.operatorName,
              partnerName: cancelled.customerName,
              originalDate: cancelled.purchaseDate.toISOString(),
              branchName: cancelled.branchName,
              quantityBefore: cancelled.quantity,
              quantityAfter: 0,
              quantityDelta: impact,
              note: `Hóa đơn cũ (ngày ${formatDateTimeVN(cancelled.purchaseDate)}) bị hủy trong ca này lúc ${formatDateTimeVN(modTime)} làm hoàn tồn kho +${impact}.`,
              kiotVietUrl: kiotVietInvoiceUrl(cancelled.code || baseCode)
            });
          }
        }
      }
      // Trường hợp 3: Hóa đơn mới hoàn toàn lập lùi ngày (không phải đơn thay thế)
      else if (activeInvs.length > 0 && cancelledInvs.length === 0) {
        for (const active of activeInvs) {
          if (active.quantity <= 0) continue;
          const createdDate = active.createdDate;
          if (!createdDate) continue;

          // Case 3a: Thuộc ca này nhưng tạo thực tế sau khi ca đã chốt sổ
          if (
            active.purchaseDate >= operationalStart &&
            active.purchaseDate < shiftCutoffTime &&
            createdDate.getTime() > shiftCutoffTime.getTime() + 5 * 60 * 1000
          ) {
            const impact = active.quantity;
            const diffMs = createdDate.getTime() - active.purchaseDate.getTime();
            const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
            const diffHours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
            const delayDesc = diffDays > 0
              ? `tạo trễ ${diffDays} ngày ${diffHours > 0 ? `${diffHours} giờ ` : ""}(chọn lùi ngày bán về ${formatDateTimeVN(active.purchaseDate)})`
              : `tạo trễ lúc ${formatDateTimeVN(createdDate)} (sau khi ca đã chốt sổ lúc ${formatDateTimeVN(shiftCutoffTime)})`;

            suspectDocuments.push({
              documentType: "INVOICE",
              code: active.code,
              action: "BACKDATED",
              actionTime: createdDate.toISOString(),
              operatorName: active.operatorName,
              partnerName: active.customerName,
              originalDate: active.purchaseDate.toISOString(),
              branchName: active.branchName,
              quantityBefore: 0,
              quantityAfter: active.quantity,
              quantityDelta: impact,
              note: `Hóa đơn lập lùi ngày: Đơn bán ${active.quantity} ${product.unit || "sp"} cho ${active.customerName || "Khách lẻ"} được nhân viên ${active.operatorName || "thực hiện"} tạo thực tế trên KiotViet vào lúc ${formatDateTimeVN(createdDate)}, ${delayDesc}. Tại thời điểm chốt ca ${formatDateTimeVN(shiftCutoffTime)}, hóa đơn này chưa hề tồn tại trên KiotViet nên snapshot chốt ca chưa trừ, tạo nên chênh lệch tồn thực tế cao hơn sổ sách +${impact}.`,
              kiotVietUrl: kiotVietInvoiceUrl(active.code || baseCode)
            });
          }
          // Case 3b: Tạo thực tế trong ca này nhưng lùi ngày bán về trước ca này
          else if (
            createdDate.getTime() >= operationalStart.getTime() &&
            createdDate.getTime() < shiftCutoffTime.getTime() &&
            active.purchaseDate.getTime() < operationalStart.getTime() - 5 * 60 * 1000
          ) {
            const impact = -active.quantity;
            const diffMs = createdDate.getTime() - active.purchaseDate.getTime();
            const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
            const diffHours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

            suspectDocuments.push({
              documentType: "INVOICE",
              code: active.code,
              action: "BACKDATED",
              actionTime: createdDate.toISOString(),
              operatorName: active.operatorName,
              partnerName: active.customerName,
              originalDate: active.purchaseDate.toISOString(),
              branchName: active.branchName,
              quantityBefore: 0,
              quantityAfter: active.quantity,
              quantityDelta: impact,
              note: `Hóa đơn tạo trong ca nhưng lùi ngày: Đơn bán ${active.quantity} ${product.unit || "sp"} cho ${active.customerName || "Khách lẻ"} được tạo lúc ${formatDateTimeVN(createdDate)} làm giảm tồn kho KiotViet trong ca này, nhưng lại chọn lùi ngày bán về ${formatDateTimeVN(active.purchaseDate)} (trước ca này ${diffDays > 0 ? `${diffDays} ngày` : `${diffHours} giờ`}). Do đó sổ sách ca này không có dòng xuất tương ứng, tạo nên chênh lệch tồn thực tế thấp hơn lý thuyết ${impact}.`,
              kiotVietUrl: kiotVietInvoiceUrl(active.code || baseCode)
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("Lỗi khi điều tra hóa đơn:", err);
  }

  // 3b. Quét KiotViet Public API cho phiếu nhập hàng (Purchase Orders) bị hủy / sửa / lùi ngày
  try {
    const modifiedPOsRes = await fetchKiotVietPage(
      `/purchaseorders?lastModifiedFrom=${encodeURIComponent(operationalStart.toISOString())}&pageSize=100`
    );
    apiPurchaseOrders = (modifiedPOsRes.records as RawPurchaseOrder[]) || [];

    for (const po of apiPurchaseOrders) {
      if (kvBranchId !== null && po.branchId && po.branchId !== kvBranchId) {
        continue;
      }
      if (suspectDocuments.some((d) => d.code === po.code)) continue;

      const detail = (po.purchaseOrderDetails || []).find(
        (d: RawPurchaseOrderDetail) => d.productCode === product.code || d.productId === Number(product.kvProductId)
      );
      if (!detail || !detail.quantity) continue;

      const purchaseDate = parseKiotVietDate(po.purchaseDate);
      const createdDate = parseKiotVietDate(po.createdDate);
      const modifiedDate = parseKiotVietDate(po.modifiedDate);

      // KiotViet PurchaseOrder: status = 4 là ĐÃ HỦY (Cancelled)
      if (po.status === 4 || po.statusValue === "Đã hủy") {
        const delta = -detail.quantity;
        suspectDocuments.push({
          documentType: "PURCHASE_ORDER",
          code: po.code || "PN_UNKNOWN",
          action: "CANCELLED",
          actionTime: modifiedDate?.toISOString() || createdDate?.toISOString() || "",
          operatorName: po.purchaseName,
          originalDate: purchaseDate?.toISOString(),
          branchName: po.branchName || branch?.name,
          quantityBefore: detail.quantity,
          quantityAfter: 0,
          quantityDelta: delta,
          note: `Phiếu nhập hàng cũ (ngày ${purchaseDate ? formatDateTimeVN(purchaseDate) : "trước"}) bị hủy trên KiotViet làm giảm trừ tồn kho ${delta}.`,
          kiotVietUrl: po.code ? kiotVietPurchaseOrderUrl(po.code) : undefined
        });
      }
      // Phiếu nhập hàng lập lùi ngày
      else if (
        purchaseDate &&
        createdDate &&
        purchaseDate.getTime() >= operationalStart.getTime() &&
        purchaseDate.getTime() < shiftCutoffTime.getTime() &&
        createdDate.getTime() > shiftCutoffTime.getTime() + 5 * 60 * 1000
      ) {
        const qtyIn = detail.quantity;
        const impact = -qtyIn; // Nhập hàng vào sổ sách nhưng snapshot chốt ca chưa có -> Lệch âm (-)
        const diffMs = createdDate.getTime() - purchaseDate.getTime();
        const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
        const diffHours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const delayDesc = diffDays > 0
          ? `tạo trễ ${diffDays} ngày ${diffHours > 0 ? `${diffHours} giờ ` : ""}(chọn lùi ngày nhập về ${formatDateTimeVN(purchaseDate)})`
          : `tạo trễ lúc ${formatDateTimeVN(createdDate)} (sau khi ca đã chốt sổ lúc ${formatDateTimeVN(shiftCutoffTime)})`;

        suspectDocuments.push({
          documentType: "PURCHASE_ORDER",
          code: po.code || "PN",
          action: "BACKDATED",
          actionTime: createdDate.toISOString(),
          operatorName: po.purchaseName,
          originalDate: purchaseDate.toISOString(),
          branchName: po.branchName || branch?.name,
          quantityBefore: 0,
          quantityAfter: qtyIn,
          quantityDelta: impact,
          note: `Phiếu nhập lập lùi ngày: Phiếu nhập ${qtyIn} ${product.unit || "sp"} được nhân viên ${po.purchaseName || "thực hiện"} tạo trên KiotViet vào lúc ${formatDateTimeVN(createdDate)}, ${delayDesc}. Tại thời điểm chốt ca ${formatDateTimeVN(shiftCutoffTime)}, phiếu nhập chưa tồn tại nên snapshot chưa có, tạo nên chênh lệch: ${impact}.`,
          kiotVietUrl: po.code ? kiotVietPurchaseOrderUrl(po.code) : undefined
        });
      }
    }
  } catch (err) {
    console.error("Lỗi khi quét KiotViet API để điều tra phiếu nhập:", err);
  }

  // 3c. Quét KiotViet Public API cho hóa đơn trả hàng (Returns) bị hủy / sửa / lùi ngày
  try {
    const modifiedReturnsRes = await fetchKiotVietPage(
      `/returns?lastModifiedFrom=${encodeURIComponent(operationalStart.toISOString())}&pageSize=100`
    );
    apiReturns = (modifiedReturnsRes.records as RawReturn[]) || [];

    for (const ret of apiReturns) {
      if (kvBranchId !== null && ret.branchId && ret.branchId !== kvBranchId) {
        continue;
      }
      if (suspectDocuments.some((d) => d.code === ret.code)) continue;

      const detail = (ret.returnDetails || []).find(
        (d: RawReturnDetail) => d.productCode === product.code || d.productId === Number(product.kvProductId)
      );
      if (!detail || !detail.quantity) continue;

      const returnDate = parseKiotVietDate(ret.returnDate);
      const createdDate = parseKiotVietDate(ret.createdDate);
      const modifiedDate = parseKiotVietDate(ret.modifiedDate);

      // KiotViet Return: status = 2 là ĐÃ HỦY (Cancelled)
      if (ret.status === 2 || ret.statusValue === "Đã hủy") {
        const delta = -detail.quantity;
        suspectDocuments.push({
          documentType: "RETURN",
          code: ret.code || "TH_UNKNOWN",
          action: "CANCELLED",
          actionTime: modifiedDate?.toISOString() || createdDate?.toISOString() || "",
          originalDate: returnDate?.toISOString(),
          branchName: ret.branchName || branch?.name,
          quantityBefore: detail.quantity,
          quantityAfter: 0,
          quantityDelta: delta,
          note: `Phiếu khách trả hàng cũ (ngày ${returnDate ? formatDateTimeVN(returnDate) : "trước"}) bị hủy trên KiotViet làm giảm trừ tồn kho ${delta}.`,
          kiotVietUrl: ret.code ? kiotVietReturnUrl(ret.code) : undefined
        });
      }
      // Phiếu trả hàng lập lùi ngày
      else if (
        returnDate &&
        createdDate &&
        returnDate.getTime() >= operationalStart.getTime() &&
        returnDate.getTime() < shiftCutoffTime.getTime() &&
        createdDate.getTime() > shiftCutoffTime.getTime() + 5 * 60 * 1000
      ) {
        const qtyRet = detail.quantity;
        const impact = -qtyRet;
        const diffMs = createdDate.getTime() - returnDate.getTime();
        const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
        const diffHours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const delayDesc = diffDays > 0
          ? `tạo trễ ${diffDays} ngày ${diffHours > 0 ? `${diffHours} giờ ` : ""}(chọn lùi ngày trả về ${formatDateTimeVN(returnDate)})`
          : `tạo trễ lúc ${formatDateTimeVN(createdDate)} (sau khi ca đã chốt sổ lúc ${formatDateTimeVN(shiftCutoffTime)})`;

        suspectDocuments.push({
          documentType: "RETURN",
          code: ret.code || "TH",
          action: "BACKDATED",
          actionTime: createdDate.toISOString(),
          originalDate: returnDate.toISOString(),
          branchName: ret.branchName || branch?.name,
          quantityBefore: 0,
          quantityAfter: qtyRet,
          quantityDelta: impact,
          note: `Phiếu trả hàng lập lùi ngày: Khách trả hàng ${qtyRet} ${product.unit || "sp"} được tạo trên KiotViet vào lúc ${formatDateTimeVN(createdDate)}, ${delayDesc}. Snapshot chốt ca chưa ghi nhận, tạo nên chênh lệch: ${impact}.`,
          kiotVietUrl: ret.code ? kiotVietReturnUrl(ret.code) : undefined
        });
      }
    }
  } catch (err) {
    console.error("Lỗi khi quét KiotViet API để điều tra phiếu trả hàng:", err);
  }

  // 3d. Tra cứu phiếu xuất dùng nội bộ (Internal Use) liên quan đến sản phẩm
  try {
    const internalUseMovements = await prisma.inventoryMovement.findMany({
      where: {
        productId,
        branchId,
        sourceType: "INTERNAL_USE"
      },
      orderBy: { occurredAt: "desc" }
    });

    for (const move of internalUseMovements) {
      if (!move.documentCode) continue;
      const raw = JSON.parse(move.rawJson || "{}");
      const createdDate = parseKiotVietDate(raw.CreatedDate || raw.createdDate) || move.occurredAt;
      const qty = Math.abs(Number(move.quantityDelta));

      // TH1: Phiếu xuất dùng nội bộ bị hủy (status === "3" hoặc isActive === false)
      if (move.status === "3" || !move.isActive) {
        const impact = qty; // Hủy xuất dùng -> Hoàn lại tồn kho (+)
        suspectDocuments.push({
          documentType: "INTERNAL_USE",
          code: move.documentCode,
          action: "CANCELLED",
          actionTime: move.occurredAt.toISOString(),
          originalDate: move.occurredAt.toISOString(),
          operatorName: move.partnerName || "Xuất dùng nội bộ",
          branchName: branch?.name,
          quantityBefore: qty,
          quantityAfter: 0,
          quantityDelta: impact,
          note: `Phiếu xuất dùng nội bộ ${move.documentCode} (${qty} ${product.unit || "sp"}) đã bị hủy trên KiotViet làm hoàn lại tồn kho: +${qty}.`,
          kiotVietUrl: kiotVietInternalUseUrl(move.documentCode)
        });
      }
      // TH2: Phiếu xuất dùng nội bộ tạo trễ / lập lùi ngày hoặc ghi chú cho ngày cũ
      else {
        // Kiểm tra xem phiếu có thuộc ca này nhưng được tạo sau mốc chốt ca không:
        if (
          move.occurredAt.getTime() >= operationalStart.getTime() &&
          move.occurredAt.getTime() < shiftCutoffTime.getTime() &&
          createdDate.getTime() > shiftCutoffTime.getTime() + 5 * 60 * 1000
        ) {
          const impact = -qty;
          suspectDocuments.push({
            documentType: "INTERNAL_USE",
            code: move.documentCode,
            action: "BACKDATED",
            actionTime: createdDate.toISOString(),
            originalDate: move.occurredAt.toISOString(),
            operatorName: move.partnerName || "Xuất dùng nội bộ",
            branchName: branch?.name,
            quantityBefore: 0,
            quantityAfter: qty,
            quantityDelta: impact,
            note: `Phiếu xuất dùng nội bộ lập trễ: Phiếu xuất ${qty} ${product.unit || "sp"} (${move.partnerName || ""}) được tạo lúc ${formatDateTimeVN(createdDate)} (sau khi ca đã chốt sổ). Snapshot chốt ca chưa trừ lượng này, tạo nên chênh lệch: ${impact}.`,
            kiotVietUrl: kiotVietInternalUseUrl(move.documentCode)
          });
        }
        // Kiểm tra xem phiếu có diễn giải xuất cho ngày cũ (ví dụ ghi chú "n26/10", "ngày 23.10"):
        const noteText = (move.partnerName || "").toLowerCase();
        const dateMatch = noteText.match(/(\d{1,2})[./-](\d{1,2})/);
        let intendedDateStr: string | null = null;
        if (dateMatch) {
          const day = dateMatch[1].padStart(2, "0");
          const month = dateMatch[2].padStart(2, "0");
          const year = new Date().getFullYear();
          intendedDateStr = `${year}-${month}-${day}`;
        }

        if (intendedDateStr === dateStr && createdDate.getTime() >= operationalEnd.getTime()) {
          const impact = -qty;
          suspectDocuments.push({
            documentType: "INTERNAL_USE",
            code: move.documentCode,
            action: "BACKDATED",
            actionTime: createdDate.toISOString(),
            originalDate: move.occurredAt.toISOString(),
            operatorName: move.partnerName || "Xuất dùng nội bộ",
            branchName: branch?.name,
            quantityBefore: 0,
            quantityAfter: qty,
            quantityDelta: impact,
            note: `Hàng xuất dùng thực tế trong ca ngày ${dateStr} (${move.partnerName}), nhưng phiếu ${move.documentCode} mãi đến lúc ${formatDateTimeVN(createdDate)} mới được lập trên KiotViet. Tại thời điểm chốt ca ${dateStr}, thẻ kho chưa có dòng xuất này nên snapshot thực tế thấp hơn lý thuyết: ${impact}.`,
            kiotVietUrl: kiotVietInternalUseUrl(move.documentCode)
          });
        }
      }
    }
  } catch (err) {
    console.error("Lỗi khi điều tra phiếu xuất dùng nội bộ:", err);
  }

  // 4. BỘ LỌC ĐỐI SOÁT CHUẨN XÁC (Target Reconciliation Matching)
  // Chỉ giữ lại chứng từ giải thích đúng con số chênh lệch adjustment, tuyệt đối không gom các chứng từ ngược dấu
  const nonZeroSuspects = suspectDocuments.filter((doc) => Math.abs(doc.quantityDelta) > 0.000001);

  // 1. Tìm chứng từ khớp chính xác 100% với adjustment
  const exactMatch = nonZeroSuspects.find((doc) => Math.abs(doc.quantityDelta - adjustment) < 0.0001);

  let finalSuspects: SuspectDocument[] = [];
  if (exactMatch) {
    // Nếu có chứng từ khớp chính xác 100%, chỉ lấy đúng chứng từ đó làm nguyên nhân trực tiếp!
    finalSuspects = [exactMatch];
  } else {
    // 2. Tìm tập hợp chứng từ cùng dấu với adjustment
    const sameSignSuspects = nonZeroSuspects.filter((doc) => Math.sign(doc.quantityDelta) === Math.sign(adjustment));
    const sameSignSum = sameSignSuspects.reduce((sum, d) => sum + d.quantityDelta, 0);

    if (sameSignSuspects.length > 0 && Math.abs(sameSignSum - adjustment) < 0.0001) {
      finalSuspects = sameSignSuspects;
    } else if (sameSignSuspects.length > 0) {
      finalSuspects = sameSignSuspects;
    } else {
      finalSuspects = [];
    }
  }

  const totalSuspectDelta = finalSuspects.reduce((sum, doc) => sum + doc.quantityDelta, 0);
  const isExact = Math.abs(totalSuspectDelta - adjustment) < 0.0001 && finalSuspects.length > 0;
  let found = isExact || (finalSuspects.length > 0 && Math.sign(totalSuspectDelta) === Math.sign(adjustment));

  let summary = "";
  if (found) {
    if (isExact) {
      if (finalSuspects.length === 1) {
        const doc = finalSuspects[0];
        if (doc.documentType === "INTERNAL_USE") {
          summary = `Đã tìm thấy nguyên nhân chính xác 100%: Phát sinh từ phiếu xuất dùng nội bộ ${doc.code} (${doc.operatorName || "Xuất dùng nội bộ"}) làm ảnh hưởng tồn ${totalSuspectDelta > 0 ? "+" : ""}${totalSuspectDelta}.`;
        } else if (doc.action === "BACKDATED") {
          summary = `Đã tìm thấy nguyên nhân chính xác 100%: Phát sinh từ chứng từ lập lùi ngày ${doc.code} (tạo lúc ${formatDateTimeVN(doc.actionTime)} bởi ${doc.operatorName || "nhân viên"}) làm ảnh hưởng tồn ${totalSuspectDelta > 0 ? "+" : ""}${totalSuspectDelta}.`;
        } else if (doc.action === "MODIFIED") {
          if (doc.originalDate && new Date(doc.originalDate).getTime() < operationalStart.getTime()) {
            summary = `Đã tìm thấy nguyên nhân chính xác 100%: Bù trừ từ hóa đơn ngày cũ ${doc.code} (ngày ${formatDateTimeVN(doc.originalDate)}) được sửa trong ca này (bởi ${doc.operatorName || "nhân viên"}) hoàn lại tồn kho ${totalSuspectDelta > 0 ? "+" : ""}${totalSuspectDelta}.`;
          } else {
            summary = `Đã tìm thấy nguyên nhân chính xác 100%: Phát sinh từ hóa đơn ${doc.code} được chỉnh sửa sau khi đã chốt ca (bởi ${doc.operatorName || "nhân viên"}) làm ảnh hưởng tồn ${totalSuspectDelta > 0 ? "+" : ""}${totalSuspectDelta}.`;
          }
        } else {
          summary = `Đã tìm thấy nguyên nhân chính xác 100%: Phát sinh từ chứng từ ${doc.code} bị hủy trên KiotViet làm ảnh hưởng tồn ${totalSuspectDelta > 0 ? "+" : ""}${totalSuspectDelta}.`;
        }
      } else {
        summary = `Đã tìm thấy nguyên nhân chính xác 100%: Phát sinh từ ${finalSuspects.length} chứng từ can thiệp trên KiotViet làm ảnh hưởng tồn ${totalSuspectDelta > 0 ? "+" : ""}${totalSuspectDelta}.`;
      }
    } else {
      summary = `Đã phát hiện ${finalSuspects.length} chứng từ can thiệp tác động ${totalSuspectDelta > 0 ? "+" : ""}${totalSuspectDelta} vào số tồn kho.`;
    }
  } else {
    // 4b. Kiểm tra lệch giao thời do mốc chốt snapshot (Timing Cut-off)
    if (Math.abs(adjustment) > 0.000001) {
      const [year, month, day] = dateStr.split("-").map(Number);
      const prevDateStr = new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
      const nextDateStr = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
      const prevCutoff = operationalDayStart(dateStr); // 18:00 VN ngày hôm trước
      const currCutoff = operationalDayEnd(dateStr);   // 18:00 VN ngày hôm nay

      // Tìm các chứng từ xuất/nhập phát sinh gần mốc 18:00 (trong khoảng +- 2 giờ)
      const boundaryMovements = await prisma.inventoryMovement.findMany({
        where: {
          productId,
          branchId,
          isActive: true,
          OR: [
            {
              occurredAt: {
                gte: new Date(prevCutoff.getTime() - 2 * 60 * 60 * 1000),
                lte: new Date(prevCutoff.getTime() + 2 * 60 * 60 * 1000)
              }
            },
            {
              occurredAt: {
                gte: new Date(currCutoff.getTime() - 2 * 60 * 60 * 1000),
                lte: new Date(currCutoff.getTime() + 2 * 60 * 60 * 1000)
              }
            }
          ]
        },
        orderBy: { occurredAt: "asc" }
      });

      for (const move of boundaryMovements) {
        const moveDelta = Number(move.quantityDelta);
        if (Math.abs(Math.abs(moveDelta) - Math.abs(adjustment)) < 0.001) {
          const isNearPrev = Math.abs(move.occurredAt.getTime() - prevCutoff.getTime()) <= Math.abs(move.occurredAt.getTime() - currCutoff.getTime());
          const targetCutoff = isNearPrev ? prevCutoff : currCutoff;
          const targetDateLabel = isNearPrev ? prevDateStr : dateStr;
          const otherDateLabel = isNearPrev ? dateStr : nextDateStr;

          // Tìm snapshot cuối cùng trước targetCutoff
          const lastSnapshotBeforeCutoff = await prisma.inventorySnapshot.findFirst({
            where: {
              productId,
              branchId,
              createdAt: {
                gte: new Date(targetCutoff.getTime() - 3 * 60 * 60 * 1000),
                lte: new Date(targetCutoff.getTime() + 1 * 60 * 60 * 1000)
              }
            },
            orderBy: { createdAt: "desc" }
          });

          if (lastSnapshotBeforeCutoff) {
            const snapshotTime = lastSnapshotBeforeCutoff.createdAt;
            if (move.occurredAt.getTime() > snapshotTime.getTime() && move.occurredAt.getTime() <= targetCutoff.getTime()) {
              let url: string | undefined;
              if (move.documentCode?.startsWith("PN")) {
                url = kiotVietPurchaseOrderUrl(move.documentCode);
              } else if (move.documentCode?.startsWith("HD")) {
                url = kiotVietInvoiceUrl(move.documentCode);
              }

              finalSuspects.push({
                documentType: move.sourceType === "PURCHASE" ? "PURCHASE_ORDER" : "INVOICE",
                code: move.documentCode || "Chứng từ",
                action: "CREATED",
                actionTime: move.occurredAt.toISOString(),
                branchName: branch?.name,
                quantityDelta: moveDelta,
                note: `Lệch mốc chốt snapshot: Chứng từ tạo lúc ${formatDateTimeVN(move.occurredAt)}, nhưng đợt chụp snapshot cuối cùng ngày ${targetDateLabel} lại chạy lúc ${formatDateTimeVN(snapshotTime)} (trước khi chứng từ phát sinh). Do đó tồn kho ngày ${targetDateLabel} chưa kịp ghi nhận số lượng này, tạo nên mức lệch bù trừ giữa ngày ${targetDateLabel} và ngày ${otherDateLabel}.`,
                kiotVietUrl: url
              });

              found = true;
              summary = `Đã tìm thấy nguyên nhân chính xác: Lệch giao thời do mốc chụp snapshot (Timing Cut-off). Chứng từ ${move.documentCode || ""} (${moveDelta > 0 ? "+" : ""}${moveDelta}) được tạo lúc ${formatDateTimeVN(move.occurredAt)}, nhưng đợt snapshot cuối cùng ngày ${targetDateLabel} lại chạy lúc ${formatDateTimeVN(snapshotTime)} (trước khi chứng từ phát sinh). Do đó ngày ${targetDateLabel} và ngày ${otherDateLabel} bị lệch bù trừ nhau (${adjustment > 0 ? "+" : ""}${adjustment}). Tồn kho thực tế hoàn toàn khớp và không bị thất thoát.`;
              break;
            }
          }
        }
      }
    }

    if (!found) {
      summary = `Chưa tìm thấy chứng từ hủy/sửa trực tiếp giải thích mức lệch ${adjustment > 0 ? "+" : ""}${adjustment}.`;
    }
  }

  // 5. Nếu có bước nhảy snapshot, phân tích các giao dịch phát sinh trong cùng khung giờ để giải thích rõ nét
  if (snapshotJump) {
    const windowStart = new Date(snapshotJump.beforeTime);
    const windowEnd = new Date(snapshotJump.afterTime);

    const windowMovements = await prisma.inventoryMovement.findMany({
      where: {
        productId,
        branchId,
        isActive: true,
        occurredAt: { gte: windowStart, lte: windowEnd }
      }
    });

    // Gom nhóm giao dịch xuất/nhập hợp lệ trong khung giờ
    const movementSummaryMap = new Map<string, number>();
    for (const m of windowMovements) {
      const code = m.documentCode || (m.sourceType === "SALE" ? "Bán hàng" : m.sourceType);
      movementSummaryMap.set(code, (movementSummaryMap.get(code) || 0) + Number(m.quantityDelta));
    }

    const movementParts: string[] = [];
    for (const [code, delta] of movementSummaryMap.entries()) {
      if (Math.abs(delta) > 0.000001) {
        movementParts.push(`${code} (${delta > 0 ? "+" : ""}${delta})`);
      }
    }

    if (Math.abs(snapshotJump.delta - adjustment) > 0.0001) {
      const parts: string[] = [];
      const suspectsInWindow = finalSuspects.filter((d: SuspectDocument) => {
        if (!d.actionTime) return false;
        const t = new Date(d.actionTime).getTime();
        return t >= windowStart.getTime() - 5 * 60 * 1000 && t <= windowEnd.getTime() + 5 * 60 * 1000;
      });

      if (suspectsInWindow.length > 0) {
        const suspectDesc = suspectsInWindow
          .map((s: SuspectDocument) => `${s.action === "CANCELLED" ? "hủy" : "sửa"} ${s.code} (${s.quantityDelta > 0 ? "+" : ""}${s.quantityDelta})`)
          .join(", ");
        parts.push(`hoàn tồn từ ${suspectDesc}`);
      } else {
        parts.push(`hoàn tồn từ chứng từ can thiệp (${adjustment > 0 ? "+" : ""}${adjustment})`);
      }

      if (movementParts.length > 0) {
        parts.push(`phát sinh giao dịch trong khung giờ: ${movementParts.join(", ")}`);
      }

      snapshotJump.explanation = `Trong khung giờ này có ${parts.join(" kết hợp cùng ")}, tạo nên mức biến động tồn ròng ${snapshotJump.delta > 0 ? "+" : ""}${snapshotJump.delta} trên thẻ kho giữa 2 lần snapshot. Còn mức lệch cả ca ${adjustment > 0 ? "+" : ""}${adjustment} là do chứng từ hủy hoàn tồn (các đơn xuất bán thông thường đã được đối trừ ở cột Xuất kho).`;
    }
  }

  const result: InvestigationResult = {
    found,
    summary,
    suspectDocuments: finalSuspects,
    snapshotJump,
    productName: product.name,
    productCode: product.code || "",
    adjustment
  };

  // Lưu kết quả vào Cache (AppSetting) để các lần truy xuất sau hiển thị tức thì
  if (found) {
    try {
      await prisma.appSetting.upsert({
        where: { key: cacheKey },
        create: { key: cacheKey, value: JSON.stringify(result) },
        update: { value: JSON.stringify(result) }
      });
    } catch (err) {
      console.error("Lỗi khi ghi cache điều tra:", err);
    }
  }

  return result;
}
