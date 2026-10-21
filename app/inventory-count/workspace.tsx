"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardPenLine,
  Clock,
  History,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Undo2
} from "lucide-react";
import { InventoryAssignmentManager, type AssignmentResources } from "@/app/inventory-count/assignment-manager";

type Permission = "COUNT_EXECUTE" | "COUNT_MANAGE" | "COUNT_BALANCE";
type Line = {
  id: string;
  status: string;
  actualCount: string | null;
  systemOnHandAtSubmit?: string | null;
  systemOnHand?: string | null;
  difference: string | null;
  resolutionReason?: string | null;
  product: { id: number; code: string | null; name: string; unit: string | null };
};
type Session = {
  id: string;
  status: string;
  note: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  returnReason?: string | null;
  branch: { id: number; name: string };
  assignee: { id: number; displayName: string };
  lines: Line[];
};
type ResourceData = AssignmentResources;
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
    IN_PROGRESS: "Đang kiểm",
    SUBMITTED: "Chờ duyệt",
    RETURNED: "Cần kiểm lại",
    APPROVED: "Đã duyệt",
    COMPLETED: "Hoàn tất",
    CANCELLED: "Đã huỷ",
    PENDING: "Chờ cân bằng",
    STALE: "Cần kiểm lại",
    BALANCED: "Đã cân bằng",
    FAILED_RETRYABLE: "Có thể thử lại",
    AWAITING_DECISION: "Chờ chọn"
  };
  return labels[status] || status;
}

