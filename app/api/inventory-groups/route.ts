import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeInventoryStorage } from "@/lib/inventory-storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const [groups, products] = await Promise.all([
    prisma.inventoryGroup.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
      include: { assignments: { orderBy: [{ position: "asc" }, { productId: "asc" }], select: { productId: true, position: true } } }
    }),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, unit: true, isActive: true, manualGroupAssignment: { select: { groupId: true, position: true } } }
    })
  ]);

  return NextResponse.json({ groups, products });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "create-group") {
      const name = String(body.name ?? "").trim();
      const storageArea = normalizeInventoryStorage(typeof body.storageArea === "string" ? body.storageArea : undefined);
      if (!name) throw new Error("Tên nhóm không được để trống.");
      if (!storageArea) throw new Error("Hãy chọn Kho khô hoặc Kho đông cho nhóm hàng.");
      const last = await prisma.inventoryGroup.findFirst({ orderBy: { position: "desc" }, select: { position: true } });
      const group = await prisma.inventoryGroup.create({ data: { name, storageArea, position: (last?.position ?? -1) + 1 } });
      return NextResponse.json({ group });
    }

    if (action === "rename-group") {
      const id = positiveInt(body.id);
      const name = String(body.name ?? "").trim();
      const storageArea = normalizeInventoryStorage(typeof body.storageArea === "string" ? body.storageArea : undefined);
      if (!name) throw new Error("Tên nhóm không được để trống.");
      if (!storageArea) throw new Error("Hãy chọn Kho khô hoặc Kho đông cho nhóm hàng.");
      const group = await prisma.inventoryGroup.update({ where: { id }, data: { name, storageArea } });
      return NextResponse.json({ group });
    }

    if (action === "delete-group") {
      const id = positiveInt(body.id);
      await prisma.inventoryGroup.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    }

    if (action === "move-product") {
      const productId = positiveInt(body.productId);
      const groupId = positiveInt(body.groupId);
      const beforeProductId = optionalPositiveInt(body.beforeProductId);
      await moveProduct(productId, groupId, beforeProductId);
      return NextResponse.json({ ok: true });
    }

    if (action === "move-group") {
      const groupId = positiveInt(body.groupId);
      const beforeGroupId = optionalPositiveInt(body.beforeGroupId);
      await moveGroup(groupId, beforeGroupId);
      return NextResponse.json({ ok: true });
    }

    throw new Error("Thao tác nhóm hàng không hợp lệ.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể cập nhật nhóm hàng.";
    return NextResponse.json({ message }, { status: 400 });
  }
}

async function moveProduct(productId: number, groupId: number, beforeProductId: number | undefined) {
  const assignments = await prisma.inventoryGroupProduct.findMany({ where: { groupId }, orderBy: [{ position: "asc" }, { productId: "asc" }] });
  const ids = assignments.filter((item) => item.productId !== productId).map((item) => item.productId);
  const beforeIndex = beforeProductId ? ids.indexOf(beforeProductId) : -1;
  ids.splice(beforeIndex >= 0 ? beforeIndex : ids.length, 0, productId);

  await prisma.$transaction(async (tx) => {
    await tx.inventoryGroupProduct.deleteMany({ where: { productId } });
    await tx.inventoryGroupProduct.create({ data: { productId, groupId, position: ids.length - 1 } });
    for (const [position, id] of ids.entries()) {
      await tx.inventoryGroupProduct.update({ where: { productId: id }, data: { groupId, position } });
    }
  });
}

async function moveGroup(groupId: number, beforeGroupId: number | undefined) {
  const groups = await prisma.inventoryGroup.findMany({ orderBy: [{ position: "asc" }, { id: "asc" }] });
  const ids = groups.filter((group) => group.id !== groupId).map((group) => group.id);
  const beforeIndex = beforeGroupId ? ids.indexOf(beforeGroupId) : -1;
  ids.splice(beforeIndex >= 0 ? beforeIndex : ids.length, 0, groupId);
  await prisma.$transaction(ids.map((id, position) => prisma.inventoryGroup.update({ where: { id }, data: { position } })));
}

function positiveInt(value: unknown) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("Mã dữ liệu không hợp lệ.");
  return parsed;
}

function optionalPositiveInt(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  return positiveInt(value);
}
