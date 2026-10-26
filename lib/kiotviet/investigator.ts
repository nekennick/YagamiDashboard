import { prisma } from "@/lib/prisma";
import { fetchKiotVietPage } from "@/lib/kiotviet/client";
import { kiotVietInvoiceUrl, kiotVietPurchaseOrderUrl, kiotVietStocktakeUrl } from "@/lib/kiotviet/links";
import { operationalDayEnd, operationalDayStart } from "@/lib/inventory-ledger";

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
  action: "CANCELLED" | "MODIFIED" | "CREATED";
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

export async function investigateDiscrepancy({
  productId,
  branchId,
  operationalDate,
  adjustment
}: {
  productId: number;
  branchId: number;
  operationalDate?: string;
  adjustment: number;
}): Promise<InvestigationResult> {
  const [product, branch] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId } }),
    prisma.branch.findUnique({ where: { id: branchId } })
  ]);

  if (!product) {
    throw new Error(`Không tìm thấy sản phẩm có ID: ${productId}`);
  }

  const dateStr = operationalDate || new Date().toISOString().slice(0, 10);
  const operationalStart = operationalDayStart(dateStr);
  const operationalEnd = operationalDayEnd(dateStr);

  // 1. Phân tích snapshot trong cơ sở dữ liệu để tìm khung giờ có bước nhảy tồn kho
  const snapshots = await prisma.inventorySnapshot.findMany({
    where: {
      productId,
      branchId,
      createdAt: { gte: operationalStart, lte: operationalEnd }
    },
    orderBy: { createdAt: "asc" }
  });

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
              beforeTime: before.createdAt.toISOString(),
              beforeOnHand: Number(before.onHand),
              afterTime: after.createdAt.toISOString(),
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

  // 3. Quét KiotViet Public API cho hóa đơn bị sửa/hủy bằng lastModifiedFrom
  try {
    const modifiedInvoicesRes = await fetchKiotVietPage(
      `/invoices?lastModifiedFrom=${encodeURIComponent(operationalStart.toISOString())}&pageSize=100`
    );
    const invoices = (modifiedInvoicesRes.records as RawInvoice[]) || [];

    // Nhóm các hóa đơn theo mã gốc (ví dụ HD049131 và HD049131.01)
    const invoicesByBaseCode = new Map<string, RawInvoice[]>();
    for (const inv of invoices) {
      if (!inv.code) continue;
      const baseCode = inv.code.replace(/\.\d+$/, "");
      const list = invoicesByBaseCode.get(baseCode) || [];
      list.push(inv);
      invoicesByBaseCode.set(baseCode, list);
    }

    // Duyệt qua các nhóm hóa đơn để so khớp biến động của sản phẩm
    for (const [baseCode, group] of invoicesByBaseCode.entries()) {
      // Tìm xem sản phẩm có xuất hiện trong nhóm này không
      const hasProduct = group.some((inv) =>
        (inv.invoiceDetails || []).some(
          (d) => d.productCode === product.code || d.productId === Number(product.kvProductId)
        )
      );
      if (!hasProduct) continue;

      const cancelledInvs = group.filter((inv) => inv.status === 2 || inv.statusValue === "Đã hủy");
      const activeInvs = group.filter((inv) => inv.status !== 2 && inv.statusValue !== "Đã hủy");

      // Trường hợp 1: Có đơn hủy và có đơn thay thế (.01)
      if (cancelledInvs.length > 0 && activeInvs.length > 0) {
        const cancelled = cancelledInvs[0];
        const active = activeInvs[0];

        const oldDetail = (cancelled.invoiceDetails || []).find(
          (d) => d.productCode === product.code || d.productId === Number(product.kvProductId)
        );
        const newDetail = (active.invoiceDetails || []).find(
          (d) => d.productCode === product.code || d.productId === Number(product.kvProductId)
        );

        const oldQty = oldDetail?.quantity ?? 0;
        const newQty = newDetail?.quantity ?? 0;
        const diff = newQty - oldQty;

        // Nếu số lượng thay đổi hoặc món bị xóa khỏi đơn
        if (Math.abs(diff) > 0.000001) {
          const delta = -diff; // Xuất ít đi -> kho tăng (+), xuất nhiều lên -> kho giảm (-)
          suspectDocuments.push({
            documentType: "INVOICE",
            code: cancelled.code || baseCode,
            action: "MODIFIED",
            actionTime: cancelled.modifiedDate || active.createdDate || "",
            operatorName: cancelled.soldByName || active.soldByName,
            partnerName: active.customerName || cancelled.customerName,
            originalDate: cancelled.purchaseDate,
            branchName: active.branchName || cancelled.branchName,
            quantityBefore: oldQty,
            quantityAfter: newQty,
            quantityDelta: delta,
            replacementCode: active.code,
            note: `Hóa đơn được chỉnh sửa từ ${oldQty} thành ${newQty} (thay thế bởi ${active.code}), ảnh hưởng tồn ${delta > 0 ? "+" : ""}${delta}`,
            kiotVietUrl: kiotVietInvoiceUrl(active.code || baseCode)
          });
        }
      } else if (cancelledInvs.length > 0 && activeInvs.length === 0) {
        // Trường hợp 2: Đơn bị hủy hoàn toàn tại chi nhánh này (ví dụ HD048854)
        for (const cancelled of cancelledInvs) {
          const detail = (cancelled.invoiceDetails || []).find(
            (d) => d.productCode === product.code || d.productId === Number(product.kvProductId)
          );
          if (!detail || !detail.quantity) continue;

          // Kiểm tra xem đơn này có thuộc chi nhánh đang kiểm tra không
          const isTargetBranch = kvBranchId === null || cancelled.branchId === kvBranchId;
          if (!isTargetBranch) continue;

          // Tìm xem có đơn nào khác thay thế (ví dụ chuyển sang chi nhánh khác hoặc lùi ngày)
          const potentialReplacement = invoices.find(
            (inv) =>
              inv.code !== cancelled.code &&
              inv.status !== 2 &&
              inv.customerCode === cancelled.customerCode &&
              (inv.invoiceDetails || []).some(
                (d) =>
                  (d.productCode === product.code || d.productId === Number(product.kvProductId)) &&
                  d.quantity === detail.quantity
              )
          );

          const delta = detail.quantity; // Hủy đơn bán hàng -> cộng hoàn kho (+)
          suspectDocuments.push({
            documentType: "INVOICE",
            code: cancelled.code || baseCode,
            action: "CANCELLED",
            actionTime: cancelled.modifiedDate || "",
            operatorName: cancelled.soldByName,
            partnerName: cancelled.customerName,
            originalDate: cancelled.purchaseDate,
            branchName: cancelled.branchName,
            quantityBefore: detail.quantity,
            quantityAfter: 0,
            quantityDelta: delta,
            replacementCode: potentialReplacement?.code,
            note: potentialReplacement
              ? `Hóa đơn cũ tại ${cancelled.branchName} bị hủy làm hoàn kho +${delta}. Đơn thay thế ${potentialReplacement.code} được xuất tại ${potentialReplacement.branchName}.`
              : `Hóa đơn cũ (ngày ${cancelled.purchaseDate?.slice(0, 10)}) bị hủy làm hoàn lại tồn kho +${delta}.`,
            kiotVietUrl: kiotVietInvoiceUrl(cancelled.code || baseCode)
          });
        }
      }
    }
  } catch (err) {
    console.error("Lỗi khi quét KiotViet API để điều tra hóa đơn:", err);
  }

  // 3b. Quét KiotViet Public API cho phiếu nhập hàng (Purchase Orders) bị hủy / sửa
  try {
    const modifiedPOsRes = await fetchKiotVietPage(
      `/purchaseorders?lastModifiedFrom=${encodeURIComponent(operationalStart.toISOString())}&pageSize=100`
    );
    const purchaseOrders = (modifiedPOsRes.records as RawPurchaseOrder[]) || [];

    for (const po of purchaseOrders) {
      if (kvBranchId !== null && po.branchId && po.branchId !== kvBranchId) {
        continue;
      }

      // KiotViet PurchaseOrder: status = 4 là ĐÃ HỦY (Cancelled)
      if (po.status === 4 || po.statusValue === "Đã hủy") {
        const detail = (po.purchaseOrderDetails || []).find(
          (d: RawPurchaseOrderDetail) => d.productCode === product.code || d.productId === Number(product.kvProductId)
        );
        if (!detail || !detail.quantity) continue;

        const delta = -detail.quantity; // Hủy phiếu nhập hàng -> TRỪ LẠI KHO (-)
        suspectDocuments.push({
          documentType: "PURCHASE_ORDER",
          code: po.code || "PN_UNKNOWN",
          action: "CANCELLED",
          actionTime: po.modifiedDate || po.createdDate || "",
          operatorName: po.purchaseName,
          originalDate: po.purchaseDate,
          branchName: po.branchName || branch?.name,
          quantityBefore: detail.quantity,
          quantityAfter: 0,
          quantityDelta: delta,
          note: `Phiếu nhập hàng cũ (ngày ${po.purchaseDate?.slice(0, 10) || "trước"}) bị hủy trên KiotViet làm giảm trừ tồn kho ${delta}.`,
          kiotVietUrl: po.code ? kiotVietPurchaseOrderUrl(po.code) : undefined
        });
      }
    }
  } catch (err) {
    console.error("Lỗi khi quét KiotViet API để điều tra phiếu nhập:", err);
  }

  // 4. Tổng kết nguyên nhân (chỉ giữ lại chứng từ thực sự gây biến động số tồn)
  const validSuspects = suspectDocuments.filter((doc) => Math.abs(doc.quantityDelta) > 0.000001);
  const totalSuspectDelta = validSuspects.reduce((sum, doc) => sum + doc.quantityDelta, 0);
  let found = validSuspects.length > 0;

  let summary = "";
  if (found) {
    if (Math.abs(totalSuspectDelta - adjustment) < 0.0001) {
      if (validSuspects.length === 1) {
        summary = `Đã tìm thấy nguyên nhân chính xác 100%: Phát sinh từ chứng từ ${validSuspects[0].code} bị hủy/sửa trên KiotViet làm ảnh hưởng tồn ${totalSuspectDelta > 0 ? "+" : ""}${totalSuspectDelta}.`;
      } else {
        summary = `Đã tìm thấy nguyên nhân chính xác 100%: Phát sinh từ ${validSuspects.length} chứng từ bị hủy/sửa trên KiotViet làm ảnh hưởng tồn ${totalSuspectDelta > 0 ? "+" : ""}${totalSuspectDelta}.`;
      }
    } else {
      summary = `Đã phát hiện ${validSuspects.length} chứng từ bị hủy/sửa tác động ${totalSuspectDelta > 0 ? "+" : ""}${totalSuspectDelta} vào số tồn kho.`;
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

              validSuspects.push({
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
      const suspectsInWindow = validSuspects.filter((d) => {
        if (!d.actionTime) return false;
        const t = new Date(d.actionTime).getTime();
        return t >= windowStart.getTime() - 5 * 60 * 1000 && t <= windowEnd.getTime() + 5 * 60 * 1000;
      });

      if (suspectsInWindow.length > 0) {
        const suspectDesc = suspectsInWindow
          .map((s) => `${s.action === "CANCELLED" ? "hủy" : "sửa"} ${s.code} (${s.quantityDelta > 0 ? "+" : ""}${s.quantityDelta})`)
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

  return {
    found,
    summary,
    suspectDocuments: validSuspects,
    snapshotJump,
    productName: product.name,
    productCode: product.code || "",
    adjustment
  };
}
