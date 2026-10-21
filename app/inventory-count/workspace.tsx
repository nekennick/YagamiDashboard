"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Check, ClipboardPenLine, Loader2, Plus, RefreshCw, Send, ShieldCheck, Undo2 } from "lucide-react";

type Permission = "COUNT_EXECUTE" | "COUNT_MANAGE" | "COUNT_BALANCE";
type Line = {
  id: string;
  status: string;
  actualCount: string | null;
  systemOnHand: string | null;
  difference: string | null;
  product: { id: number; code: string | null; name: string; unit: string | null };
};
type Session = {
  id: string;
  status: string;
  note: string | null;
  submittedAt: string | null;
  branch: { id: number; name: string };
  assignee: { id: number; displayName: string };
  lines: Line[];
};
type Assignment = {
  id: string;
  branchId: number;
  productId: number;
  assigneeId: number;
  branch: { id: number; name: string };
  product: { id: number; code: string | null; name: string; unit: string | null };
  assignee: { id: number; displayName: string };
};
type ResourceData = {
  assignments: Assignment[];
  executors: Array<{ id: number; displayName: string }>;
  branches: Array<{ id: number; name: string }>;
  products: Array<{ id: number; code: string | null; name: string; unit: string | null }>;
};
type Batch = { id: string; status: string; branch: { name: string }; remoteCode: string | null; lines: Array<{ line: Line & { session: { id: string } } }> };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Không thể xử lý yêu cầu.");
  return data as T;
}

function quantity(value: string | null | number | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(Number(value));
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    IN_PROGRESS: "Đang kiểm", SUBMITTED: "Chờ duyệt", RETURNED: "Cần kiểm lại", APPROVED: "Đã duyệt", COMPLETED: "Hoàn tất",
    PENDING: "Chờ cân bằng", STALE: "Cần kiểm lại", BALANCED: "Đã cân bằng", FAILED_RETRYABLE: "Có thể thử lại", AWAITING_DECISION: "Chờ chọn"
  };
  return labels[status] || status;
}

