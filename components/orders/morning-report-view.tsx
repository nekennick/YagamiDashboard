"use client";

import { AlertTriangle, CalendarDays, ChevronDown, ClipboardList, Clock3, LoaderCircle, PackageCheck, RefreshCw, Truck, Warehouse } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type MorningReport = {
  generatedAt: string;
  status: "ok" | "error";
  summary: string;
  metrics: Record<string, number | undefined>;
  warehouses: Array<{ name: string; scheduled?: { branches: number; orders: number; revenue: number; branchNames: string[] }; missingBranches?: Array<{ name: string }>; external?: { branches: number; orders: number; revenue: number }; otherSchedule?: { orders: number; revenue: number } }>;
  alerts: string[];
};

type StockPressure = { warehouse: string; code: string; demand: number; stock: number; reserved: number; available: number };

export function MorningReportView({ initialReport }: { initialReport: MorningReport | null }) {
  const [report, setReport] = useState(initialReport);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stockPressure = useMemo(() => report ? parseStockPressure(report.summary) : [], [report]);
  const missingBranches = useMemo(() => report ? parseMissingBranches(report.summary) : [], [report]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/morning-report", { cache: "no-store" });
      const payload = (await response.json()) as MorningReport & { message?: string };
      if (!response.ok || !payload.summary) throw new Error(payload.message ?? "Không thể làm mới báo cáo.");
      setReport(payload);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Không thể làm mới báo cáo.");
    } finally {
      setLoading(false);
    }
  }

  if (!report) return <EmptyReport loading={loading} onRefresh={refresh} />;

  const metrics = [
    ["Chi nhánh theo lịch", report.metrics.scheduledBranches, "text-slate-950 dark:text-white"],
    ["Đã đặt hàng", report.metrics.orderedBranches, "text-emerald-700 dark:text-emerald-300"],
    ["Chưa đặt hàng", report.metrics.missingBranches, "text-amber-700 dark:text-amber-300"],
    ["Phiếu theo lịch", report.metrics.scheduledOrders, "text-slate-950 dark:text-white"],
    ["Cảnh báo tồn", countShortages(stockPressure), "text-red-700 dark:text-red-300"]
  ] as const;

  return <div className="space-y-6">
    <section className="flex flex-col gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{formatDateTime(report.generatedAt)}</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 text-balance dark:text-white">Lịch Đặt Hàng</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Tổng hợp từ báo cáo sáng</p>
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end"><ReportStatus status={report.status} /><RefreshButton loading={loading} onClick={refresh} />{error ? <p aria-live="polite" className="max-w-xs text-right text-xs text-red-600 dark:text-red-400">{error}</p> : null}</div>
    </section>

    <section aria-label="Tổng quan đặt hàng" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {metrics.map(([label, value, color]) => <Card key={label} className="border-slate-200 shadow-none dark:border-slate-800"><CardContent className="p-4"><p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p><p className={`mt-2 text-3xl font-semibold tabular-nums ${color}`}>{value === undefined ? "—" : formatNumber(value)}</p></CardContent></Card>)}
    </section>

    <ReportHighlights summary={report.summary} />
    <MissingBranches groups={missingBranches} />
    <OperationalReports summary={report.summary} />
    <WarehouseTable warehouses={report.warehouses} />
    {report.alerts.length > 0 ? <Alerts alerts={report.alerts} /> : null}
    <StockPressureTable rows={stockPressure} />
    <SourceReport summary={report.summary} />
  </div>;
}

