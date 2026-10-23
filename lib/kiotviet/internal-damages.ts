import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { parseKiotVietDate } from "@/lib/kiotviet/datetime";

type ObjectRecord = Record<string, unknown>;
type InternalSession = { baseUrl: string; headers: Record<string, string> };

const pageSize = 100;
const allowedHeaderNames = new Set([
  "accept",
  "authorization",
  "branchid",
  "content-type",
  "fingerprintkey",
  "isusekvclient",
  "origin",
  "referer",
  "retailer",
  "x-group-id",
  "x-language",
  "x-retailer-code"
]);

export type DamagedGoodsSyncStats = {
  totalRecords: number;
  savedRecords: number;
  warnings?: string[];
};

export async function syncDamagedGoods(fromDate: Date): Promise<DamagedGoodsSyncStats> {
  const session = await loadInternalSession();
  const documents = await fetchDamagedGoodsDocuments(session);
  const selected = documents.filter((document) => {
    const sourceDate = date(document.ModifiedDate) ?? date(document.TransDate) ?? date(document.CreatedDate);
    return sourceDate instanceof Date && sourceDate >= fromDate;
  });

  const [products, branches] = await Promise.all([
    prisma.product.findMany({ select: { id: true, kvProductId: true, code: true } }),
    prisma.branch.findMany({ select: { id: true, kvBranchId: true } })
  ]);

  const productByKvId = new Map(products.map((product) => [product.kvProductId, product.id]));
  const productByCode = new Map(
    products.filter((product) => product.code).map((product) => [product.code!.toLocaleUpperCase("vi"), product.id])
  );
  const branchByKvId = new Map(branches.map((branch) => [branch.kvBranchId, branch.id]));

  let savedRecords = 0;
  let unresolvedLines = 0;

  for (const source of selected) {
    const documentId = integer(source.Id);
    const code = text(source.Code);
    const branchId = branchByKvId.get(integer(source.BranchId));
    const occurredAt = date(source.TransDate) ?? date(source.CreatedDate);
    if (!documentId || !code || !branchId || !occurredAt) continue;

    const sourceDocumentId = String(documentId);
    const status = integer(source.Status);
    const details = await fetchDamagedGoodsDetails(session, documentId);

    await prisma.$transaction(async (transaction) => {
      await transaction.inventoryMovement.updateMany({
        where: { sourceType: "DAMAGED_GOODS", sourceDocumentId },
        data: { isActive: false }
      });

      for (const [index, detail] of details.entries()) {
        const productCode = text(detail.ProductCode) ?? nestedText(detail.Product, "Code");
        const productId =
          productByKvId.get(integer(detail.ProductId)) ??
          (productCode ? productByCode.get(productCode.toLocaleUpperCase("vi")) : undefined);

        if (!productId) {
          unresolvedLines += 1;
          continue;
        }

        const lineId = integer(detail.Id) || index + 1;
        const quantity = decimal(detail.Quantity);
        if (!quantity) continue;

        const movementKey = `DAMAGED_GOODS:${sourceDocumentId}:${lineId}:${branchId}`;
        const description = text(source.Description);
        const movement = {
          sourceType: "DAMAGED_GOODS",
          sourceDocumentId,
          sourceLineKey: String(lineId),
          documentCode: code,
          occurredAt,
          productId,
          branchId,
          quantityDelta: -Math.abs(quantity),
          status: String(status),
          partnerName: description ? `Xuất hủy: ${description}` : "Xuất hủy",
          isActive: isCompletedDamagedGoodsStatus(status),
          rawJson: JSON.stringify(detail)
        };

        await transaction.inventoryMovement.upsert({
          where: { movementKey },
          create: { movementKey, ...movement },
          update: movement
        });
        savedRecords += 1;
      }
    });
  }

  return {
    totalRecords: selected.length,
    savedRecords,
    warnings: unresolvedLines ? [`Có ${unresolvedLines} dòng xuất hủy chưa nối được với sản phẩm Dashboard.`] : undefined
  };
}

export function isCompletedDamagedGoodsStatus(status: number | null) {
  return status === 2;
}

async function loadInternalSession(): Promise<InternalSession> {
  const path = process.env.KIOTVIET_INTERNAL_REQUEST_FILE ?? "/run/secrets/kiotviet_internal_requests";
  const raw = await readFile(path, "utf8");
  const cleaned = raw.replace(/\^\r?\n/g, " ").replace(/\^/g, "");
  const block = cleaned.split(/(?:^|\r?\n)\s*curl\s+/i).find((item) => item.includes("/api/stocktakes/list"));
  const source = block ?? cleaned;
  const urlMatch = source.match(/"(https:\/\/[^"\s]+)\/api\/stocktakes\/list"/i);
  if (!urlMatch) throw new Error("Không đọc được phiên quản trị KiotViet để đồng bộ xuất hủy.");
  const url = new URL(urlMatch[1]);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".kiotviet.vn")) {
    throw new Error("Host API nội bộ KiotViet không hợp lệ.");
  }
  const headers: Record<string, string> = {};
  for (const match of source.matchAll(/-H\s+"([^:"]+):\s*([^"]*)"/gi)) {
    const name = match[1].trim().toLowerCase();
    if (allowedHeaderNames.has(name)) headers[name] = match[2].trim();
  }
  if (!headers.authorization) throw new Error("Phiên quản trị KiotViet thiếu Authorization.");
  return { baseUrl: url.origin, headers };
}

async function fetchDamagedGoodsDocuments(session: InternalSession) {
  const rows: ObjectRecord[] = [];
  let skip = 0;
  while (true) {
    const response = await internalJson(session, "/api/damageitems/list", {
      method: "POST",
      body: JSON.stringify({
        format: "json",
        Includes: ["Branch", "User"],
        CodeKey: "",
        $inlinecount: "allpages",
        $format: "json",
        $filter: "",
        $top: pageSize,
        $skip: skip
      })
    });
    const page = records(response);
    rows.push(...page);
    const total = integer(asObject(response).Total) || rows.length;
    if (page.length < pageSize || rows.length >= total) break;
    skip += page.length;
  }
  return rows;
}

async function fetchDamagedGoodsDetails(session: InternalSession, documentId: number) {
  const response = await internalJson(
    session,
    `/api/damageitems/${documentId}/details?format=json&$inlinecount=allpages&$top=${pageSize}&$skip=0`
  );
  return records(response);
}

async function internalJson(session: InternalSession, path: string, init: RequestInit = {}) {
  const response = await fetch(`${session.baseUrl}${path}`, {
    ...init,
    headers: { ...session.headers, ...(init.headers ?? {}), "content-type": "application/json" },
    cache: "no-store",
    redirect: "manual"
  });
  const contentType = response.headers.get("content-type") ?? "";
  if ([301, 302, 303, 307, 308, 401, 403].includes(response.status) || contentType.includes("text/html")) {
    throw new Error("Phiên đăng nhập KiotViet đã hết hạn hoặc không có quyền đọc xuất hủy.");
  }
  if (!response.ok) throw new Error(`API xuất hủy KiotViet trả lỗi ${response.status}.`);
  return response.json();
}

function records(value: unknown) {
  const object = asObject(value);
  const candidate = object.Data ?? object.data ?? object.Items ?? object.items;
  return Array.isArray(candidate) ? candidate.map(asObject) : [];
}

function asObject(value: unknown): ObjectRecord {
  return value && typeof value === "object" ? (value as ObjectRecord) : {};
}

function integer(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function decimal(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nestedText(value: unknown, key: string) {
  return text(asObject(value)[key]);
}

function date(value: unknown) {
  return parseKiotVietDate(value);
}
