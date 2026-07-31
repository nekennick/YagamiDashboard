"use client";

import { useEffect, useMemo, useState } from "react";
import { GripVertical, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inventoryStorageLabel, inventoryStorageOptions } from "@/lib/inventory-storage";

type Group = { id: number; name: string; storageArea: string; position: number; assignments: { productId: number; position: number }[] };
type Product = { id: number; name: string; code: string | null; unit: string | null; manualGroupAssignment: { groupId: number; position: number } | null };

export function InventoryGroupManager() {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [newGroupStorage, setNewGroupStorage] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingStorage, setEditingStorage] = useState("");
  const [dragged, setDragged] = useState<{ type: "product" | "group"; id: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Kéo sản phẩm vào nhóm để phân loại.");

  useEffect(() => {
    if (open) void load();
  }, [open]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const ungrouped = products.filter((product) => !product.manualGroupAssignment && matchesProduct(product, normalizedQuery));

  async function load() {
    setBusy(true);
    try {
      const response = await fetch("/api/inventory-groups", { cache: "no-store" });
      const data = (await response.json()) as { groups?: Group[]; products?: Product[]; message?: string };
      if (!response.ok) throw new Error(data.message ?? "Không thể tải nhóm hàng.");
      setGroups(data.groups ?? []);
      setProducts(data.products ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tải nhóm hàng.");
    } finally {
      setBusy(false);
    }
  }

  async function act(body: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/inventory-groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Không thể cập nhật nhóm hàng.");
      setMessage(success);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể cập nhật nhóm hàng.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)} variant="secondary"><Pencil className="mr-2 h-4 w-4" />Sắp xếp nhóm hàng</Button>;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-slate-950 dark:text-white">Sắp xếp nhóm hàng thủ công</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Nhóm này độc lập với nhóm hàng KiotViet và không bị ghi đè khi đồng bộ.</p>
        </div>
        <Button onClick={() => setOpen(false)} variant="secondary"><X className="mr-2 h-4 w-4" />Đóng</Button>
      </div>

      <div className="flex flex-col gap-3 py-4 sm:flex-row">
        <input className="h-10 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white" onChange={(event) => setQuery(event.target.value)} placeholder="Tìm sản phẩm để sắp xếp" value={query} />
        <div className="flex flex-wrap gap-2">
          <input className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white sm:w-56" onChange={(event) => setNewGroup(event.target.value)} placeholder="Tên nhóm mới" value={newGroup} />
          <select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white" onChange={(event) => setNewGroupStorage(event.target.value)} value={newGroupStorage}>
            <option value="">Chọn khu kho</option>
            {inventoryStorageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <Button disabled={!newGroup.trim() || !newGroupStorage || busy} onClick={() => { void act({ action: "create-group", name: newGroup, storageArea: newGroupStorage }, "Đã tạo nhóm hàng."); setNewGroup(""); setNewGroupStorage(""); }}><Plus className="mr-2 h-4 w-4" />Thêm nhóm</Button>
        </div>
      </div>

      <div className="mb-4 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">{busy ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : null}{message}</div>
      <div className="space-y-3">
        {groups.map((group) => {
          const groupProducts = group.assignments.map((assignment) => productById.get(assignment.productId)).filter((product): product is Product => Boolean(product)).filter((product) => matchesProduct(product, normalizedQuery));
          return <GroupSection key={group.id} group={group} products={groupProducts} editingId={editingId} editingName={editingName} editingStorage={editingStorage} onDragStart={setDragged} onDrop={(event) => { event.preventDefault(); if (dragged?.type === "group" && dragged.id !== group.id) void act({ action: "move-group", groupId: dragged.id, beforeGroupId: group.id }, "Đã sắp xếp nhóm hàng."); if (dragged?.type === "product") void act({ action: "move-product", productId: dragged.id, groupId: group.id }, `Đã chuyển sản phẩm vào nhóm ${group.name}.`); setDragged(null); }} onEdit={() => { setEditingId(group.id); setEditingName(group.name); setEditingStorage(group.storageArea); }} onEditName={setEditingName} onEditStorage={setEditingStorage} onSaveEdit={() => { void act({ action: "rename-group", id: group.id, name: editingName, storageArea: editingStorage }, "Đã cập nhật nhóm hàng."); setEditingId(null); }} onCancelEdit={() => setEditingId(null)} onDelete={() => { if (window.confirm(`Xóa nhóm ${group.name}? Sản phẩm sẽ về Chưa phân nhóm.`)) void act({ action: "delete-group", id: group.id }, "Đã xóa nhóm hàng."); }} onProductDrop={(event, beforeProductId) => { event.preventDefault(); if (dragged?.type !== "product") return; void act({ action: "move-product", productId: dragged.id, groupId: group.id, beforeProductId }, "Đã sắp xếp sản phẩm."); setDragged(null); }} />;
        })}
        <GroupSection group={{ id: 0, name: "Chưa phân nhóm", storageArea: "UNASSIGNED", position: groups.length, assignments: [] }} products={ungrouped} editingId={null} editingName="" editingStorage="" onDragStart={setDragged} onDrop={(event) => { event.preventDefault(); if (dragged?.type === "product") { setMessage("Hãy tạo hoặc chọn một nhóm để phân loại sản phẩm."); setDragged(null); } }} onEdit={() => undefined} onEditName={() => undefined} onEditStorage={() => undefined} onSaveEdit={() => undefined} onCancelEdit={() => undefined} onDelete={() => undefined} onProductDrop={() => undefined} />
      </div>
    </div>
  );
}

function GroupSection({ group, products, editingId, editingName, editingStorage, onDragStart, onDrop, onEdit, onEditName, onEditStorage, onSaveEdit, onCancelEdit, onDelete, onProductDrop }: { group: Group; products: Product[]; editingId: number | null; editingName: string; editingStorage: string; onDragStart: (value: { type: "product" | "group"; id: number }) => void; onDrop: (event: React.DragEvent<HTMLDivElement>) => void; onEdit: () => void; onEditName: (value: string) => void; onEditStorage: (value: string) => void; onSaveEdit: () => void; onCancelEdit: () => void; onDelete: () => void; onProductDrop: (event: React.DragEvent<HTMLDivElement>, productId: number) => void }) {
  return <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
    <div className="flex items-center justify-between bg-slate-100 px-3 py-2 dark:bg-slate-800" draggable={group.id > 0} onDragStart={() => group.id > 0 && onDragStart({ type: "group", id: group.id })}>
      <div className="flex min-w-0 items-center gap-2"><GripVertical className="h-4 w-4 shrink-0 text-slate-400" />{editingId === group.id ? <><input autoFocus className="h-8 rounded border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white" onChange={(event) => onEditName(event.target.value)} value={editingName} /><select className="h-8 rounded border border-slate-300 bg-white px-2 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-white" onChange={(event) => onEditStorage(event.target.value)} value={editingStorage}>{inventoryStorageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></> : <><span className="font-semibold text-slate-800 dark:text-slate-100">{group.name}</span><span className="rounded-full bg-white px-2 py-1 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">{inventoryStorageLabel(group.storageArea)}</span></>}<span className="text-xs text-slate-500">({products.length})</span></div>
      {group.id > 0 ? <div className="flex items-center gap-1">{editingId === group.id ? <><Button className="h-8 px-2" onClick={onSaveEdit}><Save className="h-4 w-4" /></Button><Button className="h-8 px-2" onClick={onCancelEdit} variant="secondary"><X className="h-4 w-4" /></Button></> : <><Button className="h-8 px-2" onClick={onEdit} variant="secondary"><Pencil className="h-4 w-4" /></Button><Button className="h-8 px-2 text-red-600" onClick={onDelete} variant="secondary"><Trash2 className="h-4 w-4" /></Button></>}</div> : null}
    </div>
    <div className="divide-y divide-slate-100 dark:divide-slate-800">{products.length === 0 ? <div className="px-3 py-3 text-sm text-slate-500">Chưa có sản phẩm.</div> : products.map((product) => <div className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-900" draggable onDragStart={() => onDragStart({ type: "product", id: product.id })} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onProductDrop(event, product.id)} key={product.id}><GripVertical className="h-4 w-4 shrink-0 text-slate-300" /><span className="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-200">{product.name}</span><span className="text-xs text-slate-500">{product.code ?? ""}{product.unit ? ` · ${product.unit}` : ""}</span></div>)}</div>
  </div>;
}

function matchesProduct(product: Product, query: string) { return !query || `${product.name} ${product.code ?? ""}`.toLocaleLowerCase().includes(query); }