export function InventoryCountWorkspace({ permissions }: { permissions: Permission[] }) {
  const canCount = permissions.includes("COUNT_EXECUTE");
  const canManage = permissions.includes("COUNT_MANAGE") || permissions.includes("COUNT_BALANCE");
  const canBalance = permissions.includes("COUNT_BALANCE");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [resources, setResources] = useState<ResourceData | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [readyLines, setReadyLines] = useState<Array<Line & { session: { id: string; branch: { id: number; name: string } } }>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedAssignments, setSelectedAssignments] = useState<string[]>([]);
  const [selectedLines, setSelectedLines] = useState<string[]>([]);
  const [assignmentForm, setAssignmentForm] = useState({ productId: "", branchId: "", assigneeId: "" });

  const refresh = async () => {
    setBusy(true);
    try {
      const sessionData = await request<{ sessions: Session[] }>("/api/inventory-count/sessions");
      setSessions(sessionData.sessions);
      if (canManage) {
        const [assignmentData, batchData] = await Promise.all([
          request<ResourceData>("/api/inventory-count/assignments"),
          request<{ batches: Batch[]; readyLines: Array<Line & { session: { id: string; branch: { id: number; name: string } } }> }>("/api/inventory-count/batches")
        ]);
        setResources(assignmentData);
        setBatches(batchData.batches);
        setReadyLines(batchData.readyLines);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tải dữ liệu.");
    } finally { setBusy(false); }
  };

  useEffect(() => { void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleSessions = useMemo(() => sessions.map((session) => ({ ...session, lines: session.lines.filter((line) => `${line.product.code || ""} ${line.product.name}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) })).filter((session) => session.lines.length > 0), [sessions, search]);

  async function saveCount(sessionId: string, lineId: string, rawValue: string) {
    if (rawValue.trim() === "0" && !window.confirm("Xác nhận số kiểm thực tế là 0?")) return;
    try {
      await request(`/api/inventory-count/sessions/${sessionId}`, { method: "PATCH", body: JSON.stringify({ lineId, actualCount: rawValue }) });
      setSessions((current) => current.map((session) => session.id !== sessionId ? session : ({ ...session, lines: session.lines.map((line) => line.id === lineId ? { ...line, actualCount: rawValue } : line) })));
      setMessage("Đã lưu số kiểm.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể lưu số kiểm."); }
  }

  async function submitSession(id: string) {
    if (!window.confirm("Gửi toàn bộ kết quả của phiên này để quản lý duyệt?")) return;
    setBusy(true);
    try { await request(`/api/inventory-count/sessions/${id}/submit`, { method: "POST" }); setMessage("Đã gửi phiên kiểm kho."); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không thể gửi phiên."); }
    finally { setBusy(false); }
  }

  async function reviewSession(id: string, action: "approve" | "return") {
    const reason = action === "return" ? window.prompt("Lý do trả lại phiên kiểm:") : undefined;
    if (action === "return" && !reason) return;
    setBusy(true);
    try { await request(`/api/inventory-count/sessions/${id}/review`, { method: "POST", body: JSON.stringify({ action, reason }) }); setMessage(action === "approve" ? "Đã duyệt phiên." : "Đã trả phiên để kiểm lại."); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không thể cập nhật phiên."); }
    finally { setBusy(false); }
  }

  async function createAssignment(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try { await request("/api/inventory-count/assignments", { method: "POST", body: JSON.stringify(assignmentForm) }); setAssignmentForm({ productId: "", branchId: "", assigneeId: "" }); setMessage("Đã phân công sản phẩm."); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không thể phân công."); }
    finally { setBusy(false); }
  }

  async function createSession() {
    if (!selectedAssignments.length) return setMessage("Chọn ít nhất một sản phẩm đã phân công.");
    if (!resources) return setMessage("Danh sách phân công chưa sẵn sàng.");
    const selected = resources.assignments.filter((item) => selectedAssignments.includes(item.id));
    const assigneeIds = new Set(selected.map((item) => item.assigneeId));
    const branchIds = new Set(selected.map((item) => item.branchId));
    if (assigneeIds.size !== 1 || branchIds.size !== 1) return setMessage("Một phiên chỉ gồm sản phẩm của một nhân viên tại một kho.");
    setBusy(true);
    try { await request("/api/inventory-count/sessions", { method: "POST", body: JSON.stringify({ branchId: selected[0]!.branchId, assigneeId: selected[0]!.assigneeId, productIds: selected.map((item) => item.productId) }) }); setSelectedAssignments([]); setMessage("Đã lập phiên kiểm kho."); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không thể lập phiên."); }
    finally { setBusy(false); }
  }

  async function createBatch() {
    if (!selectedLines.length) return setMessage("Chọn các dòng chênh lệch cần cân bằng.");
    const branchIds = new Set(readyLines.filter((line) => selectedLines.includes(line.id)).map((line) => line.session.branch.id));
    if (branchIds.size !== 1) return setMessage("Một lần cân bằng chỉ áp dụng cho một kho.");
    setBusy(true);
    try { await request("/api/inventory-count/batches", { method: "POST", body: JSON.stringify({ lineIds: selectedLines }) }); setSelectedLines([]); setMessage("Đã đưa dòng chênh vào danh sách chờ cân bằng."); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không thể tạo danh sách chờ."); }
    finally { setBusy(false); }
  }

  async function balanceBatch(batch: Batch) {
    if (!window.confirm(`Cân bằng ${batch.lines.length} mặt hàng tại ${batch.branch.name} lên KiotViet? Hệ thống sẽ kiểm tra lại biến động trước khi thực hiện.`)) return;
    setBusy(true);
    try { await request(`/api/inventory-count/batches/${batch.id}/balance`, { method: "POST" }); setMessage("Đã cân bằng kho và đồng bộ lại số liệu."); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Chưa thể cân bằng kho."); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-24">
      <header className="rounded-2xl bg-gradient-to-br from-indigo-700 to-violet-700 px-5 py-6 text-white shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><ClipboardPenLine className="h-6 w-6" /><h1 className="text-2xl font-bold">Kiểm kho</h1></div><p className="mt-2 max-w-xl text-sm text-indigo-100">Nhập số thực tế theo danh sách được phân công. Số tồn hệ thống chỉ hiển thị sau khi gửi phiên.</p></div><button type="button" className="rounded-xl bg-white/15 p-2 hover:bg-white/25" onClick={() => void refresh()} aria-label="Làm mới"><RefreshCw className={`h-5 w-5 ${busy ? "animate-spin" : ""}`} /></button></div>
      </header>
      {message && <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">{message}</div>}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <label className="text-sm font-medium">Tìm sản phẩm trong các phiên của bạn</label><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tên hoặc mã hàng" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
      </section>
      <section className="space-y-4">
        {visibleSessions.map((session) => <article key={session.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"><div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 dark:border-gray-800"><div><p className="font-semibold">{session.branch.name}</p><p className="mt-1 text-xs text-slate-500">{session.assignee.displayName} · {session.lines.length} mặt hàng</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{statusLabel(session.status)}</span></div><div className="divide-y divide-slate-100 dark:divide-gray-800">{session.lines.map((line) => <div className="grid grid-cols-[1fr_112px] gap-3 px-4 py-4" key={line.id}><div><p className="font-medium">{line.product.name}</p><p className="mt-1 text-xs text-slate-500">{line.product.code || "—"} · {line.product.unit || "ĐVT chưa có"}{session.status !== "IN_PROGRESS" && line.systemOnHand !== null ? ` · Tồn hệ thống: ${quantity(line.systemOnHand)}` : ""}</p>{line.difference !== null && <p className="mt-1 text-xs font-medium text-amber-700">Chênh lệch: {quantity(line.difference)}</p>}</div><input disabled={!canCount || !["IN_PROGRESS", "RETURNED", "DRAFT"].includes(session.status)} type="text" inputMode="decimal" defaultValue={line.actualCount ?? ""} onBlur={(event) => void saveCount(session.id, line.id, event.target.value)} placeholder="SL thực tế" className="h-11 rounded-xl border border-slate-300 px-3 text-right font-semibold outline-none focus:border-indigo-500 disabled:bg-slate-100" /></div>)}</div>{canCount && ["IN_PROGRESS", "RETURNED", "DRAFT"].includes(session.status) && <div className="sticky bottom-0 border-t border-slate-100 bg-white/95 p-3 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95"><button className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60" disabled={busy} onClick={() => void submitSession(session.id)} type="button"><Send className="h-4 w-4" />Gửi kết quả phiên</button></div>}{canManage && session.status === "SUBMITTED" && <div className="grid grid-cols-2 gap-3 p-3"><button className="rounded-xl border border-amber-300 py-2.5 text-sm font-medium text-amber-800" onClick={() => void reviewSession(session.id, "return")} type="button"><Undo2 className="mr-1 inline h-4 w-4" />Trả lại</button><button className="rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white" onClick={() => void reviewSession(session.id, "approve")} type="button"><Check className="mr-1 inline h-4 w-4" />Duyệt</button></div>}</article>)}
        {!busy && visibleSessions.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Chưa có phiên kiểm kho phù hợp.</div>}
      </section>
      {canManage && resources && <section className="space-y-5 border-t border-slate-200 pt-6"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-indigo-600" /><h2 className="text-lg font-bold">Quản lý kiểm kho</h2></div><div className="grid gap-5 lg:grid-cols-2"><form onSubmit={createAssignment} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"><h3 className="font-semibold">Phân công sản phẩm</h3><div className="mt-3 grid gap-3"><select required value={assignmentForm.productId} onChange={(event) => setAssignmentForm({ ...assignmentForm, productId: event.target.value })} className="rounded-xl border p-3"><option value="">Chọn sản phẩm</option>{resources.products.map((item) => <option key={item.id} value={item.id}>{item.code ? `${item.code} · ` : ""}{item.name}</option>)}</select><select required value={assignmentForm.branchId} onChange={(event) => setAssignmentForm({ ...assignmentForm, branchId: event.target.value })} className="rounded-xl border p-3"><option value="">Chọn kho</option>{resources.branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select required value={assignmentForm.assigneeId} onChange={(event) => setAssignmentForm({ ...assignmentForm, assigneeId: event.target.value })} className="rounded-xl border p-3"><option value="">Chọn nhân viên</option>{resources.executors.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select><button disabled={busy} className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white" type="submit"><Plus className="mr-1 inline h-4 w-4" />Lưu phân công</button></div></form><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"><h3 className="font-semibold">Lập phiên kiểm kho</h3><p className="mt-1 text-xs text-slate-500">Chọn các sản phẩm cùng kho và cùng nhân viên.</p><div className="mt-3 max-h-60 space-y-2 overflow-y-auto">{resources.assignments.map((item) => <label className="flex items-start gap-2 rounded-lg p-2 hover:bg-slate-50" key={item.id}><input type="checkbox" checked={selectedAssignments.includes(item.id)} onChange={() => setSelectedAssignments((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /><span className="text-sm"><b>{item.product.name}</b><br /><span className="text-xs text-slate-500">{item.branch.name} · {item.assignee.displayName}</span></span></label>)}</div><button disabled={busy} className="mt-3 w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white" onClick={() => void createSession()} type="button">Lập phiên từ mục đã chọn</button></div></div><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"><h3 className="font-semibold">Dòng chênh đã duyệt</h3><div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{readyLines.map((line) => <label className="flex items-center justify-between gap-3 rounded-lg p-2 hover:bg-slate-50" key={line.id}><span className="flex gap-2"><input type="checkbox" checked={selectedLines.includes(line.id)} onChange={() => setSelectedLines((current) => current.includes(line.id) ? current.filter((id) => id !== line.id) : [...current, line.id])} /><span className="text-sm"><b>{line.product.name}</b><br /><span className="text-xs text-slate-500">{line.session.branch.name} · Chênh {quantity(line.difference)}</span></span></span></label>)}{readyLines.length === 0 && <p className="py-4 text-sm text-slate-500">Không có dòng chênh lệch đang chờ chọn.</p>}</div><button disabled={busy || !selectedLines.length} className="mt-3 w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void createBatch()} type="button">Đưa vào danh sách chờ cân bằng</button></div><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"><h3 className="font-semibold">Danh sách chờ cân bằng</h3><div className="mt-3 space-y-3">{batches.map((batch) => <div className="rounded-xl bg-slate-50 p-3" key={batch.id}><p className="font-medium">{batch.branch.name} · {batch.lines.length} mặt hàng</p><p className="mt-1 text-xs text-slate-500">{statusLabel(batch.status)}{batch.remoteCode ? ` · ${batch.remoteCode}` : ""}</p>{canBalance && ["PENDING", "FAILED_RETRYABLE"].includes(batch.status) && <button className="mt-3 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white" disabled={busy} onClick={() => void balanceBatch(batch)} type="button">Cân bằng lên KiotViet</button>}</div>)}{batches.length === 0 && <p className="py-4 text-sm text-slate-500">Chưa có danh sách chờ.</p>}</div></div></section>}
      {busy && <div className="fixed inset-x-0 bottom-5 z-50 mx-auto flex w-fit items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg"><Loader2 className="h-4 w-4 animate-spin" />Đang xử lý…</div>}
    </div>
  );
}
