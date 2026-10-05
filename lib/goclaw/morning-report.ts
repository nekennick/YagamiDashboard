import "server-only";

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type WebSocketClient from "ws";

const nodeRequire = createRequire(import.meta.url);
const WebSocket = nodeRequire("ws") as typeof WebSocketClient;

const morningReportJobId = "019f5e3b-01fa-78e1-8251-e07772e05192";
const defaultReportPath = "/goclaw-workspace/quan-ly-kim/zlo-ql-kim/group_zlo-ql-kim_6244108299423959453/outputs/morning-report.json";
const defaultTextReportPath = "/goclaw-workspace/quan-ly-kim/zlo-ql-kim/group_zlo-ql-kim_6244108299423959453/outputs/morning-report.txt";

type ReportMetrics = {
  scheduledBranches?: number;
  orderedBranches?: number;
  missingBranches?: number;
  scheduledOrders?: number;
  scheduledRevenue?: number;
  externalOrders?: number;
  externalRevenue?: number;
  otherScheduleOrders?: number;
  otherScheduleRevenue?: number;
  stockWarningCount?: number;
};

type WarehouseReport = {
  name: string;
  scheduled?: { branches: number; orders: number; revenue: number; branchNames: string[] };
  missingBranches?: Array<{ code?: string; name: string }>;
  external?: { branches: number; orders: number; revenue: number };
  otherSchedule?: { orders: number; revenue: number };
};

export type MorningReport = {
  schemaVersion: number;
  reportType: string;
  generatedAt: string;
  timezone: string;
  status: "ok" | "error";
  summary: string;
  error?: string;
  dataFreshness?: { ordersAsOf?: string; inventorySyncedAt?: string };
  metrics: ReportMetrics;
  warehouses: WarehouseReport[];
  stockWarnings: Array<{ warehouse: string; productCode: string; needed: number; available: number; shortage: number }>;
  alerts: string[];
  source: "goclaw-api" | "json-file" | "text-file";
};

type CronRun = {
  ts: number;
  status: string;
  summary?: string;
  error?: string;
};

export async function getMorningReport() {
  const [apiResult, fileResult] = await Promise.allSettled([readReportFromGoClaw(), readReportFromFile()]);

  if (apiResult.status === "fulfilled") {
    return apiResult.value;
  }

  if (fileResult.status === "fulfilled") {
    return fileResult.value;
  }

  const reasons = [apiResult, fileResult]
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => (result.reason instanceof Error ? result.reason.message : String(result.reason)));

  throw new Error(reasons.join(" | ") || "Không thể tải báo cáo sáng từ GoClaw.");
}

async function readReportFromGoClaw(): Promise<MorningReport> {
  const token = await getGatewayToken();

  if (!token) {
    throw new Error("Chưa cấu hình token GoClaw.");
  }

  const gatewayUrl = process.env.GOCLAW_WS_URL ?? "ws://goclaw:18790/ws";
  const run = await requestLatestCronRun(gatewayUrl, token);

  if (!run.summary) {
    throw new Error("Lượt chạy GoClaw gần nhất không có nội dung báo cáo.");
  }

  return createSummaryReport(run.summary, new Date(run.ts).toISOString(), run.status === "ok" ? undefined : run.error, "goclaw-api");
}

async function readReportFromFile(): Promise<MorningReport> {
  const reportPath = process.env.GOCLAW_MORNING_REPORT_PATH ?? defaultReportPath;

  try {
    const parsed = JSON.parse(await readFile(reportPath, "utf8")) as Omit<MorningReport, "source">;
    return normalizeReport(parsed, "json-file");
  } catch (error) {
    if (!(error instanceof SyntaxError) && !(isFileNotFound(error))) {
      throw error;
    }

    const textPath = process.env.GOCLAW_MORNING_REPORT_TEXT_PATH ?? defaultTextReportPath;
    const summary = await readFile(textPath, "utf8");
    return createSummaryReport(summary, new Date().toISOString(), undefined, "text-file");
  }
}

