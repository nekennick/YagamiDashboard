import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";

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

export type StocktakeSyncStats = {
  totalRecords: number;
  savedRecords: number;
  warnings?: string[];
};

export function parseInternalStocktakeRequestSecret(raw: string): InternalSession {
  const cleaned = raw.replace(/\^\r?\n/g, " ").replace(/\^/g, "");
  const listBlock = cleaned.split(/(?:^|\r?\n)\s*curl\s+/i).find((block) => block.includes("/api/stocktakes/list"));
  if (!listBlock) throw new Error("Secret KiotViet không chứa request stocktakes/list.");

  const urlMatch = listBlock.match(/"(https:\/\/[^"\s]+\/api\/stocktakes\/list)"/i);
  if (!urlMatch) throw new Error("Không đọc được URL stocktakes/list từ secret KiotViet.");
  const url = new URL(urlMatch[1]);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".kiotviet.vn")) {
    throw new Error("Host API nội bộ KiotViet không hợp lệ.");
  }

  const headers: Record<string, string> = {};
  for (const match of listBlock.matchAll(/-H\s+"([^:"]+):\s*([^"]*)"/gi)) {
    const name = match[1].trim().toLowerCase();
    if (allowedHeaderNames.has(name)) headers[name] = match[2].trim();
  }
  if (!headers.authorization) throw new Error("Secret KiotViet thiếu Authorization của phiên quản trị.");

  return { baseUrl: url.origin, headers };
}

export async function syncInternalStocktakes(fromDate: Date): Promise<StocktakeSyncStats> {
  const session = await loadInternalSession();
  const documents = await fetchStocktakeDocuments(session);
  const selected = documents.filter((document) => {
    const sourceDate = date(document.ModifiedDate) ?? date(document.AdjustmentDate) ?? date(document.CreatedDate);
    return sourceDate !== null && sourceDate >= fromDate;
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
    const kvStocktakeId = integer(source.Id);
    const code = text(source.Code);
    const kvBranchId = integer(source.BranchId);
    if (!kvStocktakeId || !code || !kvBranchId) continue;

    const details = await fetchStocktakeDetails(session, kvStocktakeId);
    const adjustmentDate = date(source.AdjustmentDate);
    const status = integer(source.Status);
    const branchId = branchByKvId.get(kvBranchId) ?? null;
    const document = await prisma.stocktakeDocument.upsert({
      where: { kvStocktakeId },
      create: {
        kvStocktakeId,
        code,
        kvBranchId,
        branchId,
        status,
        adjustmentDate,
        sourceCreatedAt: date(source.CreatedDate),
        sourceModifiedAt: date(source.ModifiedDate),
        createdByName: nestedText(source.UserCreate, "Name") ?? nestedText(source.User, "Name"),
        description: text(source.Description),
        rawJson: JSON.stringify(source)
      },
      update: {
        code,
        kvBranchId,
        branchId,
        status,
        adjustmentDate,
        sourceCreatedAt: date(source.CreatedDate),
        sourceModifiedAt: date(source.ModifiedDate),
        createdByName: nestedText(source.UserCreate, "Name") ?? nestedText(source.User, "Name"),
        description: text(source.Description),
        rawJson: JSON.stringify(source),
        lastSyncedAt: new Date()
      }
    });

    await prisma.$transaction(async (transaction) => {
      await transaction.stocktakeLine.updateMany({ where: { stocktakeDocumentId: document.id }, data: { isActive: false } });
      await transaction.inventoryMovement.updateMany({ where: { sourceType: "STOCKTAKE", sourceDocumentId: String(kvStocktakeId) }, data: { isActive: false } });

      for (const detail of details) {
        const kvDetailId = integer(detail.Id);
        const kvProductId = integer(detail.ProductId);
        if (!kvDetailId || !kvProductId) continue;
        const productCode = text(detail.ProductCode);
        const productId = productByKvId.get(kvProductId) ?? (productCode ? productByCode.get(productCode.toLocaleUpperCase("vi")) : undefined) ?? null;
        const adjustmentValue = decimal(detail.AdjustmentValue);
        if (!productId) unresolvedLines += 1;

        await transaction.stocktakeLine.upsert({
          where: { kvStocktakeDetailId: kvDetailId },
          create: {
            kvStocktakeDetailId: kvDetailId,
            stocktakeDocumentId: document.id,
            kvProductId,
            productId,
            productCode,
            productName: text(detail.ProductName) ?? text(detail.ProductSName),
            systemCount: decimal(detail.SystemCount),
            actualCount: decimal(detail.ActualCount),
            adjustmentValue,
            isActive: true,
            rawJson: JSON.stringify(detail)
          },
          update: {
            stocktakeDocumentId: document.id,
            kvProductId,
            productId,
            productCode,
            productName: text(detail.ProductName) ?? text(detail.ProductSName),
            systemCount: decimal(detail.SystemCount),
            actualCount: decimal(detail.ActualCount),
            adjustmentValue,
            isActive: true,
            rawJson: JSON.stringify(detail)
          }
        });

        if (branchId && productId && adjustmentDate && isBalancedStocktakeStatus(status) && adjustmentValue !== 0) {
          const movementKey = `STOCKTAKE:${kvStocktakeId}:${kvDetailId}:${branchId}`;
          const movement = {
            sourceType: "STOCKTAKE",
            sourceDocumentId: String(kvStocktakeId),
            sourceLineKey: String(kvDetailId),
            documentCode: code,
            occurredAt: adjustmentDate,
            productId,
            branchId,
            quantityDelta: adjustmentValue,
            status: String(status),
            partnerName: "Kiểm kê KiotViet",
            isActive: true,
            rawJson: JSON.stringify(detail)
          };
          await transaction.inventoryMovement.upsert({ where: { movementKey }, create: { movementKey, ...movement }, update: movement });
        }
        savedRecords += 1;
      }
    });
  }

  const warnings = unresolvedLines > 0 ? [`Có ${unresolvedLines} dòng kiểm kho chưa nối được với sản phẩm Dashboard.`] : undefined;
  return { totalRecords: selected.length, savedRecords, warnings };
}

export function isBalancedStocktakeStatus(status: number | null) {
  // Status 1 is the completed/balanced stocktake. Status 2 is a temporary
  // document and must not affect the inventory ledger (status 0 is cancelled).
  return status === 1;
}

async function loadInternalSession() {
  const path = process.env.KIOTVIET_INTERNAL_REQUEST_FILE ?? "/run/secrets/kiotviet_internal_requests";
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new Error("Chưa cấu hình secret phiên quản trị KiotViet cho đồng bộ kiểm kho.");
  }
  return parseInternalStocktakeRequestSecret(raw);
}

