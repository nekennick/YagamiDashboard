import { describe, expect, it } from "vitest";
import { isBalancedStocktakeStatus, parseInternalStocktakeRequestSecret } from "./internal-stocktakes";

describe("parseInternalStocktakeRequestSecret", () => {
  it("reads the management session without retaining browser-only headers", () => {
    const session = parseInternalStocktakeRequestSecret(`curl ^"https://api-man1.kiotviet.vn/api/stocktakes/list^" ^
  -H ^"authorization: Bearer secret-value^" ^
  -H ^"fingerprintkey: device-key^" ^
  -H ^"sec-fetch-site: same-site^" ^
  --data-raw ^"{}^"`);
    expect(session.baseUrl).toBe("https://api-man1.kiotviet.vn");
    expect(session.headers.authorization).toBe("Bearer secret-value");
    expect(session.headers.fingerprintkey).toBe("device-key");
    expect(session.headers["sec-fetch-site"]).toBeUndefined();
  });

  it("rejects an unexpected host", () => {
    expect(() => parseInternalStocktakeRequestSecret(`curl "https://example.com/api/stocktakes/list" -H "authorization: Bearer x"`)).toThrow("Host API nội bộ KiotViet không hợp lệ");
  });
});

describe("isBalancedStocktakeStatus", () => {
  it("accepts a completed/balanced stocktake", () => {
    expect(isBalancedStocktakeStatus(1)).toBe(true);
  });

  it("rejects temporary and cancelled stocktakes", () => {
    expect(isBalancedStocktakeStatus(2)).toBe(false);
    expect(isBalancedStocktakeStatus(0)).toBe(false);
  });
});
