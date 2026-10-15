import { describe, expect, it } from "vitest";
import { buildInvoiceItemChanges } from "@/lib/invoice-item-change-audit";

describe("buildInvoiceItemChanges", () => {
  it("records the inventory effect when a completed invoice quantity is reduced", () => {
    expect(buildInvoiceItemChanges({
      previousItems: [{ productId: 309, quantity: 25 }],
      currentItems: [{ productId: 309, quantity: 20 }],
      previousStatus: "Hoàn thành",
      currentStatus: "Hoàn thành"
    })).toEqual([{
      productId: 309,
      previousQuantity: 25,
      currentQuantity: 20,
      inventoryDelta: 5,
      changeType: "QUANTITY_CHANGED"
    }]);
  });

  it("records a cancelled completed invoice as stock restored", () => {
    expect(buildInvoiceItemChanges({
      previousItems: [{ productId: 312, quantity: 1 }],
      currentItems: [{ productId: 312, quantity: 1 }],
      previousStatus: "Hoàn thành",
      currentStatus: "Đã hủy"
    })).toMatchObject([{ productId: 312, inventoryDelta: 1, changeType: "REMOVED" }]);
  });

  it("does not create an audit record when quantities are unchanged", () => {
    expect(buildInvoiceItemChanges({
      previousItems: [{ productId: 309, quantity: 25 }],
      currentItems: [{ productId: 309, quantity: 25 }],
      previousStatus: "Hoàn thành",
      currentStatus: "Hoàn thành"
    })).toEqual([]);
  });
});
