"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Download, FileSpreadsheet, Loader2, Save, Search, Upload, UserRound } from "lucide-react";

export type AssignmentResource = {
  id: number;
  branchId: number;
  productId: number;
  assigneeId: number;
  branch: { id: number; name: string };
  product: { id: number; code: string | null; name: string; unit: string | null; categoryName: string | null };
  assignee: { id: number; displayName: string; username?: string };
};

export type AssignmentResources = {
  assignments: AssignmentResource[];
  executors: Array<{ id: number; displayName: string; username?: string }>;
  branches: Array<{ id: number; name: string }>;
  products: Array<{ id: number; code: string | null; name: string; unit: string | null; categoryName: string | null }>;
};

type Conflict = { productId: number; code: string | null; name: string; branchName: string; assigneeName: string };
type ImportIssue = { rowNumber: number; message: string; value?: string };
type ImportPreview = {
  rows: Array<{ rowNumber: number; branchName: string; username: string; productCode: string }>;
  summaries: Array<{ branchName: string; assigneeName: string; username: string; productCount: number }>;
  errors: ImportIssue[];
  duplicates: ImportIssue[];
  conflicts: Conflict[];
  canApply: boolean;
};

class ApiError extends Error {
  constructor(message: string, readonly data: { conflicts?: Conflict[]; lockedProducts?: Conflict[] } = {}) { super(message); }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const response = await fetch(url, { ...init, headers: isForm ? init?.headers : { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.message || "Không thể xử lý yêu cầu.", data);
  return data as T;
}

function productLabel(product: AssignmentResources["products"][number]) {
  return `${product.code ? `${product.code} · ` : ""}${product.name}`;
}

export function InventoryAssignmentManager({ resources, onChanged }: { resources: AssignmentResources; onChanged: () => Promise<void> }) {
  const defaultBranchId = resources.branches.find((branch) => {
    const name = branch.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLocaleLowerCase("vi-VN");
    return name.includes("tong kho yagami") && !name.includes("binh duong");
  })?.id ?? resources.branches[0]?.id ?? 0;
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [assigneeId, setAssigneeId] = useState(resources.executors[0]?.id ?? 0);
  const [draftIds, setDraftIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [view, setView] = useState<"assigned" | "available">("assigned");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const currentIds = useMemo(() => new Set(resources.assignments.filter((item) => item.branchId === branchId && item.assigneeId === assigneeId).map((item) => item.productId)), [resources.assignments, branchId, assigneeId]);
  const currentKey = useMemo(() => [...currentIds].sort((a, b) => a - b).join(","), [currentIds]);
  useEffect(() => { setDraftIds(new Set(currentIds)); setConflicts([]); }, [branchId, assigneeId, currentKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const addedCount = [...draftIds].filter((id) => !currentIds.has(id)).length;
  const removedCount = [...currentIds].filter((id) => !draftIds.has(id)).length;
  const dirty = addedCount > 0 || removedCount > 0;
  const occupied = useMemo(() => new Map(resources.assignments.filter((item) => item.branchId === branchId && item.assigneeId !== assigneeId).map((item) => [item.productId, item.assignee.displayName])), [resources.assignments, branchId, assigneeId]);
  const categories = useMemo(() => [...new Set(resources.products.map((item) => item.categoryName).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "vi")), [resources.products]);
  const filteredProducts = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("vi-VN");
    return resources.products.filter((product) => {
      if (category && product.categoryName !== category) return false;
      if (needle && !`${product.code ?? ""} ${product.name}`.toLocaleLowerCase("vi-VN").includes(needle)) return false;
      return view === "assigned" ? draftIds.has(product.id) : !draftIds.has(product.id);
    });
  }, [resources.products, search, category, view, draftIds]);

  function confirmDiscard() {
    return !dirty || window.confirm("Danh sách đang có thay đổi chưa lưu. Bỏ các thay đổi này?");
  }

  function changeBranch(next: number) {
    if (!confirmDiscard()) return;
    setBranchId(next); setSearch(""); setMessage(null);
  }

  function changeAssignee(next: number) {
    if (!confirmDiscard()) return;
    setAssigneeId(next); setSearch(""); setMessage(null);
  }

  function toggleProduct(productId: number) {
    if (occupied.has(productId)) return;
    setDraftIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId); else next.add(productId);
      return next;
    });
  }

  function selectVisible() {
    setDraftIds((current) => {
      const next = new Set(current);
      for (const product of filteredProducts) if (!occupied.has(product.id)) next.add(product.id);
      return next;
    });
  }

  function removeVisible() {
    setDraftIds((current) => {
      const next = new Set(current);
      for (const product of filteredProducts) next.delete(product.id);
      return next;
    });
  }

  async function save() {
    if (!branchId || !assigneeId || !dirty) return;
    setBusy(true); setMessage(null); setConflicts([]);
    try {
      const result = await api<{ assignedCount: number; addedCount: number; removedCount: number }>("/api/inventory-count/assignments", { method: "PUT", body: JSON.stringify({ branchId, assigneeId, productIds: [...draftIds] }) });
      setMessage(`Đã lưu ${result.assignedCount} mã: thêm ${result.addedCount}, gỡ ${result.removedCount}.`);
      await onChanged();
    } catch (error) {
      if (error instanceof ApiError) setConflicts(error.data.conflicts ?? error.data.lockedProducts ?? []);
      setMessage(error instanceof Error ? error.message : "Không thể lưu phân công.");
    } finally { setBusy(false); }
  }

