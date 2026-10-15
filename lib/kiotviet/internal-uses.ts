import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { parseKiotVietDate } from "@/lib/kiotviet/datetime";

type ObjectRecord = Record<string, unknown>;
type InternalSession = { baseUrl: string; headers: Record<string, string> };

const pageSize = 100;
const allowedHeaderNames = new Set(["accept", "authorization", "branchid", "content-type", "fingerprintkey", "isusekvclient", "origin", "referer", "retailer", "x-group-id", "x-language", "x-retailer-code"]);

export type InternalUseSyncStats = { totalRecords: number; savedRecords: number; warnings?: string[] };

export async function syncInternalUses(fromDate: Date): Promise<InternalUseSyncStats> {
  const session = await loadInternalSession();
  const documents = await fetchInternalUseDocuments(session);
  const selected = documents.filter((document) => {
    const sourceDate = date(document.ModifiedDate) ?? date(document.TransDate) ?? date(document.CreatedDate);
    return sourceDate instanceof Date && sourceDate >= fromDate;
  });
  const [products, branches] = await Promise.all([
    prisma.product.findMany({ select: { id: true, kvProductId: true, code: true } }),
    prisma.branch.findMany({ select: { id: true, kvBranchId: true } })
  ]);
  const productByKvId = new Map(products.map((product) => [product.kvProductId, product.id]));
  const productByCode = new Map(products.filter((product) => product.code).map((product) => [product.code!.toLocaleUpperCase("vi"), product.id]));
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
    const details = await fetchInternalUseDetails(session, documentId);
    await prisma.$transaction(async (transaction) => {
      await transaction.inventoryMovement.updateMany({ where: { sourceType: "INTERNAL_USE", sourceDocumentId }, data: { isActive: false } });
      for (const [index, detail] of details.entries()) {
        const productCode = text(detail.ProductCode) ?? nestedText(detail.Product, "Code");
        const productId = productByKvId.get(integer(detail.ProductId)) ?? (productCode ? productByCode.get(productCode.toLocaleUpperCase("vi")) : undefined);
        if (!productId) {
          unresolvedLines += 1;
          continue;
        }
        const lineId = integer(detail.Id) || index + 1;
        const quantity = decimal(detail.Quantity);
        if (!quantity) continue;
        const movementKey = `INTERNAL_USE:${sourceDocumentId}:${lineId}:${branchId}`;
        const movement = {
          sourceType: "INTERNAL_USE",
          sourceDocumentId,
          sourceLineKey: String(lineId),
          documentCode: code,
          occurredAt,
          productId,
          branchId,
          quantityDelta: -Math.abs(quantity),
          status: String(status),
          partnerName: text(source.Description) ?? "Xuất dùng nội bộ",
          isActive: isCompletedInternalUseStatus(status),
          rawJson: JSON.stringify(detail)
        };
        await transaction.inventoryMovement.upsert({ where: { movementKey }, create: { movementKey, ...movement }, update: movement });
        savedRecords += 1;
      }
    });
  }
  return {
    totalRecords: selected.length,
    savedRecords,
    warnings: unresolvedLines ? [`Có ${unresolvedLines} dòng xuất dùng nội bộ chưa nối được với sản phẩm Dashboard.`] : undefined
  };
}

export function isCompletedInternalUseStatus(status: number | null) {
  return status === 2;
}

async function loadInternalSession(): Promise<InternalSession> {
  const path = process.env.KIOTVIET_INTERNAL_REQUEST_FILE ?? "/run/secrets/kiotviet_internal_requests";
  const raw = await readFile(path, "utf8");
  const cleaned = raw.replace(/\^\r?\n/g, " ").replace(/\^/g, "");
  const block = cleaned.split(/(?:^|\r?\n)\s*curl\s+/i).find((item) => item.includes("/api/stocktakes/list"));
  const source = block ?? cleaned;
  const urlMatch = source.match(/"(https:\/\/[^"\s]+)\/api\/stocktakes\/list"/i);
  if (!urlMatch) throw new Error("Không đọc được phiên quản trị KiotViet để đồng bộ xuất dùng nội bộ.");
  const url = new URL(urlMatch[1]);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".kiotviet.vn")) throw new Error("Host API nội bộ KiotViet không hợp lệ.");
  const headers: Record<string, string> = {};
  for (const match of source.matchAll(/-H\s+"([^:"]+):\s*([^"]*)"/gi)) {
    const name = match[1].trim().toLowerCase();
    if (allowedHeaderNames.has(name)) headers[name] = match[2].trim();
  }
  if (!headers.authorization) throw new Error("Phiên quản trị KiotViet thiếu Authorization.");
  return { baseUrl: url.origin, headers };
}

async function fetchInternalUseDocuments(session: InternalSession) {
  const rows: ObjectRecord[] = [];
  let skip = 0;
  while (true) {
    const response = await internalJson(session, "/api/internaluses/list", {
      method: "POST",
      body: JSON.stringify({ format: "json", Includes: ["Branch"], CodeKey: "", $inlinecount: "allpages", $format: "json", $filter: "", $top: pageSize, $skip: skip })
    });
    const page = records(response);
    rows.push(...page);
    const total = integer(asObject(response).Total) || rows.length;
    if (page.length < pageSize || rows.length >= total) break;
    skip += page.length;
  }
  return rows;
}

async function fetchInternalUseDetails(session: InternalSession, documentId: number) {
  const response = await internalJson(session, `/api/internaluses/${documentId}/details?format=json&Includes=Product&isFilter=true&$inlinecount=allpages&$top=${pageSize}&$skip=0`);
  return records(response);
}

async function internalJson(session: InternalSession, path: string, init: RequestInit = {}) {
  const response = await fetch(`${session.baseUrl}${path}`, { ...init, headers: { ...session.headers, ...(init.headers ?? {}), "content-type": "application/json" }, cache: "no-store", redirect: "manual" });
  const contentType = response.headers.get("content-type") ?? "";
  if ([301, 302, 303, 307, 308, 401, 403].includes(response.status) || contentType.includes("text/html")) throw new Error("Phiên đăng nhập KiotViet đã hết hạn hoặc không có quyền đọc xuất dùng nội bộ.");
  if (!response.ok) throw new Error(`API xuất dùng nội bộ KiotViet trả lỗi ${response.status}.`);
  return response.json();
}

function records(value: unknown) { const object = asObject(value); const candidate = object.Data ?? object.data ?? object.Items ?? object.items; return Array.isArray(candidate) ? candidate.map(asObject) : []; }
function asObject(value: unknown): ObjectRecord { return value && typeof value === "object" ? value as ObjectRecord : {}; }
function integer(value: unknown) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : 0; }
function decimal(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function nestedText(value: unknown, key: string) { return text(asObject(value)[key]); }
function date(value: unknown) { return parseKiotVietDate(value); }
