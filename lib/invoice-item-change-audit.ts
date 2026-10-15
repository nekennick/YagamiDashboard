export type InvoiceQuantityLine = {
  productId: number | null;
  quantity: number;
};

export type InvoiceItemChangeCandidate = {
  productId: number;
  previousQuantity: number;
  currentQuantity: number;
  inventoryDelta: number;
  changeType: "QUANTITY_CHANGED" | "ADDED" | "REMOVED";
};

const completedInvoiceStatus = "Hoàn thành";

export function buildInvoiceItemChanges({
  previousItems,
  currentItems,
  previousStatus,
  currentStatus
}: {
  previousItems: InvoiceQuantityLine[];
  currentItems: InvoiceQuantityLine[];
  previousStatus: string | null | undefined;
  currentStatus: string | null | undefined;
}): InvoiceItemChangeCandidate[] {
  const previousByProduct = quantitiesByProduct(previousItems);
  const currentByProduct = quantitiesByProduct(currentItems);
  const productIds = new Set([...previousByProduct.keys(), ...currentByProduct.keys()]);
  const previousIsCompleted = previousStatus === completedInvoiceStatus;
  const currentIsCompleted = currentStatus === completedInvoiceStatus;

  return [...productIds].flatMap((productId) => {
    const previousQuantity = previousByProduct.get(productId) ?? 0;
    const currentQuantity = currentByProduct.get(productId) ?? 0;
    const previousEffectiveQuantity = previousIsCompleted ? previousQuantity : 0;
    const currentEffectiveQuantity = currentIsCompleted ? currentQuantity : 0;

    if (nearlyEqual(previousEffectiveQuantity, currentEffectiveQuantity)) return [];

    return [{
      productId,
      previousQuantity,
      currentQuantity,
      // Selling fewer units increases on-hand stock by the same amount.
      inventoryDelta: previousEffectiveQuantity - currentEffectiveQuantity,
      changeType: previousEffectiveQuantity === 0
        ? "ADDED"
        : currentEffectiveQuantity === 0
          ? "REMOVED"
          : "QUANTITY_CHANGED"
    }];
  });
}

function quantitiesByProduct(items: InvoiceQuantityLine[]) {
  return items.reduce((quantities, item) => {
    if (item.productId === null) return quantities;
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    return quantities;
  }, new Map<number, number>());
}

function nearlyEqual(left: number, right: number) {
  return Math.abs(left - right) < 0.000001;
}
