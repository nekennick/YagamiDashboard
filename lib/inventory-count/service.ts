import { InventoryCountLineStatus, InventoryCountSessionStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function parseCount(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const raw = value.trim();
  const normalized = raw.includes(",") && raw.includes(".") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function latestInventoryPosition(productId: number, branchId: number) {
  const [snapshot, position] = await Promise.all([
    prisma.inventorySnapshot.findFirst({
      where: { productId, branchId },
      orderBy: { snapshotDate: "desc" },
      select: { onHand: true, snapshotDate: true }
    }),
    prisma.inventoryPositionVersion.findUnique({
      where: { productId_branchId: { productId, branchId } },
      select: { version: true }
    })
  ]);
  return { onHand: Number(snapshot?.onHand ?? 0), snapshotDate: snapshot?.snapshotDate ?? null, version: position?.version ?? 0 };
}

export async function addInventoryCountAudit(
  tx: Prisma.TransactionClient,
  input: { entityType: string; entityId: string; action: string; actorId?: number | null; payload?: unknown }
) {
  await tx.inventoryCountAudit.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actorId: input.actorId ?? null,
      payloadJson: JSON.stringify(input.payload ?? {})
    }
  });
}

export function isTerminalLineStatus(status: InventoryCountLineStatus) {
  return status === "NO_ADJUSTMENT" || status === "BALANCED" || status === "DISMISSED" || status === "CANCELLED";
}

export function isActiveSessionStatus(status: InventoryCountSessionStatus) {
  return status !== "COMPLETED" && status !== "CANCELLED";
}

export async function completeSessionIfResolved(tx: Prisma.TransactionClient, sessionId: string) {
  const unresolved = await tx.inventoryCountLine.count({
    where: { sessionId, status: { in: ["COUNTING", "AWAITING_DECISION", "QUEUED"] } }
  });
  if (unresolved === 0) {
    await tx.inventoryCountSession.update({ where: { id: sessionId }, data: { status: "COMPLETED", completedAt: new Date() } });
  }
}