function normalizeReport(report: Omit<MorningReport, "source">, source: MorningReport["source"]): MorningReport {
  if (!report.summary || !report.generatedAt || !report.status) {
    throw new Error("morning-report.json không đúng định dạng.");
  }

  return {
    ...report,
    schemaVersion: report.schemaVersion ?? 1,
    reportType: report.reportType ?? "morning-order-schedule",
    timezone: report.timezone ?? "Asia/Bangkok",
    metrics: report.metrics ?? {},
    warehouses: report.warehouses ?? [],
    stockWarnings: report.stockWarnings ?? [],
    alerts: report.alerts ?? [],
    source
  };
}

function createSummaryReport(summary: string, generatedAt: string, error: string | undefined, source: MorningReport["source"]): MorningReport {
  return {
    schemaVersion: 1,
    reportType: "morning-order-schedule",
    generatedAt,
    timezone: "Asia/Bangkok",
    status: error ? "error" : "ok",
    summary,
    error,
    metrics: {
      scheduledBranches: extractCount(summary, /Lịch[^:]*:\s*([\d.]+)\s*chi nhánh/i),
      orderedBranches: extractCount(summary, /Chi nhánh đã đặt:\s*([\d.]+)\s*chi nhánh/i),
      missingBranches: extractCount(summary, /Chi nhánh chưa đặt:\s*([\d.]+)\s*chi nhánh/i),
      scheduledOrders: extractCount(summary, /Chi nhánh đã đặt:[^/]*\/\s*([\d.]+)\s*phiếu/i)
    },
    warehouses: [],
    stockWarnings: [],
    alerts: [] ,
    source
  };
}

function extractCount(summary: string, pattern: RegExp) {
  const match = summary.match(pattern);
  return match?.[1] ? Number(match[1].replaceAll(".", "")) : undefined;
}

async function getGatewayToken() {
  if (process.env.GOCLAW_GATEWAY_TOKEN) {
    return process.env.GOCLAW_GATEWAY_TOKEN;
  }

  const tokenPath = process.env.GOCLAW_GATEWAY_TOKEN_FILE;

  if (!tokenPath) {
    return undefined;
  }

  return (await readFile(tokenPath, "utf8")).trim();
}

async function requestLatestCronRun(url: string, token: string): Promise<CronRun> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error("GoClaw không phản hồi trong 10 giây."));
    }, 10_000);

    function finish(error?: Error, run?: CronRun) {
      clearTimeout(timeout);
      socket.close();
      if (error) reject(error);
      else if (run) resolve(run);
    }

    socket.once("error", (error) => finish(new Error(`Không thể kết nối GoClaw: ${error.message}`)));
    socket.on("open", () => {
      socket.send(JSON.stringify({ type: "req", id: "morning-connect", method: "connect", params: { token, protocol: 3, user_id: "yagami-dashboard" } }));
    });
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString()) as { id?: string; ok?: boolean; payload?: unknown; error?: { message?: string } };

      if (message.id === "morning-connect") {
        if (!message.ok) {
          finish(new Error(message.error?.message ?? "GoClaw từ chối xác thực."));
          return;
        }

        socket.send(JSON.stringify({ type: "req", id: "morning-runs", method: "cron.runs", params: { jobId: morningReportJobId, limit: 30, offset: 0 } }));
        return;
      }

      if (message.id === "morning-runs") {
        if (!message.ok) {
          finish(new Error(message.error?.message ?? "Không đọc được lịch sử cron GoClaw."));
          return;
        }

        const payload = message.payload as { entries?: CronRun[] } | undefined;
        const latest = payload?.entries?.filter((entry) => entry.status === "ok" && entry.summary).sort((a, b) => b.ts - a.ts)[0];
        finish(latest ? undefined : new Error("Chưa có lượt báo cáo sáng thành công."), latest);
      }
    });
  });
}

function isFileNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
