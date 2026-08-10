"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GripVertical, Loader2, Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";
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
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể cập nhật nhóm hàng.");
      return false;
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
          return <GroupSection key={group.id} group={group} products={groupProducts} allProducts={products} editingId={editingId} editingName={editingName} editingStorage={editingStorage} onAssignProducts={(productIds) => act({ action: "assign-products", groupId: group.id, productIds }, `Đã thêm ${productIds.length} sản phẩm vào nhóm ${group.name}.`)} onDragStart={setDragged} onDrop={(event) => { event.preventDefault(); if (dragged?.type === "group" && dragged.id !== group.id) void act({ action: "move-group", groupId: dragged.id, beforeGroupId: group.id }, "Đã sắp xếp nhóm hàng."); if (dragged?.type === "product") void act({ action: "move-product", productId: dragged.id, groupId: group.id }, `Đã chuyển sản phẩm vào nhóm ${group.name}.`); setDragged(null); }} onEdit={() => { setEditingId(group.id); setEditingName(group.name); setEditingStorage(group.storageArea); }} onEditName={setEditingName} onEditStorage={setEditingStorage} onSaveEdit={() => { void act({ action: "rename-group", id: group.id, name: editingName, storageArea: editingStorage }, "Đã cập nhật nhóm hàng."); setEditingId(null); }} onCancelEdit={() => setEditingId(null)} onDelete={() => { if (window.confirm(`Xóa nhóm ${group.name}? Sản phẩm sẽ về Chưa phân nhóm.`)) void act({ action: "delete-group", id: group.id }, "Đã xóa nhóm hàng."); }} onProductDrop={(event, beforeProductId) => { event.preventDefault(); if (dragged?.type !== "product") return; void act({ action: "move-product", productId: dragged.id, groupId: group.id, beforeProductId }, "Đã sắp xếp sản phẩm."); setDragged(null); }} />;
        })}
        <GroupSection group={{ id: 0, name: "Chưa phân nhóm", storageArea: "UNASSIGNED", position: groups.length, assignments: [] }} products={ungrouped} allProducts={products} editingId={null} editingName="" editingStorage="" onAssignProducts={async () => false} onDragStart={setDragged} onDrop={(event) => { event.preventDefault(); if (dragged?.type === "product") { setMessage("Hãy tạo hoặc chọn một nhóm để phân loại sản phẩm."); setDragged(null); } }} onEdit={() => undefined} onEditName={() => undefined} onEditStorage={() => undefined} onSaveEdit={() => undefined} onCancelEdit={() => undefined} onDelete={() => undefined} onProductDrop={() => undefined} />
      </div>
    </div>
  );
}