async function fetchStocktakeDocuments(session: InternalSession) {
  const rows: ObjectRecord[] = [];
  let skip = 0;
  while (true) {
    const response = await internalJson(session, "/api/stocktakes/list", {
      method: "POST",
      body: JSON.stringify({
        format: "json",
        Includes: ["UserCreate", "Branch", "User"],
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

async function fetchStocktakeDetails(session: InternalSession, stocktakeId: number) {
  const rows: ObjectRecord[] = [];
  let skip = 0;
  while (true) {
    const query = new URLSearchParams({
      format: "json",
      Includes: "Product",
      isFilter: "true",
      "$inlinecount": "allpages",
      "$top": String(pageSize),
      "$skip": String(skip)
    });
    const response = await internalJson(session, `/api/stocktakes/${stocktakeId}/details?${query}`);
    const page = records(response);
    rows.push(...page);
    const total = integer(asObject(response).Total) || rows.length;
    if (page.length < pageSize || rows.length >= total) break;
    skip += page.length;
  }
  return rows;
}

async function internalJson(session: InternalSession, path: string, init: RequestInit = {}) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(`${session.baseUrl}${path}`, {
        ...init,
        headers: { ...session.headers, ...(init.headers ?? {}), "content-type": "application/json" },
        cache: "no-store",
        redirect: "manual",
        signal: controller.signal
      });
      const contentType = response.headers.get("content-type") ?? "";
      if ([301, 302, 303, 307, 308, 401, 403].includes(response.status) || contentType.includes("text/html")) {
        throw new Error("Phiên đăng nhập KiotViet đã hết hạn hoặc không còn quyền đọc phiếu kiểm kho.");
      }
      if (!response.ok) throw new Error(`API kiểm kho KiotViet trả lỗi ${response.status}.`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt === 2 || (error instanceof Error && error.message.includes("Phiên đăng nhập"))) throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

function records(value: unknown) {
  const object = asObject(value);
  const candidate = object.Data ?? object.data ?? object.Items ?? object.items;
  return Array.isArray(candidate) ? candidate.map(asObject) : [];
}
function asObject(value: unknown): ObjectRecord { return value && typeof value === "object" ? value as ObjectRecord : {}; }
function integer(value: unknown) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : 0; }
function decimal(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function nestedText(value: unknown, key: string) { return text(asObject(value)[key]); }
function date(value: unknown) { if (typeof value !== "string" || !value) return null; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? null : parsed; }
