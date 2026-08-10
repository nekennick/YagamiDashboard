import Link from "next/link";
import { Prisma } from "@prisma/client";
import { DatabaseUnavailable, isDatabaseConnectionError } from "@/components/layout/database-unavailable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedPanel, FadeIn, MotionMetricCard, MotionMetricGrid } from "@/components/ui/motion-primitives";
import { prisma } from "@/lib/prisma";

type ReportsPageProps = {
  searchParams?: Promise<{
    id?: string;
    type?: string;
  }>;
};

type SnapshotPayload = {
  metrics?: Record<string, unknown>;
  freshness?: {
    settings?: Record<string, string>;
  };
};

const reportTypes = [
  { value: "all", label: "Tất cả" },
  { value: "daily", label: "Hằng ngày" },
  { value: "website", label: "Website" },
  { value: "sales", label: "Bán hàng" },
  { value: "inventory", label: "Tồn kho" },
];

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const params = (await searchParams) ?? {};
  const selectedType = params.type?.trim() || "all";
  const selectedId = Number(params.id);

  const where: Prisma.ReportSnapshotWhereInput =
    selectedType !== "all" ? { reportType: selectedType } : {};

  try {
    const [snapshots, stats] = await Promise.all([
      prisma.reportSnapshot.findMany({
        where,
        orderBy: [{ generatedAt: "desc" }],
        take: 40,
      }),
      prisma.reportSnapshot.groupBy({
        by: ["reportType"],
        _count: { _all: true },
      }),
    ]);

    const selectedSnapshot =
      snapshots.find((snapshot) => snapshot.id === selectedId) ??
      (selectedId
        ? await prisma.reportSnapshot.findUnique({ where: { id: selectedId } })
        : null) ??
      snapshots[0] ??
      null;

    const payload = parsePayload(selectedSnapshot?.payloadJson);
    const metricCards = buildMetricCards(selectedSnapshot?.reportType, payload);
    const sourceTables = parseStringArray(selectedSnapshot?.sourceTablesJson);
    const filters = parseObject(selectedSnapshot?.filtersJson);
    const totalSnapshots = stats.reduce((sum, item) => sum + item._count._all, 0);

    return (
      <div className="space-y-6">
        <FadeIn className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              Report Snapshot
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 dark:text-white">
              Báo cáo nhanh
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
              Xem lại các báo cáo đã được tính sẵn từ dữ liệu local. Mỗi snapshot lưu nguyên kết quả,
              bộ lọc, nguồn bảng và thời điểm tạo.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            Tổng snapshot: <span className="font-semibold text-slate-950 dark:text-white">{formatNumber(totalSnapshots)}</span>
          </div>
        </FadeIn>

        <div className="flex flex-wrap gap-2">
          {reportTypes.map((type) => {
            const active = selectedType === type.value;
            const count =
              type.value === "all"
                ? totalSnapshots
                : stats.find((item) => item.reportType === type.value)?._count._all ?? 0;

            return (
              <Link
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400/60 dark:bg-brand-500/15 dark:text-brand-300"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                }`}
                href={`/reports${type.value === "all" ? "" : `?type=${type.value}`}`}
                key={type.value}
              >
                {type.label} <span className="ml-1 text-xs opacity-70">({formatNumber(count)})</span>
              </Link>
            );
          })}
        </div>

        {!selectedSnapshot ? (
          <EmptyReports />
        ) : (
          <>
            <MotionMetricGrid className="md:grid-cols-4">
              <MetricCard label="Loại báo cáo" value={reportTypeLabel(selectedSnapshot.reportType)} />
              <MetricCard label="Kỳ báo cáo" value={selectedSnapshot.periodLabel ?? "Snapshot hiện tại"} />
              <MetricCard label="Tạo lúc" value={formatDateTime(selectedSnapshot.generatedAt)} />
              <MetricCard label="Report key" value={selectedSnapshot.reportKey} small />
            </MotionMetricGrid>

            {metricCards.length > 0 ? (
              <MotionMetricGrid className="md:grid-cols-4">
                {metricCards.map((metric) => (
                  <MetricCard key={metric.label} label={metric.label} value={metric.value} />
                ))}
              </MotionMetricGrid>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
              <AnimatedPanel delay={0.04}>
                <Card className="overflow-hidden">
                  <CardHeader>
                    <CardTitle>Snapshot đã lưu</CardTitle>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Hiển thị tối đa 40 snapshot mới nhất theo bộ lọc.
                    </p>
                  </CardHeader>
                  <CardContent className="px-0 py-0">
                    <div className="max-h-[720px] overflow-y-auto">
                      {snapshots.map((snapshot) => {
                        const active = snapshot.id === selectedSnapshot.id;
                        const href = `/reports?${new URLSearchParams({
                          ...(selectedType !== "all" ? { type: selectedType } : {}),
                          id: String(snapshot.id),
                        }).toString()}`;

                        return (
                          <Link
                            className={`block border-b border-slate-100 px-5 py-4 transition last:border-0 dark:border-slate-800 ${
                              active
                                ? "bg-brand-50/80 dark:bg-brand-500/10"
                                : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                            }`}
                            href={href}
                            key={snapshot.id}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-slate-950 dark:text-white">{snapshot.title}</p>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{snapshot.reportKey}</p>
                              </div>
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {snapshot.reportType}
                              </span>
                            </div>
                            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                              {snapshot.periodLabel ?? "Snapshot hiện tại"}
                            </p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                              Tạo lúc {formatDateTime(snapshot.generatedAt)}
                            </p>
                          </Link>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </AnimatedPanel>

              <AnimatedPanel delay={0.08}>
                <Card className="overflow-hidden">
                  <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <CardTitle>{selectedSnapshot.title}</CardTitle>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {selectedSnapshot.periodLabel ?? "Snapshot hiện tại"} · cập nhật {formatDateTime(selectedSnapshot.updatedAt)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                      {selectedSnapshot.reportKey}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <InfoPanel title="Nguồn dữ liệu" items={sourceTables} />
                      <FilterPanel filters={filters} />
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                      <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                        <h2 className="font-semibold text-slate-950 dark:text-white">Nội dung báo cáo</h2>
                      </div>
                      <div className="px-5 py-5">
                        <MarkdownPreview
                          markdown={
                            selectedSnapshot.reportType === "website"
                              ? hideBranchCustomerCodes(selectedSnapshot.markdown)
                              : selectedSnapshot.markdown
                          }
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </AnimatedPanel>
            </div>
          </>
        )}
      </div>
    );
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return <DatabaseUnavailable error={error} />;
    }

    throw error;
  }
}

function EmptyReports() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Chưa có báo cáo snapshot</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-slate-600 dark:text-slate-400">
        <p>Chạy một trong các lệnh sau để tạo báo cáo đầu tiên:</p>
        <pre className="overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
          {`npm.cmd run report:daily
npm.cmd run report:website
npm.cmd run report:sales
npm.cmd run report:inventory`}
        </pre>
      </CardContent>
    </Card>
  );
}

function MetricCard({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return (
    <MotionMetricCard>
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-sm text-slate-600 dark:text-slate-400">{label}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`${small ? "text-lg" : "text-2xl"} font-semibold tracking-normal text-slate-950 dark:text-white`}>
            {value}
          </div>
        </CardContent>
      </Card>
    </MotionMetricCard>
  );
}

function InfoPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{title}</h3>
      {items.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              key={item}
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Không có dữ liệu.</p>
      )}
    </div>
  );
}

function FilterPanel({ filters }: { filters: Record<string, unknown> }) {
  const entries = Object.entries(filters);
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Bộ lọc</h3>
      {entries.length ? (
        <dl className="mt-3 space-y-2 text-sm">
          {entries.map(([key, value]) => (
            <div className="grid gap-1 sm:grid-cols-[110px_1fr]" key={key}>
              <dt className="font-medium text-slate-500 dark:text-slate-400">{key}</dt>
              <dd className="text-slate-700 dark:text-slate-200">{String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Không có dữ liệu.</p>
      )}
    </div>
  );
}

function MarkdownPreview({ markdown }: { markdown: string }) {
  const blocks = markdown.split(/\n{2,}/);
  return (
    <div className="space-y-5 text-sm text-slate-700 dark:text-slate-300">
      {blocks.map((block, index) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith("# ")) {
          return (
            <h1 className="text-xl font-semibold text-slate-950 dark:text-white" key={index}>
              {trimmed.slice(2)}
            </h1>
          );
        }

        if (trimmed.startsWith("## ")) {
          return (
            <h2 className="border-b border-slate-100 pb-2 text-base font-semibold text-slate-950 dark:border-slate-800 dark:text-white" key={index}>
              {trimmed.slice(3)}
            </h2>
          );
        }

        if (trimmed.startsWith("|")) {
          return <MarkdownTable block={trimmed} key={index} />;
        }

        if (trimmed.startsWith("- ")) {
          return (
            <ul className="space-y-2" key={index}>
              {trimmed.split("\n").map((line, lineIndex) => (
                <li className="flex gap-2" key={lineIndex}>
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-brand-500" />
                  <span>{stripInlineBold(line.replace(/^- /, ""))}</span>
                </li>
              ))}
            </ul>
          );
        }

        if (trimmed.startsWith("_") && trimmed.endsWith("_")) {
          return (
            <p className="rounded-xl border border-dashed border-slate-200 p-4 text-slate-500 dark:border-slate-800 dark:text-slate-400" key={index}>
              {trimmed.slice(1, -1)}
            </p>
          );
        }

        return (
          <p className="leading-7" key={index}>
            {stripInlineBold(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function hideBranchCustomerCodes(markdown: string) {
  return markdown.replace(/\s+\(KH\d+\)/gi, "");
}

function MarkdownTable({ block }: { block: string }) {
  const lines = block.split("\n").filter((line) => line.trim());
  const header = splitMarkdownRow(lines[0] ?? "");
  const body = lines.slice(2).map(splitMarkdownRow);

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
      <table className="w-full min-w-[680px] border-collapse text-sm">
        <thead>
          <tr className="bg-slate-100 text-left text-slate-600 dark:bg-slate-800/80 dark:text-slate-300">
            {header.map((cell, index) => (
              <th className="px-4 py-3 font-semibold" key={index}>
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr className="border-t border-slate-100 dark:border-slate-800" key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300" key={cellIndex}>
                  {stripInlineBold(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function splitMarkdownRow(line: string) {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function stripInlineBold(value: string) {
  return value.replace(/\*\*/g, "").replace(/`/g, "");
}

function buildMetricCards(reportType: string | undefined, payload: SnapshotPayload | null) {
  const metrics = payload?.metrics ?? {};
  if (!reportType) return [];

  if (reportType === "daily" || reportType === "sales") {
    return [
      { label: "Hóa đơn", value: formatNumber(toNumber(metrics.invoiceCount)) },
      { label: "Doanh thu", value: formatCurrency(toNumber(metrics.revenue)) },
      { label: "Khách đã mua", value: formatNumber(toNumber(metrics.distinctCustomers)) },
      { label: "Phiếu tạm", value: formatNumber(toNumber(metrics.temporaryOrderCount)) },
    ];
  }

  if (reportType === "website") {
    return [
      { label: "Hóa đơn website", value: formatNumber(toNumber(metrics.websiteInvoices)) },
      { label: "Doanh thu website", value: formatCurrency(toNumber(metrics.websiteRevenue)) },
      { label: "Chi nhánh đã phát sinh đơn website", value: formatNumber(toNumber(metrics.branchesWithWebsite)) },
      { label: "Chi nhánh chưa phát sinh đơn website", value: formatNumber(toNumber(metrics.branchesWithoutWebsite)) },
    ];
  }

  if (reportType === "inventory") {
    return [
      { label: "Dòng tồn kho", value: formatNumber(toNumber(metrics.totalRows)) },
      { label: "Tổng tồn", value: formatNumber(toNumber(metrics.totalOnHand), 2) },
      { label: "Tồn âm", value: formatNumber(toNumber(metrics.negativeRows)) },
      { label: "Hết hàng", value: formatNumber(toNumber(metrics.zeroRows)) },
    ];
  }

  return [];
}

function parsePayload(value: string | undefined) {
  return parseObject(value) as SnapshotPayload | null;
}

function parseStringArray(value: string | undefined) {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed.map(String) : [];
}

function parseObject(value: string | undefined) {
  const parsed = parseJson(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}

function parseJson(value: string | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function reportTypeLabel(value: string) {
  return reportTypes.find((type) => type.value === value)?.label ?? value;
}

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits }).format(value);
}

function formatCurrency(value: number) {
  return `${formatNumber(value)} đ`;
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