function GroupSection({ group, products, allProducts, editingId, editingName, editingStorage, onAssignProducts, onDragStart, onDrop, onEdit, onEditName, onEditStorage, onSaveEdit, onCancelEdit, onDelete, onProductDrop }: { group: Group; products: Product[]; allProducts: Product[]; editingId: number | null; editingName: string; editingStorage: string; onAssignProducts: (productIds: number[]) => Promise<boolean>; onDragStart: (value: { type: "product" | "group"; id: number }) => void; onDrop: (event: React.DragEvent<HTMLDivElement>) => void; onEdit: () => void; onEditName: (value: string) => void; onEditStorage: (value: string) => void; onSaveEdit: () => void; onCancelEdit: () => void; onDelete: () => void; onProductDrop: (event: React.DragEvent<HTMLDivElement>, productId: number) => void }) {
  return <div className="relative rounded-lg border border-slate-200 dark:border-slate-800" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
    <div className="flex items-center justify-between bg-slate-100 px-3 py-2 dark:bg-slate-800" draggable={group.id > 0} onDragStart={() => group.id > 0 && onDragStart({ type: "group", id: group.id })}>
      <div className="flex min-w-0 items-center gap-2"><GripVertical className="h-4 w-4 shrink-0 text-slate-400" />{editingId === group.id ? <><input autoFocus className="h-8 rounded border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white" onChange={(event) => onEditName(event.target.value)} value={editingName} /><select className="h-8 rounded border border-slate-300 bg-white px-2 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-white" onChange={(event) => onEditStorage(event.target.value)} value={editingStorage}>{inventoryStorageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></> : <><span className="font-semibold text-slate-800 dark:text-slate-100">{group.name}</span><span className="rounded-full bg-white px-2 py-1 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">{inventoryStorageLabel(group.storageArea)}</span></>}<span className="text-xs text-slate-500">({products.length})</span></div>
      {group.id > 0 ? <div className="flex items-center gap-1">{editingId === group.id ? <><Button className="h-8 px-2" onClick={onSaveEdit}><Save className="h-4 w-4" /></Button><Button className="h-8 px-2" onClick={onCancelEdit} variant="secondary"><X className="h-4 w-4" /></Button></> : <><Button className="h-8 px-2" onClick={onEdit} variant="secondary"><Pencil className="h-4 w-4" /></Button><Button className="h-8 px-2 text-red-600" onClick={onDelete} variant="secondary"><Trash2 className="h-4 w-4" /></Button></>}</div> : null}
    </div>
    {group.id > 0 ? <GroupProductPicker allProducts={allProducts} groupId={group.id} onAssign={onAssignProducts} /> : null}
    <div className="divide-y divide-slate-100 dark:divide-slate-800">{products.length === 0 ? <div className="px-3 py-3 text-sm text-slate-500">Chưa có sản phẩm.</div> : products.map((product) => <div className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-900" draggable onDragStart={() => onDragStart({ type: "product", id: product.id })} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onProductDrop(event, product.id)} key={product.id}><GripVertical className="h-4 w-4 shrink-0 text-slate-300" /><span className="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-200">{product.name}</span><span className="text-xs text-slate-500">{product.code ?? ""}{product.unit ? ` · ${product.unit}` : ""}</span></div>)}</div>
  </div>;
}

function GroupProductPicker({ allProducts, groupId, onAssign }: { allProducts: Product[]; groupId: number; onAssign: (productIds: number[]) => Promise<boolean> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const selectedProducts = selectedIds.map((id) => allProducts.find((product) => product.id === id)).filter((product): product is Product => Boolean(product));
  const normalizedQuery = normalizeSearchText(query);
  const suggestions = normalizedQuery
    ? allProducts
        .filter((product) => product.manualGroupAssignment?.groupId !== groupId)
        .filter((product) => !selectedIds.includes(product.id))
        .filter((product) => normalizeSearchText(`${product.name} ${product.code ?? ""}`).includes(normalizedQuery))
        .slice(0, 8)
    : [];

  function selectProduct(product: Product) {
    setSelectedIds((current) => [...current, product.id]);
    setQuery("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function saveSelection() {
    if (selectedIds.length === 0) return;
    setSaving(true);
    const saved = await onAssign(selectedIds);
    if (saved) {
      setSelectedIds([]);
      setQuery("");
    }
    setSaving(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div className="relative z-20 border-b border-slate-100 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="flex items-start gap-2">
        <div className="relative min-w-0 flex-1">
          <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-sm transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/15 dark:border-slate-700 dark:bg-slate-950">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            {selectedProducts.map((product) => (
              <span className="inline-flex h-7 max-w-[240px] items-center gap-1 rounded-md bg-brand-50 px-2 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" key={product.id}>
                <span className="truncate">{product.name}</span>
                <button aria-label={`Bỏ ${product.name}`} className="cursor-pointer rounded p-0.5 hover:bg-brand-100 dark:hover:bg-brand-500/25" onClick={() => setSelectedIds((current) => current.filter((id) => id !== product.id))} type="button">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              ref={inputRef}
              aria-label="Tìm sản phẩm để thêm vào nhóm"
              className="h-7 min-w-[180px] flex-1 bg-transparent px-1 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && suggestions[0]) {
                  event.preventDefault();
                  selectProduct(suggestions[0]);
                } else if (event.key === "Backspace" && !query && selectedIds.length > 0) {
                  setSelectedIds((current) => current.slice(0, -1));
                } else if (event.key === "Escape") {
                  setQuery("");
                }
              }}
              placeholder={selectedIds.length > 0 ? "Tìm thêm sản phẩm..." : "Gõ tên hoặc mã sản phẩm..."}
              value={query}
            />
          </div>

          {normalizedQuery ? (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-950">
              {suggestions.length > 0 ? suggestions.map((product) => (
                <button
                  className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-slate-100 focus:bg-slate-100 focus:outline-none dark:hover:bg-slate-800 dark:focus:bg-slate-800"
                  key={product.id}
                  onClick={() => selectProduct(product)}
                  type="button"
                >
                  <span className="min-w-0 truncate text-sm font-medium text-slate-900 dark:text-white">{product.name}</span>
                  <span className="shrink-0 text-xs text-slate-500">{product.code ?? "Chưa có mã"}{product.manualGroupAssignment ? " · Sẽ chuyển nhóm" : ""}</span>
                </button>
              )) : <div className="px-3 py-3 text-sm text-slate-500">Không tìm thấy sản phẩm phù hợp.</div>}
            </div>
          ) : null}
        </div>

        <Button className="shrink-0" disabled={selectedIds.length === 0 || saving} onClick={() => void saveSelection()}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Thêm {selectedIds.length > 0 ? selectedIds.length : ""}
        </Button>
      </div>
    </div>
  );
}

function matchesProduct(product: Product, query: string) { return !query || `${product.name} ${product.code ?? ""}`.toLocaleLowerCase().includes(query); }

function normalizeSearchText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().trim();
}
