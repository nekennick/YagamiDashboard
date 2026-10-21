import { describe, expect, it } from "vitest";
import { normalizeImportValue, parseAssignmentMatrix } from "@/lib/inventory-count/assignment-import";

describe("inventory assignment Excel import", () => {
  it("recognizes Vietnamese headers and preserves multiple employees", () => {
    const result = parseAssignmentMatrix([
      ["Kho", "Tài khoản", "Mã hàng"],
      ["Tổng kho YAGAMI", "nhanvien-a", "MYG"],
      ["Tổng kho YAGAMI", "nhanvien-b", "SML"]
    ]);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((row) => row.username)).toEqual(["nhanvien-a", "nhanvien-b"]);
  });

  it("reports missing values with the original worksheet row", () => {
    const result = parseAssignmentMatrix([
      ["Chi nhánh", "Username", "SKU"],
      ["Tổng kho YAGAMI", "", "MYG"]
    ]);
    expect(result.rows).toEqual([]);
    expect(result.errors[0]).toMatchObject({ rowNumber: 2 });
  });

  it("normalizes accents and repeated spaces for branch matching", () => {
    expect(normalizeImportValue("  Tổng   kho YAGAMI ")).toBe("tong kho yagami");
  });
});