function getStatusBadgeClass(status: string) {
  switch (status) {
    case "IN_PROGRESS":
      return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300";
    case "SUBMITTED":
      return "bg-amber-100 text-amber-900 border border-amber-200 dark:bg-amber-950 dark:text-amber-200";
    case "RETURNED":
      return "bg-rose-100 text-rose-800 border border-rose-200 font-semibold dark:bg-rose-950 dark:text-rose-200";
    case "APPROVED":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
    case "COMPLETED":
      return "bg-slate-100 text-slate-700 dark:bg-gray-800 dark:text-slate-300";
    case "CANCELLED":
      return "bg-gray-100 text-gray-500 line-through dark:bg-gray-800 dark:text-gray-400";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function InventoryCountWorkspace({ permissions, isAdmin }: { permissions: Permission[]; isAdmin: boolean }) {
  const canCount = permissions.includes("COUNT_EXECUTE");
  const canManage = permissions.includes("COUNT_MANAGE") || permissions.includes("COUNT_BALANCE");
  const canBalance = permissions.includes("COUNT_BALANCE");

  const [actorId, setActorId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [resources, setResources] = useState<ResourceData | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [readyLines, setReadyLines] = useState<Array<Line & { session: { id: string; branch: { id: number; name: string } } }>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sessionBranchId, setSessionBranchId] = useState(0);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<number[]>([]);
  const [selectedLines, setSelectedLines] = useState<string[]>([]);

  // Tab states:
  // For Employee: "todo" (active counting) vs "history" (submitted / approved)
  const [employeeTab, setEmployeeTab] = useState<"todo" | "history">("todo");
  // For Manager: "pending" (waiting for review) vs "in_progress" vs "done" vs "my_tasks" vs "all"
  const [managerTab, setManagerTab] = useState<"pending" | "in_progress" | "done" | "my_tasks" | "all">("pending");

  const refresh = async () => {
    setBusy(true);
    try {
      const sessionData = await request<{ sessions: Session[]; actorId?: number }>("/api/inventory-count/sessions");
      setSessions(sessionData.sessions);
      if (sessionData.actorId) {
        setActorId(sessionData.actorId);
      }
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
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const defaultSessionBranchId = useMemo(() => {
    const branch = resources?.branches.find((item) => {
      const name = item.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLocaleLowerCase("vi-VN");
      return name.includes("tong kho yagami") && !name.includes("binh duong");
    });
    return branch?.id ?? resources?.branches[0]?.id ?? 0;
  }, [resources?.branches]);

  useEffect(() => {
    if (!sessionBranchId && defaultSessionBranchId) setSessionBranchId(defaultSessionBranchId);
  }, [sessionBranchId, defaultSessionBranchId]);

  const sessionExecutors = useMemo(() => {
    return resources?.executors.filter((user) =>
      resources.assignments.some(
        (assignment) => assignment.branchId === sessionBranchId && assignment.assigneeId === user.id
      )
    ) ?? [];
  }, [resources, sessionBranchId]);

  const executorStats = useMemo(() => {
    const map = new Map<number, { productCount: number; hasActiveSession: boolean }>();
    for (const user of sessionExecutors) {
      const productCount = resources?.assignments.filter(
        (a) => a.branchId === sessionBranchId && a.assigneeId === user.id
      ).length ?? 0;
      const hasActiveSession = sessions.some(
        (s) => s.branch.id === sessionBranchId && s.assignee.id === user.id && !["COMPLETED", "CANCELLED"].includes(s.status)
      );
      map.set(user.id, { productCount, hasActiveSession });
    }
    return map;
  }, [sessionExecutors, resources?.assignments, sessionBranchId, sessions]);

  // When sessionBranchId changes or sessionExecutors change, select all available executors who have assigned products and no active sessions
  useEffect(() => {
    const available = sessionExecutors
      .filter((user) => {
        const stats = executorStats.get(user.id);
        return stats && stats.productCount > 0 && !stats.hasActiveSession;
      })
      .map((user) => user.id);
    setSelectedAssigneeIds(available);
  }, [sessionBranchId, sessionExecutors]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalSelectedProducts = useMemo(() => {
    return selectedAssigneeIds.reduce((total, id) => {
      return total + (executorStats.get(id)?.productCount ?? 0);
    }, 0);
  }, [selectedAssigneeIds, executorStats]);

  function toggleAssignee(id: number) {
    setSelectedAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function selectAllAssignees() {
    const available = sessionExecutors
      .filter((user) => !executorStats.get(user.id)?.hasActiveSession)
      .map((user) => user.id);
    setSelectedAssigneeIds(available);
  }

  function deselectAllAssignees() {
    setSelectedAssigneeIds([]);
  }

  // Tab categorization for Employee:
  const todoSessions = useMemo(() => sessions.filter((s) => ["IN_PROGRESS", "RETURNED", "DRAFT"].includes(s.status)), [sessions]);
  const historySessions = useMemo(() => sessions.filter((s) => ["SUBMITTED", "APPROVED", "COMPLETED", "CANCELLED"].includes(s.status)), [sessions]);

  // Tab categorization for Manager:
  const pendingSessions = useMemo(() => sessions.filter((s) => s.status === "SUBMITTED"), [sessions]);
  const inProgressSessions = useMemo(() => sessions.filter((s) => ["IN_PROGRESS", "RETURNED", "DRAFT"].includes(s.status)), [sessions]);
  const doneSessions = useMemo(() => sessions.filter((s) => ["APPROVED", "COMPLETED", "CANCELLED"].includes(s.status)), [sessions]);
  const myAssignedSessions = useMemo(() => sessions.filter((s) => actorId !== null && s.assignee.id === actorId), [sessions, actorId]);

  // Active sessions based on role and tab selection
  const targetSessions = useMemo(() => {
    if (!canManage) {
      return employeeTab === "todo" ? todoSessions : historySessions;
    }
    switch (managerTab) {
      case "pending":
        return pendingSessions;
      case "in_progress":
        return inProgressSessions;
      case "done":
        return doneSessions;
      case "my_tasks":
        return myAssignedSessions;
      case "all":
      default:
        return sessions;
    }
  }, [canManage, employeeTab, managerTab, todoSessions, historySessions, pendingSessions, inProgressSessions, doneSessions, myAssignedSessions, sessions]);

  // Apply search query within selected tab
  const visibleSessions = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    if (!q) return targetSessions;
    return targetSessions
      .map((session) => ({
        ...session,
        lines: session.lines.filter((line) => `${line.product.code || ""} ${line.product.name}`.toLocaleLowerCase().includes(q))
      }))
      .filter((session) => session.lines.length > 0);
  }, [targetSessions, search]);

  async function saveCount(sessionId: string, lineId: string, rawValue: string) {
    if (rawValue.trim() === "0" && !window.confirm("Xác nhận số kiểm thực tế là 0?")) return;
    try {
      await request(`/api/inventory-count/sessions/${sessionId}`, { method: "PATCH", body: JSON.stringify({ lineId, actualCount: rawValue }) });
      setSessions((current) => current.map((session) => session.id !== sessionId ? session : ({ ...session, lines: session.lines.map((line) => line.id === lineId ? { ...line, actualCount: rawValue } : line) })));
      setMessage("Đã lưu số kiểm.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể lưu số kiểm.");
    }
  }

  async function submitSession(id: string) {
    if (!window.confirm("Gửi kết quả của phiên này cho quản lý duyệt? Sau khi gửi, phiên sẽ được chuyển sang giao diện quản lý.")) return;
    setBusy(true);
    try {
      await request(`/api/inventory-count/sessions/${id}/submit`, { method: "POST" });
      setMessage("Đã gửi kết quả phiên kiểm kho thành công. Phiên đã được chuyển sang giao diện quản lý.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể gửi phiên.");
    } finally {
      setBusy(false);
    }
  }

  async function reviewSession(id: string, action: "approve" | "return", line?: Line) {
    let reason: string | undefined = undefined;
    if (action === "return") {
      const promptText = line
        ? `Nhập lý do trả lại mặt hàng "${line.product.name}" để nhân viên kiểm lại:`
        : "Nhập lý do trả lại toàn bộ phiên kiểm kê:";
      const input = window.prompt(promptText);
      if (input === null) return;
      if (!input.trim()) {
        window.alert("Vui lòng nhập lý do trả lại để nhân viên biết nguyên nhân.");
        return;
      }
      reason = input.trim();
    }
    setBusy(true);
    try {
      await request(`/api/inventory-count/sessions/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ action, decision: action, reason, lineId: line?.id })
      });
      setMessage(
        action === "approve"
          ? "Đã duyệt phiên kiểm kho thành công."
          : line
          ? `Đã trả lại mặt hàng "${line.product.name}" sang giao diện nhân viên để kiểm lại.`
          : "Đã trả lại toàn bộ phiên sang giao diện nhân viên để kiểm lại."
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể cập nhật phiên.");
    } finally {
      setBusy(false);
    }
  }

  async function createSession() {
    if (!resources) return setMessage("Danh sách phân công chưa sẵn sàng.");
    if (!sessionBranchId) return setMessage("Chọn kho để lập phiên.");
    if (selectedAssigneeIds.length === 0) return setMessage("Vui lòng tích chọn ít nhất một nhân viên.");
    setBusy(true);
    try {
      const res = await request<{ createdCount?: number }>("/api/inventory-count/sessions", {
        method: "POST",
        body: JSON.stringify({ branchId: sessionBranchId, assigneeIds: selectedAssigneeIds })
      });
      const count = res.createdCount ?? selectedAssigneeIds.length;
      setMessage(`Đã lập thành công ${count} phiên kiểm kho cho các nhân viên đã chọn.`);
      setSelectedAssigneeIds([]);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể lập phiên.");
    } finally {
      setBusy(false);
    }
  }

  async function closeSession(id: string) {
    if (!window.confirm("Kết thúc phiên này? Các số kiểm chưa được cân bằng sẽ không còn được dùng và phiên sẽ không thể mở lại.")) return;
    setBusy(true);
    try {
      await request(`/api/inventory-count/sessions/${id}/close`, { method: "POST" });
      setMessage("Đã kết thúc phiên kiểm kho.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể kết thúc phiên.");
    } finally {
      setBusy(false);
    }
  }

  async function createBatch() {
    if (!selectedLines.length) return setMessage("Chọn các dòng chênh lệch cần cân bằng.");
    const branchIds = new Set(readyLines.filter((line) => selectedLines.includes(line.id)).map((line) => line.session.branch.id));
    if (branchIds.size !== 1) return setMessage("Một lần cân bằng chỉ áp dụng cho một kho.");
    setBusy(true);
    try {
      await request("/api/inventory-count/batches", { method: "POST", body: JSON.stringify({ lineIds: selectedLines }) });
      setSelectedLines([]);
      setMessage("Đã đưa dòng chênh vào danh sách chờ cân bằng.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tạo danh sách chờ.");
    } finally {
      setBusy(false);
    }
  }

  async function balanceBatch(batch: Batch) {
    if (!window.confirm(`Cân bằng ${batch.lines.length} mặt hàng tại ${batch.branch.name} lên KiotViet? Hệ thống sẽ kiểm tra lại biến động trước khi thực hiện.`)) return;
    setBusy(true);
    try {
      await request(`/api/inventory-count/batches/${batch.id}/balance`, { method: "POST" });
      setMessage("Đã cân bằng kho và đồng bộ lại số liệu.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Chưa thể cân bằng kho.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-24">
      {/* Top Header */}
      <header className="rounded-2xl bg-gradient-to-br from-indigo-700 to-violet-700 px-5 py-6 text-white shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardPenLine className="h-6 w-6" />
              <h1 className="text-2xl font-bold">Kiểm kho</h1>
            </div>
            <p className="mt-2 max-w-xl text-sm text-indigo-100">
              {canManage
                ? "Quản lý phiên kiểm kho, xét duyệt kết quả từ nhân viên và đẩy cân bằng số liệu."
                : "Nhập số thực tế theo danh sách được phân công. Sau khi gửi, kết quả sẽ chuyển sang giao diện quản lý để duyệt."}
            </p>
          </div>
          <button
            type="button"
            className="rounded-xl bg-white/15 p-2 hover:bg-white/25 transition"
            onClick={() => void refresh()}
            aria-label="Làm mới"
          >
            <RefreshCw className={`h-5 w-5 ${busy ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {/* Alert Notification */}
      {message && (
        <div className="flex items-center justify-between rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 shadow-sm dark:border-indigo-900/40 dark:bg-indigo-950/40 dark:text-indigo-200">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage(null)} className="text-xs font-semibold hover:underline">Đóng</button>
        </div>
      )}

      {/* Role Navigation Tabs */}
      {!canManage ? (
        // Employee Tab Bar
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2 dark:border-gray-800">
          <button
            type="button"
            onClick={() => setEmployeeTab("todo")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              employeeTab === "todo"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-slate-300"
            }`}
          >
            <ClipboardPenLine className="h-4 w-4" />
            <span>Cần kiểm kê</span>
            {todoSessions.length > 0 && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${employeeTab === "todo" ? "bg-white/20 text-white" : "bg-indigo-100 text-indigo-700"}`}>
                {todoSessions.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setEmployeeTab("history")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              employeeTab === "history"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-slate-300"
            }`}
          >
            <History className="h-4 w-4" />
            <span>Đã gửi & Lịch sử</span>
            {historySessions.length > 0 && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${employeeTab === "history" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"}`}>
                {historySessions.length}
              </span>
            )}
          </button>
        </div>
      ) : (
        // Manager Tab Bar
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2 dark:border-gray-800">
          <button
            type="button"
            onClick={() => setManagerTab("pending")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              managerTab === "pending"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-slate-300"
            }`}
          >
            <Clock className="h-4 w-4" />
            <span>Chờ duyệt</span>
            {pendingSessions.length > 0 && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${managerTab === "pending" ? "bg-amber-300 text-amber-950" : "bg-amber-200 text-amber-900"}`}>
                {pendingSessions.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setManagerTab("in_progress")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              managerTab === "in_progress"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-slate-300"
            }`}
          >
            <ClipboardPenLine className="h-4 w-4" />
            <span>Đang kiểm & Trả lại</span>
            {inProgressSessions.length > 0 && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${managerTab === "in_progress" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"}`}>
                {inProgressSessions.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setManagerTab("done")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              managerTab === "done"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-slate-300"
            }`}
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Đã duyệt & Hoàn tất</span>
            {doneSessions.length > 0 && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${managerTab === "done" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"}`}>
                {doneSessions.length}
              </span>
            )}
          </button>
          {myAssignedSessions.length > 0 && (
            <button
              type="button"
              onClick={() => setManagerTab("my_tasks")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                managerTab === "my_tasks"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-slate-300"
              }`}
            >
              <Sparkles className="h-4 w-4" />
              <span>Phiên tôi kiểm ({myAssignedSessions.length})</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setManagerTab("all")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              managerTab === "all"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-slate-300"
            }`}
          >
            <span>Tất cả ({sessions.length})</span>
          </button>
        </div>
      )}

      {/* Search Input */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Tìm kiếm sản phẩm trong danh sách</label>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Nhập tên hoặc mã sản phẩm…"
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />
      </section>

      {/* Sessions List */}
      <section className="space-y-4">
        {visibleSessions.map((session) => {
          const isAssignee = actorId ? session.assignee.id === actorId : true;
          const showSubmitButton = canCount && isAssignee && ["IN_PROGRESS", "RETURNED", "DRAFT"].includes(session.status);

          return (
            <article key={session.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              {/* Card Header */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 dark:border-gray-800">
                <div>
                  <p className="font-bold text-base text-slate-900 dark:text-white">{session.branch.name}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Người kiểm: <span className="font-medium text-slate-700 dark:text-slate-300">{session.assignee.displayName}</span> · {session.lines.length} mặt hàng
                    {session.submittedAt && ` · Gửi lúc: ${new Date(session.submittedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClass(session.status)}`}>
                    {statusLabel(session.status)}
                  </span>
                  {isAdmin && !["COMPLETED", "CANCELLED"].includes(session.status) && (
                    <button
                      className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
                      disabled={busy}
                      onClick={() => void closeSession(session.id)}
                      type="button"
                    >
                      Kết thúc phiên
                    </button>
                  )}
                </div>
              </div>

              {/* Warning Banner if Session is RETURNED */}
              {session.status === "RETURNED" && (
                <div className="flex items-start gap-2.5 border-b border-amber-200 bg-amber-50/90 px-4 py-3 text-amber-900 dark:border-amber-800/40 dark:bg-amber-950/40 dark:text-amber-200">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
                  <div className="text-sm">
                    <span className="font-bold">Quản lý yêu cầu kiểm lại:</span>{" "}
                    <span>{session.returnReason || "Vui lòng đếm lại số lượng mặt hàng được đánh dấu bên dưới."}</span>
                  </div>
                </div>
              )}

              {/* Line Items List */}
              <div className="divide-y divide-slate-100 dark:divide-gray-800">
                {session.lines.map((line) => {
                  const editable = canCount && isAssignee && (
                    ["IN_PROGRESS", "DRAFT"].includes(session.status) ||
                    (session.status === "RETURNED" && line.status === "COUNTING")
                  );
                  const isReturnedLine = session.status === "RETURNED" && line.status === "COUNTING";
                  const systemOnHand = line.systemOnHandAtSubmit ?? line.systemOnHand;
                  const diffNumber = line.difference !== null && line.difference !== undefined ? Number(line.difference) : null;

                  return (
                    <div
                      key={line.id}
                      className={`grid grid-cols-[1fr_120px] items-center gap-3 px-4 py-3.5 transition ${
                        isReturnedLine ? "bg-amber-50/70 dark:bg-amber-950/20" : ""
                      }`}
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-800 dark:text-slate-100">{line.product.name}</p>
                          {isReturnedLine && (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-200/80 px-2 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                              <AlertTriangle className="h-3 w-3" /> Cần kiểm lại
                            </span>
                          )}
                          {session.status === "RETURNED" && !isReturnedLine && (
                            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-gray-800 dark:text-slate-400">
                              <Check className="h-3 w-3 text-emerald-600" /> Đã kiểm
                            </span>
                          )}
                        </div>

                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {line.product.code || "—"} · {line.product.unit || "ĐVT chưa có"}
                          {session.status !== "IN_PROGRESS" && systemOnHand !== null && systemOnHand !== undefined
                            ? ` · Tồn hệ thống lúc gửi: ${quantity(systemOnHand)}`
                            : ""}
                        </p>

                        {/* Difference display */}
                        {diffNumber !== null && (
                          <div className="mt-1 flex items-center gap-2 text-xs">
                            <span className="font-medium text-slate-600 dark:text-slate-400">Chênh lệch:</span>
                            {diffNumber === 0 ? (
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">0 (Khớp tồn)</span>
                            ) : diffNumber > 0 ? (
                              <span className="font-semibold text-amber-600 dark:text-amber-400">+{quantity(diffNumber)} (Dư)</span>
                            ) : (
                              <span className="font-semibold text-rose-600 dark:text-rose-400">{quantity(diffNumber)} (Thiếu)</span>
                            )}
                          </div>
                        )}

                        {/* Line specific return reason if available */}
                        {line.resolutionReason && (
                          <p className="mt-1 text-xs text-amber-800 italic dark:text-amber-300">
                            Ghi chú kiểm lại: {line.resolutionReason}
                          </p>
                        )}

                        {/* Manager Return Single Item Button */}
                        {canManage && session.status === "SUBMITTED" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void reviewSession(session.id, "return", line)}
                            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-800 hover:text-amber-950 underline underline-offset-2 dark:text-amber-400"
                          >
                            <Undo2 className="h-3.5 w-3.5" /> Trả lại mặt hàng này
                          </button>
                        )}
                      </div>

                      {/* Actual Count Input */}
                      <div>
                        <input
                          disabled={!editable}
                          type="text"
                          inputMode="decimal"
                          value={line.actualCount ?? ""}
                          onChange={(event) =>
                            setSessions((current) =>
                              current.map((item) =>
                                item.id !== session.id
                                  ? item
                                  : {
                                      ...item,
                                      lines: item.lines.map((currentLine) =>
                                        currentLine.id === line.id ? { ...currentLine, actualCount: event.target.value } : currentLine
                                      )
                                    }
                              )
                            )
                          }
                          onBlur={(event) => {
                            if (editable) void saveCount(session.id, line.id, event.target.value);
                          }}
                          placeholder={isReturnedLine ? "SL kiểm lại" : "SL thực tế"}
                          className={`h-11 w-full rounded-xl border px-3 text-right font-semibold outline-none transition disabled:bg-slate-100 disabled:text-slate-600 dark:disabled:bg-gray-800 dark:disabled:text-slate-400 ${
                            isReturnedLine
                              ? "border-amber-400 bg-white ring-2 ring-amber-100 focus:border-amber-600 dark:bg-gray-900"
                              : "border-slate-300 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-gray-700 dark:bg-gray-800"
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Submit Button for Employee */}
              {showSubmitButton && (
                <div className="sticky bottom-0 border-t border-slate-100 bg-white/95 p-3.5 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
                  <button
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700 active:scale-[0.99] transition disabled:opacity-60"
                    disabled={busy}
                    onClick={() => void submitSession(session.id)}
                    type="button"
                  >
                    <Send className="h-4 w-4" />
                    {session.status === "RETURNED" ? "Gửi lại kết quả phiên kiểm kho" : "Gửi kết quả phiên cho quản lý duyệt"}
                  </button>
                </div>
              )}

              {/* Review Buttons for Manager */}
              {canManage && session.status === "SUBMITTED" && (
                <div className="grid grid-cols-2 gap-3 border-t border-slate-100 p-3.5 dark:border-gray-800">
                  <button
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100 transition dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                    onClick={() => void reviewSession(session.id, "return")}
                    type="button"
                    disabled={busy}
                  >
                    <Undo2 className="h-4 w-4" /> Trả toàn phiên
                  </button>
                  <button
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.99] transition disabled:opacity-60"
                    onClick={() => void reviewSession(session.id, "approve")}
                    type="button"
                    disabled={busy}
                  >
                    <Check className="h-4 w-4" /> Duyệt phiên
                  </button>
                </div>
              )}
            </article>
          );
        })}

        {/* Empty States */}
        {!busy && visibleSessions.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
            {!canManage && employeeTab === "todo" ? (
              <div className="mx-auto max-w-md space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Đã gửi hết kết quả kiểm kho!</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Bạn không còn mặt hàng nào cần kiểm kê. Toàn bộ phiên kiểm đã được chuyển sang giao diện quản lý để duyệt.
                </p>
                {historySessions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setEmployeeTab("history")}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-800 dark:text-slate-200"
                  >
                    <History className="h-4 w-4" /> Xem lịch sử các phiên đã gửi ({historySessions.length})
                  </button>
                )}
              </div>
            ) : canManage && managerTab === "pending" ? (
              <div className="mx-auto max-w-md space-y-2">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
                  <Clock className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Không có phiên nào đang chờ duyệt</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Các phiên gửi từ nhân viên sẽ xuất hiện ở đây để bạn xét duyệt hoặc trả lại kiểm kê.
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">Không có phiên kiểm kho phù hợp với điều kiện tìm kiếm.</p>
            )}
          </div>
        )}
      </section>

      {/* Manager Assignment & Balancing Controls */}
      {canManage && resources && (
        <section className="space-y-5 border-t border-slate-200 pt-6 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-bold">Quản lý kiểm kho</h2>
          </div>
          <InventoryAssignmentManager resources={resources} onChanged={refresh} />
          <div className="grid gap-5 lg:grid-cols-3">
            {/* Create Session Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <h3 className="font-semibold text-slate-900 dark:text-white">Lập phiên kiểm kho</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Chọn kho và các nhân viên; phiên sẽ gồm toàn bộ mã được phân công của từng nhân viên.
              </p>

              <label className="mt-3 block text-xs font-semibold text-slate-600 dark:text-slate-400">Kho</label>
              <select
                value={sessionBranchId}
                onChange={(event) => setSessionBranchId(Number(event.target.value))}
                className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                {resources.branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>

              {/* Multi-employee Checkbox Selector */}
              <div className="mt-3.5 flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Nhân viên ({selectedAssigneeIds.length}/{sessionExecutors.length})
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={selectAllAssignees}
                    className="font-medium text-indigo-600 hover:text-indigo-800 hover:underline dark:text-indigo-400"
                  >
                    Chọn tất cả
                  </button>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={deselectAllAssignees}
                    className="font-medium text-slate-500 hover:text-slate-700 hover:underline dark:text-slate-400"
                  >
                    Bỏ chọn
                  </button>
                </div>
              </div>

              <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/60 p-2 dark:border-gray-800 dark:bg-gray-950/40">
                {sessionExecutors.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400">Kho này chưa có nhân viên được phân công sản phẩm.</p>
                ) : (
                  sessionExecutors.map((user) => {
                    const stats = executorStats.get(user.id);
                    const productCount = stats?.productCount ?? 0;
                    const hasActive = stats?.hasActiveSession ?? false;
                    const isSelected = selectedAssigneeIds.includes(user.id);

                    return (
                      <label
                        key={user.id}
                        className={`flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm transition select-none ${
                          hasActive
                            ? "bg-slate-100/60 opacity-60 dark:bg-gray-800/40 cursor-not-allowed"
                            : isSelected
                            ? "bg-indigo-50/80 border border-indigo-200 text-indigo-950 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-200 cursor-pointer"
                            : "bg-white hover:bg-slate-100 border border-transparent dark:bg-gray-900 dark:hover:bg-gray-800/80 cursor-pointer"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            disabled={hasActive}
                            checked={isSelected}
                            onChange={() => toggleAssignee(user.id)}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="truncate font-medium">{user.displayName}</span>
                        </div>

                        <div className="shrink-0 flex items-center gap-1.5 text-xs">
                          {hasActive ? (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              Đang có phiên
                            </span>
                          ) : (
                            <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                              isSelected ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300" : "bg-slate-200 text-slate-700 dark:bg-gray-800 dark:text-slate-300"
                            }`}>
                              {productCount} mã
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })
                )}
              </div>

              <div className="mt-3 rounded-xl bg-indigo-50 px-3.5 py-2.5 text-xs text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">
                {selectedAssigneeIds.length > 0 ? (
                  <p>
                    Đã chọn <b>{selectedAssigneeIds.length}</b> nhân viên (tổng <b>{totalSelectedProducts}</b> lượt mã sẽ lập phiên).
                  </p>
                ) : (
                  <p className="text-slate-500 dark:text-slate-400">Tích chọn các nhân viên cần lập phiên kiểm kho.</p>
                )}
              </div>

              <button
                disabled={busy || selectedAssigneeIds.length === 0}
                className="mt-3 w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => void createSession()}
                type="button"
              >
                {selectedAssigneeIds.length > 1
                  ? `Lập ${selectedAssigneeIds.length} phiên cho các nhân viên đã chọn`
                  : selectedAssigneeIds.length === 1
                  ? "Lập phiên cho 1 nhân viên đã chọn"
                  : "Chọn nhân viên để lập phiên"}
              </button>
            </div>

            {/* Approved Differences Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <h3 className="font-semibold">Dòng chênh đã duyệt</h3>
              <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                {readyLines.map((line) => (
                  <label className="flex items-center justify-between gap-3 rounded-lg p-2 hover:bg-slate-50 dark:hover:bg-gray-800" key={line.id}>
                    <span className="flex gap-2">
                      <input
                        type="checkbox"
                        checked={selectedLines.includes(line.id)}
                        onChange={() => setSelectedLines((current) => current.includes(line.id) ? current.filter((id) => id !== line.id) : [...current, line.id])}
                      />
                      <span className="text-sm">
                        <b>{line.product.name}</b>
                        <br />
                        <span className="text-xs text-slate-500">{line.session.branch.name} · Chênh {quantity(line.difference)}</span>
                      </span>
                    </span>
                  </label>
                ))}
                {readyLines.length === 0 && <p className="py-4 text-sm text-slate-500">Không có dòng chênh lệch đang chờ chọn.</p>}
              </div>
              <button
                disabled={busy || !selectedLines.length}
                className="mt-3 w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
                onClick={() => void createBatch()}
                type="button"
              >
                Đưa vào danh sách chờ cân bằng
              </button>
            </div>

            {/* Balancing Batches Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <h3 className="font-semibold">Danh sách chờ cân bằng</h3>
              <div className="mt-3 space-y-3">
                {batches.map((batch) => (
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-gray-800" key={batch.id}>
                    <p className="font-medium">{batch.branch.name} · {batch.lines.length} mặt hàng</p>
                    <p className="mt-1 text-xs text-slate-500">{statusLabel(batch.status)}{batch.remoteCode ? ` · ${batch.remoteCode}` : ""}</p>
                    {canBalance && ["PENDING", "FAILED_RETRYABLE"].includes(batch.status) && (
                      <button
                        className="mt-3 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
                        disabled={busy}
                        onClick={() => void balanceBatch(batch)}
                        type="button"
                      >
                        Cân bằng lên KiotViet
                      </button>
                    )}
                  </div>
                ))}
                {batches.length === 0 && <p className="py-4 text-sm text-slate-500">Chưa có danh sách chờ.</p>}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Busy Spinner */}
      {busy && (
        <div className="fixed inset-x-0 bottom-5 z-50 mx-auto flex w-fit items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin" />
          Đang xử lý…
        </div>
      )}
    </div>
  );
}
