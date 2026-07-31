import type { Prisma } from "@prisma/client";

export type WarehouseFilterValue = "BINH_DUONG" | "CAO_LANH";

export const warehouseFilterOptions: Array<{ value: WarehouseFilterValue; label: string; kvBranchId: number }> = [
  { value: "BINH_DUONG", label: "Kho Bình Dương", kvBranchId: 421136 },
  { value: "CAO_LANH", label: "Tổng kho Cao Lãnh", kvBranchId: 385885 }
];

export function normalizeWarehouseFilter(value: string | null | undefined) {
  const normalized = value?.trim();

  return warehouseFilterOptions.some((option) => option.value === normalized)
    ? (normalized as WarehouseFilterValue)
    : "";
}

export function warehouseLabel(value: string | null | undefined) {
  if (!value) {
    return "Tất cả kho";
  }

  return warehouseFilterOptions.find((option) => option.value === value)?.label ?? "Tất cả kho";
}

export function warehouseBranchWhere(value: string | null | undefined): Prisma.BranchWhereInput | undefined {
  const normalized = normalizeWarehouseFilter(value);
  const option = warehouseFilterOptions.find((item) => item.value === normalized);

  return option ? { kvBranchId: option.kvBranchId } : undefined;
}

export function warehouseSelectClassName() {
  return "h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-600";
}
