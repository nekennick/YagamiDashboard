import { prisma } from "@/lib/prisma";
import { fetchKiotVietList, fetchKiotVietPage, postToKiotViet } from "@/lib/kiotviet/client";

export type KiotVietPurchaseOrderDetailPayload = {
  productId: number;
  quantity: number;
  price: number;
  discount?: number;
  note?: string;
};

export type KiotVietPurchaseOrderPayload = {
  branchId: number;
  supplierId?: number;
  purchaseDate?: string;
  total?: number;
  discount?: number;
  description?: string;
  purchaseOrderDetails: KiotVietPurchaseOrderDetailPayload[];
};

export type KiotVietPurchaseOrderResponse = {
  id: number;
  code: string;
  branchId: number;
  branchName?: string;
  supplierId?: number;
  supplierName?: string;
  purchaseDate: string;
  total: number;
  status: number;
  details?: Array<{
    productId: number;
    productCode: string;
    productName: string;
    quantity: number;
    price: number;
  }>;
};

export type KiotVietSupplierRaw = {
  id: number;
  code?: string;
  name: string;
  phone?: string;
  address?: string;
  email?: string;
  isActive?: boolean;
};

/**
 * Tạo phiếu nhập hàng lên KiotViet API
 */
export async function createPurchaseOrderOnKiotViet(
  payload: KiotVietPurchaseOrderPayload
): Promise<KiotVietPurchaseOrderResponse> {
  const result = await postToKiotViet("/purchaseorders", payload);
  return result as KiotVietPurchaseOrderResponse;
}

/**
 * Lấy danh sách nhà cung cấp từ KiotViet
 */
export async function fetchKiotVietSuppliers(pageSize = 100): Promise<KiotVietSupplierRaw[]> {
  const records = await fetchKiotVietList("/suppliers", pageSize);
  return records as KiotVietSupplierRaw[];
}

/**
 * Đồng bộ danh bạ nhà cung cấp KiotViet về cơ sở dữ liệu local
 */
export async function syncSuppliersToLocal() {
  const suppliers = await fetchKiotVietSuppliers();
  let syncedCount = 0;

  for (const s of suppliers) {
    if (!s.id || !s.name) continue;

    await prisma.supplier.upsert({
      where: { kvSupplierId: s.id },
      create: {
        kvSupplierId: s.id,
        code: s.code || null,
        name: s.name,
        phone: s.phone || null,
        address: s.address || null,
        email: s.email || null,
        isActive: s.isActive !== false
      },
      update: {
        code: s.code || null,
        name: s.name,
        phone: s.phone || null,
        address: s.address || null,
        email: s.email || null,
        isActive: s.isActive !== false
      }
    });
    syncedCount++;
  }

  return { total: suppliers.length, synced: syncedCount };
}

/**
 * Lấy danh sách phiếu nhập hàng từ KiotViet
 */
export async function fetchKiotVietPurchaseOrders(params?: {
  branchIds?: number[];
  fromPurchaseDate?: string;
  toPurchaseDate?: string;
  pageSize?: number;
  currentItem?: number;
}) {
  const query = new URLSearchParams();
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  if (params?.currentItem) query.set("currentItem", String(params.currentItem));
  if (params?.fromPurchaseDate) query.set("fromPurchaseDate", params.fromPurchaseDate);
  if (params?.toPurchaseDate) query.set("toPurchaseDate", params.toPurchaseDate);
  if (params?.branchIds && params.branchIds.length > 0) {
    params.branchIds.forEach((id) => query.append("branchIds", String(id)));
  }

  const endpoint = `/purchaseorders${query.toString() ? `?${query.toString()}` : ""}`;
  return await fetchKiotVietPage(endpoint, params?.currentItem ?? 0, params?.pageSize ?? 20);
}