  async function previewFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true); setMessage(null); setPreview(null);
    try {
      const body = new FormData(); body.append("file", file);
      const result = await api<ImportPreview>("/api/inventory-count/assignments/import", { method: "POST", body });
      setPreview(result); setImportOpen(true);
      setMessage(result.canApply ? "File hợp lệ, hãy kiểm tra bản xem trước trước khi xác nhận." : "File còn lỗi hoặc xung đột nên chưa thể nhập.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể đọc file Excel."); }
    finally { setBusy(false); }
  }

  async function applyImport() {
    if (!preview?.canApply) return;
    setBusy(true); setMessage(null);
    try {
      const result = await api<{ groupCount: number; productCount: number }>("/api/inventory-count/assignments/import", { method: "POST", body: JSON.stringify({ rows: preview.rows }) });
      setMessage(`Đã gộp thêm ${result.productCount} mã cho ${result.groupCount} nhóm nhân viên/kho.`);
      setPreview(null); setImportOpen(false); await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể áp dụng file Excel.");
      if (error instanceof ApiError && error.data.conflicts?.length) setConflicts(error.data.conflicts);
    } finally { setBusy(false); }
  }

  const assigneeCount = (id: number) => resources.assignments.filter((item) => item.branchId === branchId && item.assigneeId === id).length;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="border-b border-slate-200 p-4 dark:border-gray-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="font-semibold">Phân công sản phẩm theo nhân viên</h3><p className="mt-1 text-xs text-slate-500">Quản lý nhiều mã trong một danh sách, sau đó lưu một lần.</p></div>
          <div className="flex flex-wrap gap-2">
            <a href="/api/inventory-count/assignments/template" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50"><Download className="h-4 w-4" />File mẫu</a>
            <button type="button" onClick={() => { setImportOpen(true); fileRef.current?.click(); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700"><Upload className="h-4 w-4" />Nhập Excel</button>
            <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(event) => void previewFile(event)} />
          </div>
        </div>
        <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-500">Kho áp dụng</label>
        <select value={branchId} onChange={(event) => changeBranch(Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm sm:max-w-sm">
          {resources.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </div>

      {message && <div className={`mx-4 mt-4 rounded-xl px-4 py-3 text-sm ${conflicts.length ? "bg-red-50 text-red-800" : "bg-indigo-50 text-indigo-900"}`}>{message}</div>}
      {conflicts.length > 0 && <div className="mx-4 mt-3 rounded-xl border border-red-200 bg-red-50 p-3"><p className="flex items-center gap-2 text-sm font-semibold text-red-800"><AlertTriangle className="h-4 w-4" />Các mã bị chặn</p><ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm text-red-800">{conflicts.map((item) => <li key={`${item.branchName}-${item.productId}`}>{item.code || "Không mã"} · {item.name} — {item.assigneeName} ({item.branchName})</li>)}</ul></div>}

      <div className="grid min-h-[520px] lg:grid-cols-[280px_1fr]">
        <aside className="border-b border-slate-200 p-3 lg:border-b-0 lg:border-r dark:border-gray-800">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Nhân viên</p>
          <div className="flex gap-2 overflow-x-auto pb-1 lg:block lg:max-h-[620px] lg:space-y-1 lg:overflow-y-auto">
            {resources.executors.map((user) => <button type="button" key={user.id} onClick={() => changeAssignee(user.id)} className={`flex min-w-[190px] items-center justify-between gap-3 rounded-xl px-3 py-3 text-left text-sm lg:w-full lg:min-w-0 ${assigneeId === user.id ? "bg-indigo-600 text-white" : "hover:bg-slate-100"}`}><span className="flex min-w-0 items-center gap-2"><UserRound className="h-4 w-4 shrink-0" /><span className="truncate"><b className="block truncate">{user.displayName}</b><span className={`text-xs ${assigneeId === user.id ? "text-indigo-100" : "text-slate-500"}`}>{user.username}</span></span></span><span className={`rounded-full px-2 py-0.5 text-xs ${assigneeId === user.id ? "bg-white/20" : "bg-slate-100"}`}>{assigneeCount(user.id)}</span></button>)}
          </div>
        </aside>

        <div className="min-w-0 p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_240px]">
            <label className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã hoặc tên sản phẩm" className="min-h-11 w-full rounded-xl border border-slate-300 pl-10 pr-3 text-sm outline-none focus:border-indigo-500" /></label>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm"><option value="">Tất cả nhóm hàng</option>{categories.map((name) => <option key={name} value={name}>{name}</option>)}</select>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => setView("assigned")} className={`rounded-lg px-3 py-2 text-sm font-medium ${view === "assigned" ? "bg-white shadow-sm" : "text-slate-600"}`}>Đã phân công ({draftIds.size})</button><button type="button" onClick={() => setView("available")} className={`rounded-lg px-3 py-2 text-sm font-medium ${view === "available" ? "bg-white shadow-sm" : "text-slate-600"}`}>Chưa phân công</button></div>
            <button type="button" onClick={view === "assigned" ? removeVisible : selectVisible} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-50">{view === "assigned" ? "Gỡ các mục đang hiển thị" : "Chọn các mục đang hiển thị"}</button>
          </div>
          <div className="mt-3 max-h-[430px] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
            {filteredProducts.map((product) => {
              const owner = occupied.get(product.id);
              return <label key={product.id} className={`flex min-h-14 items-center gap-3 px-3 py-2 ${owner ? "cursor-not-allowed bg-slate-50 opacity-70" : "cursor-pointer hover:bg-indigo-50/50"}`}><input type="checkbox" checked={draftIds.has(product.id)} disabled={Boolean(owner)} onChange={() => toggleProduct(product.id)} className="h-5 w-5 rounded border-slate-300 text-indigo-600" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{productLabel(product)}</span><span className="block truncate text-xs text-slate-500">{product.unit || "Chưa có ĐVT"}{product.categoryName ? ` · ${product.categoryName}` : ""}</span></span>{owner && <span className="max-w-36 rounded-lg bg-amber-100 px-2 py-1 text-right text-[11px] text-amber-800">Đang thuộc {owner}</span>}</label>;
            })}
            {filteredProducts.length === 0 && <div className="p-8 text-center text-sm text-slate-500">Không có sản phẩm phù hợp.</div>}
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-slate-200 bg-white/95 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:bg-gray-900/95">
        <div className="text-sm"><b>{draftIds.size} mã</b> trong danh sách{dirty && <span className="ml-2 text-amber-700">+{addedCount} thêm · -{removedCount} gỡ</span>}</div>
        <button type="button" disabled={!dirty || busy} onClick={() => void save()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />Lưu thay đổi</button>
      </div>

      {importOpen && <div className="border-t border-slate-200 bg-slate-50 p-4 dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-center justify-between gap-3"><div><h4 className="flex items-center gap-2 font-semibold"><FileSpreadsheet className="h-5 w-5 text-emerald-600" />Nhập nhiều nhân viên từ Excel</h4><p className="mt-1 text-xs text-slate-500">Chế độ gộp thêm; không xóa phân công hiện tại.</p></div><button type="button" onClick={() => { setImportOpen(false); setPreview(null); }} className="rounded-lg border px-3 py-2 text-sm">Đóng</button></div>
        {!preview && <button type="button" onClick={() => fileRef.current?.click()} className="mt-4 w-full rounded-xl border-2 border-dashed border-slate-300 p-6 text-sm font-medium hover:border-indigo-400">Chọn file .xlsx để xem trước</button>}
        {preview && <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border bg-white p-3"><p className="font-semibold">Nhóm sẽ gộp thêm</p><div className="mt-2 max-h-48 space-y-2 overflow-y-auto">{preview.summaries.map((item) => <div key={`${item.branchName}-${item.username}`} className="flex justify-between gap-3 rounded-lg bg-slate-50 p-2 text-sm"><span><b>{item.assigneeName}</b><br /><span className="text-xs text-slate-500">{item.username} · {item.branchName}</span></span><b>{item.productCount} mã</b></div>)}</div></div>
          <div className="space-y-3">
            {preview.errors.length > 0 && <IssueList title="Dòng chưa hợp lệ" items={preview.errors} />}
            {preview.duplicates.length > 0 && <IssueList title="Mã trùng trong file" items={preview.duplicates} />}
            {preview.conflicts.length > 0 && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><b>Mã đang thuộc nhân viên khác</b><ul className="mt-2 space-y-1">{preview.conflicts.map((item) => <li key={`${item.branchName}-${item.productId}`}>{item.code || "Không mã"} · {item.name} — {item.assigneeName}</li>)}</ul></div>}
            {preview.canApply && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"><Check className="mr-1 inline h-4 w-4" />Dữ liệu hợp lệ và sẵn sàng nhập.</div>}
          </div>
          <div className="flex gap-2 lg:col-span-2"><button type="button" onClick={() => fileRef.current?.click()} className="min-h-11 flex-1 rounded-xl border border-slate-300 px-4 text-sm font-medium">Chọn file khác</button><button type="button" disabled={!preview.canApply || busy} onClick={() => void applyImport()} className="min-h-11 flex-1 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50">Xác nhận gộp danh sách</button></div>
        </div>}
      </div>}
      {busy && <div className="fixed inset-x-0 bottom-5 z-50 mx-auto flex w-fit items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg"><Loader2 className="h-4 w-4 animate-spin" />Đang xử lý…</div>}
    </div>
  );
}

function IssueList({ title, items }: { title: string; items: ImportIssue[] }) {
  return <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><b>{title}</b><ul className="mt-2 max-h-36 space-y-1 overflow-y-auto">{items.map((item, index) => <li key={`${item.rowNumber}-${index}`}>Dòng {item.rowNumber}: {item.message}{item.value ? ` (${item.value})` : ""}</li>)}</ul></div>;
}
