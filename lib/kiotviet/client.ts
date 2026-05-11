import { getKiotVietConfig, validateKiotVietConfig } from "@/lib/kiotviet/config";

export type ApiTestKind = "token" | "products" | "customers" | "invoices" | "inventory";

export type KiotVietTestResult = {
  ok: boolean;
  status: number;
  message: string;
  totalRecords: number;
  preview: unknown[];
  raw?: unknown;
};

const endpointByKind: Record<Exclude<ApiTestKind, "token">, string> = {
  products: "/products?pageSize=5&currentItem=0",
  customers: "/customers?pageSize=5&currentItem=0",
  invoices: "/invoices?pageSize=5&currentItem=0",
  inventory: "/products?pageSize=5&currentItem=0&includeInventory=true"
};

export async function getKiotVietAccessToken() {
  const tokenResult = await getAccessToken();

  if (!tokenResult.ok || typeof tokenResult.raw !== "string") {
    throw new Error(tokenResult.message);
  }

  return tokenResult.raw;
}

export async function fetchKiotVietList(endpoint: string, pageSize = 100) {
  const records: unknown[] = [];
  let currentItem = 0;
  let total = 0;

  while (true) {
    const { records: pageRecords, totalRecords } = await fetchKiotVietPage(endpoint, currentItem, pageSize);
    records.push(...pageRecords);
    total = totalRecords;

    if (pageRecords.length < pageSize || records.length >= total) {
      break;
    }

    currentItem += pageSize;
  }

  return records;
}

export async function fetchKiotVietPage(endpoint: string, currentItem = 0, pageSize = 100) {
  const token = await getKiotVietAccessToken();
  const config = getKiotVietConfig();
  const url = new URL(`${config.apiUrl}${endpoint}`);
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("currentItem", String(currentItem));

  const response = await fetchWithRetry(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Retailer: config.retailer
    },
    cache: "no-store"
  });
  const json = await readJsonSafely(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(json, response.statusText));
  }

  const records = extractRecords(json);
  return {
    records,
    totalRecords: extractTotal(json, currentItem + records.length),
    raw: json
  };
}

async function fetchWithRetry(url: URL, init: RequestInit, retries = 3) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;

      if (attempt < retries) {
        await sleep(500 * attempt);
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : "fetch failed";
  throw new Error(`Không thể gọi KiotViet API (${url.pathname}${url.search}): ${message}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function testKiotViet(kind: ApiTestKind): Promise<KiotVietTestResult> {
  const tokenResult = await getAccessToken();

  if (kind === "token" || !tokenResult.ok) {
    return tokenResult;
  }

  const config = getKiotVietConfig();
  const endpoint = endpointByKind[kind];
  const response = await fetch(`${config.apiUrl}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${tokenResult.raw}`,
      Retailer: config.retailer
    },
    cache: "no-store"
  });

  return toResult(response, await readJsonSafely(response));
}

async function getAccessToken(): Promise<KiotVietTestResult> {
  const config = getKiotVietConfig();
  const missing = validateKiotVietConfig(config);

  if (missing.length > 0) {
    return {
      ok: false,
      status: 400,
      message: `Missing environment variables: ${missing.join(", ")}`,
      totalRecords: 0,
      preview: []
    };
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scopes: "PublicApi.Access"
  });

  const response = await fetch(config.authUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body,
    cache: "no-store"
  });
  const json = await readJsonSafely(response);
  const token = getValue(json, "access_token");

  return {
    ok: response.ok && Boolean(token),
    status: response.status,
    message: response.ok && token ? "Đã nhận Access Token" : getErrorMessage(json, response.statusText),
    totalRecords: token ? 1 : 0,
    preview: token ? [{ access_token: maskToken(String(token)) }] : [],
    raw: token
  };
}

async function readJsonSafely(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function toResult(response: Response, json: unknown): KiotVietTestResult {
  const records = extractRecords(json);

  return {
    ok: response.ok,
    status: response.status,
    message: response.ok ? "Yêu cầu hoàn tất" : getErrorMessage(json, response.statusText),
    totalRecords: extractTotal(json, records.length),
    preview: records.slice(0, 5),
    raw: json
  };
}

function extractRecords(json: unknown): unknown[] {
  if (Array.isArray(json)) {
    return json;
  }

  if (json && typeof json === "object") {
    const object = json as Record<string, unknown>;
    const candidate = object.data ?? object.Data ?? object.items ?? object.Items;

    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return json ? [json] : [];
}

function extractTotal(json: unknown, fallback: number) {
  if (json && typeof json === "object") {
    const object = json as Record<string, unknown>;
    const total = object.total ?? object.Total ?? object.totalRecords ?? object.TotalRecords;

    if (typeof total === "number") {
      return total;
    }
  }

  return fallback;
}

function getErrorMessage(json: unknown, fallback: string) {
  const message = getValue(json, "error_description") ?? getValue(json, "message") ?? getValue(json, "Message");
  return message ? String(message) : fallback;
}

function getValue(json: unknown, key: string) {
  if (!json || typeof json !== "object") {
    return undefined;
  }

  return (json as Record<string, unknown>)[key];
}

function maskToken(token: string) {
  if (token.length <= 16) {
    return "***";
  }

  return `${token.slice(0, 8)}...${token.slice(-6)}`;
}