function StockPressureTable({ rows }: { rows: StockPressure[] }) {
  if (rows.length === 0) return null;
  const shortages = countShortages(rows);
  const products = groupStockByCode(rows);

  return <Card className="overflow-hidden border-amber-200 shadow-sm dark:border-amber-500/20">
    <CardHeader className="border-b border-amber-100 bg-amber-50/70 dark:border-amber-500/10 dark:bg-amber-500/5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="flex items-center gap-2 text-slate-950 dark:text-white"><PackageCheck className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />4 mã siết tồn</CardTitle><p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Đơn theo lịch và gửi xe ngoài — ưu tiên kiểm tra số khả dụng.</p></div><p className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${shortages > 0 ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"}`}>{shortages > 0 ? `${shortages} mã cần xử lý` : "Không có mã thiếu khả dụng"}</p></div>
    </CardHeader>
    <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="bg-slate-50 text-center text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400"><tr><th className="px-5 py-3 text-left" rowSpan={2}>Mã hàng</th><th className="border-l border-slate-200 px-5 py-3 dark:border-slate-800" colSpan={4}>Cao Lãnh</th><th className="border-l border-slate-200 px-5 py-3 dark:border-slate-800" colSpan={4}>Bình Dương</th></tr><tr><StockColumnHeaders /><StockColumnHeaders /></tr></thead><tbody>{products.map((product) => <GroupedStockRow key={product.code} product={product} />)}</tbody></table></div></CardContent>
  </Card>;
}

function GroupedStockRow({ product }: { product: { code: string; caoLanh?: StockPressure; binhDuong?: StockPressure } }) {
  const isShort = [product.caoLanh, product.binhDuong].some((row) => row && row.available < row.demand);
  return <tr className={`border-t border-slate-100 dark:border-slate-800 ${isShort ? "bg-red-50/60 dark:bg-red-500/5" : ""}`}><td className="px-5 py-4"><span translate="no" className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{product.code}</span></td><StockValueCells row={product.caoLanh} /><StockValueCells row={product.binhDuong} /></tr>;
}

function StockColumnHeaders() { return <><th className="border-l border-slate-200 px-4 py-2 dark:border-slate-800">Cần</th><th className="px-4 py-2">Tồn</th><th className="px-4 py-2">Giữ</th><th className="px-4 py-2">Khả dụng</th></>; }

function StockValueCells({ row }: { row?: StockPressure }) {
  if (!row) return <><EmptyNumberCell bordered /><EmptyNumberCell /><EmptyNumberCell /><EmptyNumberCell /></>;
  const isShort = row.available < row.demand;
  return <><NumberCell value={row.demand} bordered /><NumberCell value={row.stock} /><NumberCell value={row.reserved} /><td className={`px-4 py-4 text-right text-base font-semibold tabular-nums ${isShort ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}`}>{formatNumber(row.available)}</td></>;
}

function ReportHighlights({ summary }: { summary: string }) {
  const highlights = [
    ["Mốc đơn hàng", extractReportLine(summary, "Mốc dữ liệu đơn hàng:"), Clock3],
    ["Đồng bộ tồn kho", extractReportLine(summary, "Dữ liệu tồn kho"), Warehouse],
    ["Gửi xe ngoài", extractReportLine(summary, "Gửi xe ngoài hôm nay:"), Truck],
    ["Đơn ngoài lịch", extractReportLine(summary, "Đơn ngoài lịch khác:"), ClipboardList]
  ].filter(([, value]) => value) as Array<[string, string, typeof Clock3]>;

  if (highlights.length === 0) return null;
  return <section className="grid gap-3 lg:grid-cols-2" aria-label="Thông tin chính"><Card className="lg:col-span-2"><CardHeader className="pb-2"><CardTitle className="text-base">Thông tin chính</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{highlights.map(([label, value, Icon]) => <div className="min-w-0 border-l-2 border-slate-200 pl-3 dark:border-slate-700" key={label}><div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}</div><p className="mt-1 break-words text-sm leading-5 text-slate-800 dark:text-slate-200">{value}</p></div>)}</CardContent></Card></section>;
}

function MissingBranches({ groups }: { groups: Array<{ warehouse: string; branches: string[] }> }) {
  if (groups.length === 0) return null;
  return <Card className="border-amber-200 dark:border-amber-500/20"><CardHeader><CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-100"><AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />Chi nhánh chưa đặt</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">{groups.map((group) => <div key={group.warehouse}><p className="text-sm font-semibold text-slate-900 dark:text-white">{group.warehouse}</p><ul className="mt-2 flex flex-wrap gap-2">{group.branches.map((branch) => <li className="rounded-md bg-amber-50 px-2.5 py-1 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200" key={branch}>{branch}</li>)}</ul></div>)}</CardContent></Card>;
}

function OperationalReports({ summary }: { summary: string }) {
  const scheduled = parseScheduledOrders(summary);
  const missingByWarehouse = new Map(
    parseMissingBranches(summary).map((group) => [normalizeWarehouseKey(group.warehouse), group.branches.length])
  );
  const external = parseExternalDeliveries(summary);
  const otherSchedule = parseOtherScheduleOrders(summary);

  return <section className="grid gap-4 xl:grid-cols-3" aria-label="Báo cáo điều phối">
    <Card><CardHeader><CardTitle className="text-base">Đơn theo lịch</CardTitle></CardHeader><CardContent className="space-y-3">{scheduled.map((item) => {
      const totalBranches = item.branches + (missingByWarehouse.get(normalizeWarehouseKey(item.warehouse)) ?? 0);
      return <div className="flex items-baseline justify-between gap-3" key={item.warehouse}><span className="text-sm text-slate-600 dark:text-slate-400">{item.warehouse}</span><strong className="whitespace-nowrap text-sm tabular-nums text-slate-950 dark:text-white">{formatNumber(item.branches)}/{formatNumber(totalBranches)} CN - {formatNumber(item.orders)} phiếu</strong></div>;
    })}</CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Truck className="h-4 w-4 text-slate-500" aria-hidden="true" />Gửi xe ngoài hôm nay</CardTitle></CardHeader><CardContent className="space-y-4">{external.map((item) => <div key={item.warehouse}><p className="text-sm font-semibold text-slate-900 dark:text-white">{item.warehouse} <span className="font-normal text-slate-500">· {formatNumber(item.orders)} phiếu</span></p>{item.branches.length > 0 ? <ul className="mt-2 flex flex-wrap gap-2">{item.branches.map((branch) => <li className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300" key={branch}>{branch}</li>)}</ul> : <p className="mt-1 text-sm text-slate-500">Không có chi nhánh.</p>}</div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Đơn ngoài lịch khác</CardTitle></CardHeader><CardContent className="space-y-3">{otherSchedule.map((item) => <div className="flex items-baseline justify-between gap-3" key={item.warehouse}><span className="text-sm text-slate-600 dark:text-slate-400">{item.warehouse}</span><strong className="whitespace-nowrap text-sm tabular-nums text-slate-950 dark:text-white">{formatNumber(item.orders)} phiếu</strong></div>)}</CardContent></Card>
  </section>;
}

function WarehouseTable({ warehouses }: { warehouses: MorningReport["warehouses"] }) {
  if (warehouses.length === 0) return null;
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Warehouse className="h-5 w-5 text-slate-500" aria-hidden="true" />Đóng hàng theo kho</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400"><tr><th className="px-3 py-3">Kho</th><th className="px-3 py-3 text-right">Theo lịch</th><th className="px-3 py-3 text-right">Chưa đặt</th><th className="px-3 py-3 text-right">Gửi xe ngoài</th><th className="px-3 py-3 text-right">Ngoài lịch</th></tr></thead><tbody>{warehouses.map((warehouse) => <tr className="border-b border-slate-100 last:border-0 dark:border-slate-800" key={warehouse.name}><td className="px-3 py-4 font-medium text-slate-900 dark:text-white"><div>{warehouse.name}</div><div className="mt-1 max-w-md truncate text-xs font-normal text-slate-500">{warehouse.scheduled?.branchNames.join(", ") || "Chưa có chi nhánh đặt"}</div></td><td className="px-3 py-4 text-right">{warehouse.scheduled ? <>{warehouse.scheduled.branches} CN · {warehouse.scheduled.orders} phiếu<div className="mt-1 text-xs text-slate-500">{formatCurrency(warehouse.scheduled.revenue)}</div></> : "—"}</td><td className="px-3 py-4 text-right">{warehouse.missingBranches?.length ?? 0}</td><td className="px-3 py-4 text-right">{warehouse.external ? <>{warehouse.external.branches} CN · {warehouse.external.orders} phiếu<div className="mt-1 text-xs text-slate-500">{formatCurrency(warehouse.external.revenue)}</div></> : "—"}</td><td className="px-3 py-4 text-right">{warehouse.otherSchedule ? <>{warehouse.otherSchedule.orders} phiếu<div className="mt-1 text-xs text-slate-500">{formatCurrency(warehouse.otherSchedule.revenue)}</div></> : "—"}</td></tr>)}</tbody></table></CardContent></Card>;
}

function Alerts({ alerts }: { alerts: string[] }) {
  return <Card className="border-red-200 dark:border-red-500/20"><CardHeader><CardTitle className="flex items-center gap-2 text-red-800 dark:text-red-200"><AlertTriangle className="h-5 w-5" aria-hidden="true" />Cần theo dõi</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">{alerts.map((alert) => <li key={alert}>• {alert}</li>)}</ul></CardContent></Card>;
}

function SourceReport({ summary }: { summary: string }) {
  return <details className="group rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-slate-900 marker:hidden dark:text-white"><span className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-slate-500" aria-hidden="true" />Báo cáo gốc</span><ChevronDown className="h-5 w-5 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" /></summary><div className="border-t border-slate-100 p-4 dark:border-slate-800"><pre className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 font-sans text-sm leading-6 text-slate-700 dark:bg-slate-950 dark:text-slate-300">{summary}</pre></div></details>;
}

function EmptyReport({ loading, onRefresh }: { loading: boolean; onRefresh: () => void }) { return <Card><CardContent className="flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center"><AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden="true" /><div><p className="font-semibold text-slate-950 dark:text-white">Chưa tải được báo cáo sáng</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Kiểm tra GoClaw rồi thử lại.</p></div><RefreshButton loading={loading} onClick={onRefresh} /></CardContent></Card>; }
function ReportStatus({ status }: { status: MorningReport["status"] }) { return <span className={`rounded-full px-3 py-1 text-xs font-medium ${status === "ok" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"}`}>{status === "ok" ? "Báo cáo thành công" : "Báo cáo có lỗi"}</span>; }
function NumberCell({ value, bordered = false }: { value: number; bordered?: boolean }) { return <td className={`px-4 py-4 text-right tabular-nums text-slate-700 dark:text-slate-300 ${bordered ? "border-l border-slate-200 dark:border-slate-800" : ""}`}>{formatNumber(value)}</td>; }
function EmptyNumberCell({ bordered = false }: { bordered?: boolean }) { return <td className={`px-4 py-4 text-right text-slate-400 ${bordered ? "border-l border-slate-200 dark:border-slate-800" : ""}`}>—</td>; }
function RefreshButton({ loading, onClick }: { loading: boolean; onClick: () => void }) { return <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800" disabled={loading} onClick={onClick} type="button">{loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}Làm mới</button>; }

function parseStockPressure(summary: string) {
  const section = summary.split("📦 4 mã siết tồn")[1]?.split("⚠️ Cần theo dõi:")[0];
  if (!section) return [];
  return [...section.matchAll(/🏭\s*([^:\n]+):\s*([\s\S]*?)(?=🏭|$)/g)].flatMap(([, warehouse, rows]) => [...rows.matchAll(/•\s*([A-Z0-9]+):\s*cần\s*([\d.]+)\s*\|\s*tồn\s*([\d.]+)\s*\|\s*giữ\s*([\d.]+)\s*\|\s*khả dụng\s*([\d.]+)/gi)].map(([, code, demand, stock, reserved, available]) => ({ warehouse: warehouse.trim(), code, demand: toNumber(demand), stock: toNumber(stock), reserved: toNumber(reserved), available: toNumber(available) })));
}

function groupStockByCode(rows: StockPressure[]) {
  return rows.reduce<Array<{ code: string; caoLanh?: StockPressure; binhDuong?: StockPressure }>>((products, row) => {
    const product = products.find((item) => item.code === row.code) ?? { code: row.code };
    if (!products.includes(product)) products.push(product);
    if (row.warehouse.toUpperCase().includes("BÌNH DƯƠNG")) product.binhDuong = row;
    else product.caoLanh = row;
    return products;
  }, []);
}

function parseMissingBranches(summary: string) {
  const section = summary.split("📍 Chi nhánh chưa đặt:")[1]?.split("🚛 Gửi xe ngoài")[0];
  if (!section) return [];
  return [...section.matchAll(/•\s*([^:\n]+):\s*([^\n]+)/g)].map(([, warehouse, branchList]) => ({ warehouse: warehouse.trim(), branches: branchList.split(",").map((branch) => branch.trim()).filter(Boolean) }));
}

function extractReportLine(summary: string, label: string) {
  const line = summary.split("\n").find((item) => item.includes(label));
  return line?.replace("• ", "").trim() ?? "";
}

function parseScheduledOrders(summary: string) {
  return parseWarehouseNumbers(summary, "🚚 Đóng hàng theo lịch", "📍 Chi nhánh chưa đặt", /•\s*([\d.]+)\s*chi nhánh\s*\/\s*([\d.]+)\s*phiếu/i).map((item) => ({ warehouse: item.warehouse, branches: item.first, orders: item.second }));
}

function parseExternalDeliveries(summary: string) {
  const section = getSection(summary, "Gửi xe ngoài hôm nay", "Đơn ngoài lịch khác");
  if (!section) return [];
  return [...section.matchAll(/•\s*([^:\n]+):\s*([\d.]+)\s*chi nhánh\s*\/\s*([\d.]+)\s*phiếu[^—\n]*(?:—\s*([^\n]+))?/gi)].map(([, warehouse, , orders, branches]) => ({ warehouse: warehouse.trim(), orders: toNumber(orders), branches: branches?.trim().toLowerCase() === "không có" ? [] : branches?.split(",").map((branch) => branch.trim()).filter(Boolean) ?? [] }));
}

function parseOtherScheduleOrders(summary: string) {
  const section = getSection(summary, "Đơn ngoài lịch khác", "4 mã siết tồn");
  return [...section.matchAll(/•\s*([^:\n]+):\s*([\d.]+)\s*phiếu/gi)].map(([, warehouse, orders]) => ({ warehouse: warehouse.trim(), orders: toNumber(orders) }));
}

function parseWarehouseNumbers(summary: string, start: string, end: string, values: RegExp) {
  const section = getSection(summary, start, end);
  if (!section) return [] as Array<{ warehouse: string; first: number; second: number }>;
  return [...section.matchAll(/🏭\s*([^:\n]+):\s*([\s\S]*?)(?=🏭|$)/g)].flatMap(([, warehouse, content]) => {
    const match = content.match(values);
    if (!match) return [];
    return [{ warehouse: warehouse.trim(), first: toNumber(match[1]), second: match[2] ? toNumber(match[2]) : 0 }];
  });
}

function getSection(summary: string, start: string, end: string) {
  const lowerSummary = summary.toLocaleLowerCase();
  const startIndex = lowerSummary.lastIndexOf(start.toLocaleLowerCase());
  if (startIndex < 0) return "";
  const endIndex = lowerSummary.indexOf(end.toLocaleLowerCase(), startIndex + start.length);
  return summary.slice(startIndex, endIndex < 0 ? summary.length : endIndex);
}
function normalizeWarehouseKey(value: string) { return value.trim().replace(/\s+/g, " ").toLocaleUpperCase("vi-VN"); }
function countShortages(rows: StockPressure[]) { return rows.filter((row) => row.available < row.demand).length; }
function toNumber(value: string) { return Number(value.replaceAll(".", "")); }
function formatNumber(value: number) { return new Intl.NumberFormat("vi-VN").format(value); }
function formatCurrency(value: number) { return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("vi-VN", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value)); }
