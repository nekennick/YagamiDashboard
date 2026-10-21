import { readFile } from "node:fs/promises";

type JsonRecord = Record<string, unknown>;
type CurlTemplate = { url: string; headers: Record<string, string>; body: JsonRecord };
type WriteLine = { kvProductId: number; name: string; code: string | null; actualCount: number };
type RemoteStocktake = { id: number; code: string; uuid: string | null };

const createLabel = "CREATE_OR_SAVE_STOCKTAKE";
const balanceLabel = "BALANCE_STOCKTAKE";

export async function createRemoteStocktake(input: { kvBranchId: number; marker: string; lines: WriteLine[] }) {
  const template = await loadTemplate(createLabel);
  const existing = await findRemoteStocktake(template, input.marker);
  if (existing) return existing;
  const payload = buildPayload(template.body, input, false);
  const response = await requestJson(template, payload);
  return readRemoteStocktake(response);
}

async function findRemoteStocktake(template: CurlTemplate, marker: string): Promise<RemoteStocktake | null> {
  const url = new URL("/api/stocktakes/list", template.url);
  const escapedMarker = marker.replace(/'/g, "''");
  const response = await fetch(url, {
    method: "POST",
    headers: { ...template.headers, "content-type": "application/json" },
    body: JSON.stringify({ format: "json", "$top": 5, "$skip": 0, "$filter": `Description eq '${escapedMarker}'`, "$orderBy": "CreatedDate desc" }),
    cache: "no-store"
  });
  if ([401, 403].includes(response.status)) throw new Error("Phiên đăng nhập KiotViet đã hết hạn hoặc không có quyền kiểm kho.");
  if (!response.ok) return null;
  const data = await response.json() as JsonRecord;
  const rows = Array.isArray(data.Data) ? data.Data : Array.isArray(data.data) ? data.data : [];
  for (const row of rows) {
    if (!isRecord(row) || string(row.Description) !== marker) continue;
    const id = number(row.Id);
    const code = string(row.Code);
    if (id && code) return { id, code, uuid: string(row.Uuid) || null };
  }
  return null;
}

export async function balanceRemoteStocktake(input: { kvBranchId: number; marker: string; stocktake: RemoteStocktake; lines: WriteLine[] }) {
  const template = await loadTemplate(balanceLabel);
  const details = await getRemoteDetails(template, input.stocktake.id);
  const payload = buildPayload(template.body, input, true, details);
  const response = await requestJson(template, payload);
  return readRemoteStocktake(response);
}

async function getRemoteDetails(template: CurlTemplate, stocktakeId: number) {
  const url = new URL(`/api/stocktakes/${stocktakeId}/details`, template.url);
  url.searchParams.set("format", "json");
  url.searchParams.append("Includes", "Product");
  url.searchParams.set("isFilter", "true");
  const response = await fetch(url, { headers: withoutContentHeaders(template.headers), cache: "no-store" });
  if (!response.ok) throw new Error(`Không lấy được chi tiết phiếu kiểm kho KiotViet (${response.status}).`);
  const data = await response.json() as JsonRecord;
  const rows = Array.isArray(data.Data) ? data.Data : Array.isArray(data.data) ? data.data : [];
  const detailByProduct = new Map<number, number>();
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const productId = number(row.ProductId);
    const id = number(row.Id);
    if (productId && id) detailByProduct.set(productId, id);
  }
  return detailByProduct;
}

function buildPayload(template: JsonRecord, input: { kvBranchId: number; marker: string; lines: WriteLine[]; stocktake?: RemoteStocktake }, isAdjust: boolean, detailIds = new Map<number, number>()) {
  const payload = structuredClone(template);
  const stocktake = record(payload.StockTake);
  stocktake.BranchId = input.kvBranchId;
  stocktake.Description = input.marker;
  stocktake.CreatedDate = new Date().toISOString();
  stocktake.Uuid = input.stocktake?.uuid ?? crypto.randomUUID();
  stocktake.Id = input.stocktake?.id ?? 0;
  stocktake.Code = input.stocktake?.code ?? "";
  payload.StockTake = stocktake;
  const detailTemplate = Array.isArray(payload.StockTakeDetail) && payload.StockTakeDetail.length > 0 && isRecord(payload.StockTakeDetail[0]) ? payload.StockTakeDetail[0] as JsonRecord : {};
  payload.StockTakeDetail = input.lines.map((line, index) => ({
    ...structuredClone(detailTemplate),
    Id: detailIds.get(line.kvProductId) ?? 0,
    ProductId: line.kvProductId,
    ActualCount: line.actualCount,
    ProductName: line.name,
    ProductCode: line.code ?? "",
    OrderByNumber: index + 1
  }));
  payload.StockTakeDetailLargeData = null;
  payload.IsAdjust = isAdjust;
  payload.CompareIsAjust = isAdjust;
  return payload;
}

async function requestJson(template: CurlTemplate, payload: JsonRecord) {
  const response = await fetch(template.url, {
    method: "POST",
    headers: { ...template.headers, "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store"
  });
  if ([401, 403].includes(response.status)) throw new Error("Phiên đăng nhập KiotViet đã hết hạn hoặc không có quyền kiểm kho.");
  if (!response.ok) throw new Error(`KiotViet trả lỗi ${response.status} khi ghi phiếu kiểm kho.`);
  const responseBody = await response.json() as JsonRecord;
  const message = typeof responseBody.Message === "string" ? responseBody.Message : "";
  if (message && !/thành công|success/i.test(message)) throw new Error(`KiotViet không xác nhận phiếu kiểm kho: ${message}`);
  return responseBody;
}

function readRemoteStocktake(response: JsonRecord): RemoteStocktake {
  const data = record(response.Data);
  const id = number(data.Id);
  const code = string(data.Code);
  if (!id || !code) throw new Error("KiotViet không trả về ID hoặc mã phiếu kiểm kho.");
  return { id, code, uuid: string(data.Uuid) || null };
}

async function loadTemplate(label: string): Promise<CurlTemplate> {
  const file = process.env.KIOTVIET_STOCKTAKE_WRITE_REQUEST_FILE ?? "/run/secrets/kiotviet_stocktake_write_requests";
  const raw = await readFile(file, "utf8");
  const block = raw.split(/(?=^#\s*[A-Z_]+\s*$)/m).find((part) => part.includes(label));
  if (!block) throw new Error(`Secret KiotViet thiếu request ${label}.`);
  const url = block.match(/https:\/\/[^'"\s\\]+/)?.[0];
  const bodyText = block.match(/--data(?:-raw|-binary)?\s+'([\s\S]*?)'/)?.[1];
  if (!url || !bodyText) throw new Error(`Không đọc được request ${label} từ secret KiotViet.`);
  let body: JsonRecord;
  try { body = JSON.parse(bodyText) as JsonRecord; } catch { throw new Error(`Payload ${label} không phải JSON hợp lệ.`); }
  const headers: Record<string, string> = {};
  for (const match of block.matchAll(/(?:-H|--header)\s+'([^']+)'/g)) {
    const separator = match[1].indexOf(":");
    if (separator > 0) headers[match[1].slice(0, separator).trim().toLowerCase()] = match[1].slice(separator + 1).trim();
  }
  if (!headers.authorization) throw new Error("Request KiotViet không có Authorization header.");
  return { url, headers, body };
}

function withoutContentHeaders(headers: Record<string, string>) { const result = { ...headers }; delete result["content-type"]; return result; }
function record(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function number(value: unknown) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : 0; }
function string(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
