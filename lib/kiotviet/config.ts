export type KiotVietConfig = {
  clientId: string;
  clientSecret: string;
  retailer: string;
  authUrl: string;
  apiUrl: string;
};

export function getKiotVietConfig(): KiotVietConfig {
  return {
    clientId: process.env.KIOTVIET_CLIENT_ID ?? "",
    clientSecret: process.env.KIOTVIET_CLIENT_SECRET ?? "",
    retailer: process.env.KIOTVIET_RETAILER ?? "",
    authUrl: process.env.KIOTVIET_AUTH_URL ?? "https://id.kiotviet.vn/connect/token",
    apiUrl: process.env.KIOTVIET_API_URL ?? "https://public.kiotapi.com"
  };
}

export function validateKiotVietConfig(config: KiotVietConfig) {
  const missing = [
    ["KIOTVIET_CLIENT_ID", config.clientId],
    ["KIOTVIET_CLIENT_SECRET", config.clientSecret],
    ["KIOTVIET_RETAILER", config.retailer]
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return missing;
}
