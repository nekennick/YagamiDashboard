import { describe, expect, it } from "vitest";
import { inventoryCategoryFilter } from "@/lib/inventory-category-filter";

describe("inventoryCategoryFilter", () => {
  it("maps Vy to the explicit product and unit list", () => {
    const filter = inventoryCategoryFilter("Vy");
    expect(filter.OR?.length).toBeGreaterThan(100);
    expect(filter.OR?.[0]).toEqual({ name: { equals: "Mì Udon", mode: "insensitive" }, unit: { equals: "Gói", mode: "insensitive" } });
  });

  it("maps Nhi to the explicit product and unit list", () => {
    const filter = inventoryCategoryFilter("Nhi");
    expect(filter.OR).toHaveLength(80);
    expect(filter.OR?.[0]).toEqual({ name: { equals: "Súp Mì Lớn (52 lít)", mode: "insensitive" }, unit: { equals: "Bịch", mode: "insensitive" } });
  });

  it("maps Vi to the explicit product and unit list", () => {
    const filter = inventoryCategoryFilter("Vi");
    expect(filter.OR?.length).toBeGreaterThan(50);
    expect(filter.OR?.[0]).toEqual({ name: { equals: "Mứt xí muội", mode: "insensitive" }, unit: { equals: "Bịch", mode: "insensitive" } });
  });

  it("keeps a normal KiotViet category unchanged", () => {
    expect(inventoryCategoryFilter("HÀNG PHA CHẾ")).toEqual({ categoryName: "HÀNG PHA CHẾ" });
  });
});
