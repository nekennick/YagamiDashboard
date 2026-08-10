export const inventoryStorageOptions = [
  { value: "DRY", label: "Kho khô" },
  { value: "COLD", label: "Kho đông" }
] as const;

export type InventoryStorageValue = (typeof inventoryStorageOptions)[number]["value"];

export function normalizeInventoryStorage(value: string | null | undefined) {
  return inventoryStorageOptions.some((option) => option.value === value) ? (value as InventoryStorageValue) : undefined;
}

export function inventoryStorageLabel(value: string | null | undefined) {
  return inventoryStorageOptions.find((option) => option.value === value)?.label ?? "Chưa xác định";
}
