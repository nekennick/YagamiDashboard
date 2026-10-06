import { describe, expect, it } from "vitest";
import { parseKiotVietDate } from "@/lib/kiotviet/datetime";

describe("parseKiotVietDate", () => {
  it("treats KiotViet date-times without an offset as Vietnam time", () => {
    expect(parseKiotVietDate("2026-10-06T15:27:58.5900000")?.toISOString()).toBe("2026-10-06T08:27:58.590Z");
  });

  it("keeps an explicit timezone unchanged", () => {
    expect(parseKiotVietDate("2026-10-06T08:27:58.590Z")?.toISOString()).toBe("2026-10-06T08:27:58.590Z");
  });
});
