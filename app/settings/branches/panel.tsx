"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, DatabaseBackup, History, Loader2, Search, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Candidate = {
  id: number;
  kvCustomerId: number;
  code: string;
  name: string;
  updatedAt: string;
  likelyBranch: boolean;
};

type ManagedBranch = {
  id: number;
  customerCode: string | null;
  kvCustomerId: number | null;
  canonicalName: string;
  rawName: string | null;
  warehouse: string;
  status: string;
  notes: string | null;
  source: string;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AuditRow = {
  id: number;
  action: string;
  actor: string;
  createdAt: string;
  branchName: string;
  customerCode: string | null;
};

type Tab = "candidates" | "managed" | "history";

const warehouseOptions = [
  { value: "CAO_LANH", label: "Kho Cao Lãnh" },
  { value: "BINH_DUONG", label: "Kho Bình Dương" }
];

const statusOptions = [
  { value: "ACTIVE", label: "Đang hoạt động" },
  { value: "PLANNED_NOT_IN_KIOTVIET", label: "Sắp khai trương" },
  { value: "INACTIVE_DO_NOT_USE", label: "Ngừng hoạt động" }
];

export function BranchDirectoryPanel({
  candidates,
  managed,
  recentAudits
}: {
  candidates: Candidate[];
  managed: ManagedBranch[];
  recentAudits: AuditRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(candidates.length > 0 ? "candidates" : "managed");
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("Danh mục đã sẵn sàng.");
  const normalizedQuery = normalizeText(query);
  const filteredCandidates = useMemo(
    () => candidates.filter((candidate) => matchesQuery(candidate.name, candidate.code, normalizedQuery)),
    [candidates, normalizedQuery]
  );
  const filteredManaged = useMemo(
    () => managed.filter((branch) => matchesQuery(branch.canonicalName, branch.customerCode ?? "", normalizedQuery)),
    [managed, normalizedQuery]
  );

  async function exportKnowledge() {
    setExporting(true);
    setMessage("Đang xuất lại knowledge base...");

    try {
      const response = await fetch("/api/branch-directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "export" })
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "Không thể xuất knowledge base.");
      }

      setMessage(data.message ?? "Đã xuất knowledge base.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể xuất knowledge base.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Quản lý dữ liệu chuẩn</CardTitle>
            <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
              Khách mới không tự được tính là chi nhánh cho đến khi anh chọn kho và xác nhận. Điều này tránh đưa nhầm khách lẻ vào báo cáo.
            </p>
          </div>
          <Button disabled={exporting} onClick={exportKnowledge} variant="secondary">
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DatabaseBackup className="mr-2 h-4 w-4" />}
            Xuất knowledge base
          </Button>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="inline-flex w-fit rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <TabButton active={tab === "candidates"} icon={Sparkles} label={`Cần xác nhận (${candidates.length})`} onClick={() => setTab("candidates")} />
            <TabButton active={tab === "managed"} icon={Users} label={`Đã quản lý (${managed.length})`} onClick={() => setTab("managed")} />
            <TabButton active={tab === "history"} icon={History} label="Lịch sử" onClick={() => setTab("history")} />
          </div>

          {tab !== "history" ? (
            <label className="relative block w-full md:max-w-sm">
              <span className="sr-only">Tìm chi nhánh</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                aria-label="Tìm tên hoặc mã khách chưa phân loại"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm tên hoặc mã khách"
                value={query}
              />
            </label>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {message}
        </div>

        {tab === "candidates" ? (
          <BranchRowsEmptyAware empty="Không còn khách hàng nào cần phân loại." rows={filteredCandidates}>
            {(candidate) => (
              <BranchEditorRow
                code={candidate.code}
                key={candidate.id}
                kvCustomerId={candidate.kvCustomerId}
                likelyBranch={candidate.likelyBranch}
                name={candidate.name}
                onMessage={setMessage}
                onSaved={() => router.refresh()}
              />
            )}
          </BranchRowsEmptyAware>
        ) : null}

        {tab === "managed" ? (
          <BranchRowsEmptyAware empty="Không tìm thấy chi nhánh phù hợp." rows={filteredManaged}>
            {(branch) => (
              <BranchEditorRow
                branchId={branch.id}
                code={branch.customerCode ?? ""}
                initialStatus={branch.status}
                initialWarehouse={branch.warehouse}
                key={branch.id}
                kvCustomerId={branch.kvCustomerId ?? undefined}
                name={branch.canonicalName}
                onMessage={setMessage}
                onSaved={() => router.refresh()}
                source={branch.source}
              />
            )}
          </BranchRowsEmptyAware>
        ) : null}

        {tab === "history" ? <AuditList rows={recentAudits} /> : null}
      </CardContent>
    </Card>
  );
}

function BranchEditorRow({
  branchId,
  code,
  kvCustomerId,
  name,
  likelyBranch = false,
  source,
  initialWarehouse = "",
  initialStatus = "ACTIVE",
  onMessage,
  onSaved
}: {
  branchId?: number;
  code: string;
  kvCustomerId?: number;
  name: string;
  likelyBranch?: boolean;
  source?: string;
  initialWarehouse?: string;
  initialStatus?: string;
  onMessage: (message: string) => void;
  onSaved: () => void;
}) {
  const [canonicalName, setCanonicalName] = useState(name);
  const [warehouse, setWarehouse] = useState(initialWarehouse);
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!warehouse) {
      onMessage(`Hãy chọn kho cho ${canonicalName}.`);
      return;
    }

    setSaving(true);
    onMessage(`Đang lưu ${canonicalName}...`);

    try {
      const response = await fetch("/api/branch-directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: branchId,
          kvCustomerId,
          customerCode: code,
          canonicalName,
          rawName: name,
          warehouse,
          status
        })
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "Không thể lưu chi nhánh.");
      }

      onMessage(data.message ?? `Đã lưu ${canonicalName}.`);
      onSaved();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Không thể lưu chi nhánh.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-3 border-b border-slate-100 py-4 last:border-0 dark:border-slate-800 lg:grid-cols-[minmax(240px,1fr)_180px_190px_118px] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <input
            aria-label={`Tên chuẩn của ${name}`}
            className="min-w-0 flex-1 bg-transparent font-semibold text-slate-950 outline-none focus:text-brand-600 dark:text-white dark:focus:text-brand-300"
            onChange={(event) => setCanonicalName(event.target.value)}
            value={canonicalName}
          />
          {likelyBranch ? (
            <span className="rounded-full bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              Có thể là chi nhánh
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span>{code || "Chưa có mã"}</span>
          {source ? <span>Nguồn: {source}</span> : <span>Khách mới từ KiotViet</span>}
        </div>
      </div>

      <select
        aria-label={`Kho phụ trách của ${canonicalName}`}
        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        onChange={(event) => setWarehouse(event.target.value)}
        value={warehouse}
      >
        <option value="">Chọn kho</option>
        {warehouseOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>

      <select
        aria-label={`Trạng thái của ${canonicalName}`}
        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        onChange={(event) => setStatus(event.target.value)}
        value={status}
      >
        {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>

      <Button disabled={saving || !canonicalName.trim()} onClick={save}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
        {branchId ? "Lưu" : "Xác nhận"}
      </Button>
    </div>
  );
}

function BranchRowsEmptyAware<T>({ rows, empty, children }: { rows: T[]; empty: string; children: (row: T) => React.ReactNode }) {
  if (rows.length === 0) {
    return <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">{empty}</div>;
  }

  return <div>{rows.map(children)}</div>;
}

function AuditList({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0) {
    return <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">Chưa có thay đổi nào được ghi nhận.</div>;
  }

  return (
    <div>
      {rows.map((row) => (
        <div className="flex flex-col gap-2 border-b border-slate-100 py-4 last:border-0 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between" key={row.id}>
          <div>
            <p className="font-semibold text-slate-950 dark:text-white">{row.branchName}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{row.customerCode ?? "Chưa có mã"} · {row.actor}</p>
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-300">
            {row.action === "CONFIRM" ? "Xác nhận mới" : "Cập nhật"} · {formatDateTime(row.createdAt)}
          </div>
        </div>
      ))}
    </div>
  );
}

function TabButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Users; label: string; onClick: () => void }) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors",
        active ? "bg-white text-slate-950 shadow-sm dark:bg-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function matchesQuery(name: string, code: string, query: string) {
  return !query || normalizeText(`${name} ${code}`).includes(query);
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
