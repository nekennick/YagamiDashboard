const kiotVietBaseUrl = "https://tongkhoyagami.kiotviet.com/man/#";

export function kiotVietInvoiceUrl(code: string) {
  return `${kiotVietBaseUrl}/Invoices?Code=${encodeURIComponent(code)}`;
}

export function kiotVietPurchaseOrderUrl(code: string) {
  return `${kiotVietBaseUrl}/PurchaseOrder?Code=${encodeURIComponent(code)}`;
}

export function kiotVietOrderUrl(code: string) {
  return `${kiotVietBaseUrl}/Orders?code=${encodeURIComponent(code)}`;
}

export function kiotVietStocktakeUrl(code: string) {
  return `${kiotVietBaseUrl}/StockTakes?Code=${encodeURIComponent(code)}`;
}

export function kiotVietInternalUseUrl(code: string) {
  return `${kiotVietBaseUrl}/InternalUse?Code=${encodeURIComponent(code)}`;
}
