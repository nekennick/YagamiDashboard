import fs from "node:fs/promises";
import path from "node:path";
import type { BranchDirectory } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const branchWarehouses = ["CAO_LANH", "BINH_DUONG"] as const;
export const branchStatuses = ["ACTIVE", "PLANNED_NOT_IN_KIOTVIET", "INACTIVE_DO_NOT_USE"] as const;

export type BranchWarehouse = (typeof branchWarehouses)[number];
export type BranchStatus = (typeof branchStatuses)[number];

type KnowledgeBranch = {
  warehouse: string;
  day: string | null;
  sourceCell: string | null;
  rawName: string | null;
  canonicalName: string;
  customerCode: string | null;
  status: string;
  routeType: string;
  notes: string | null;
};

type KnowledgeMap = {
  version: number;
  verifiedAt: string;
  counts?: Record<string, number>;
  deprecatedCustomers?: Array<{ code: string }>;
  branches: KnowledgeBranch[];
  [key: string]: unknown;
};

export async function ensureBranchDirectorySeeded() {
  const count = await prisma.branchDirectory.count();

  if (count > 0) {
    return count;
  }

  const knowledge = await readKnowledgeMap();
  const customers = await prisma.customer.findMany({
    where: { code: { not: null } },
    select: { code: true, kvCustomerId: true }
  });
  const customerByCode = new Map(
    customers.map((customer) => [normalizeCustomerCode(customer.code), customer.kvCustomerId])
  );
  const confirmedAt = parseVerifiedDate(knowledge.verifiedAt);

  await prisma.branchDirectory.createMany({
    data: knowledge.branches.map((branch) => ({
      customerCode: branch.customerCode ? normalizeCustomerCode(branch.customerCode) : null,
      kvCustomerId: branch.customerCode ? customerByCode.get(normalizeCustomerCode(branch.customerCode)) ?? null : null,
      canonicalName: branch.canonicalName,
      rawName: branch.rawName,
      warehouse: branch.warehouse,
      status: branch.status,
      routeType: branch.routeType || "UNSPECIFIED",
      day: branch.day,
      sourceCell: branch.sourceCell,
      notes: branch.notes,
      source: "KNOWLEDGE_BASE",
      confirmedAt
    }))
  });

  return knowledge.branches.length;
}

export async function getBranchDirectoryOverview() {
  await ensureBranchDirectorySeeded();

  const [managed, customers, recentAudits, knowledge] = await Promise.all([
    prisma.branchDirectory.findMany({ orderBy: [{ status: "asc" }, { canonicalName: "asc" }] }),
    prisma.customer.findMany({
      where: { code: { not: null } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, kvCustomerId: true, code: true, name: true, updatedAt: true }
    }),
    prisma.branchDirectoryAudit.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { branchDirectory: { select: { canonicalName: true, customerCode: true } } }
    }),
    readKnowledgeMap()
  ]);
  const managedCodes = new Set(managed.flatMap((branch) => (branch.customerCode ? [normalizeCustomerCode(branch.customerCode)] : [])));
  const managedCustomerIds = new Set(managed.flatMap((branch) => (branch.kvCustomerId ? [branch.kvCustomerId] : [])));
  const deprecatedCodes = new Set((knowledge.deprecatedCustomers ?? []).map((customer) => normalizeCustomerCode(customer.code)));
  const candidates = customers
    .filter((customer) => {
      const code = normalizeCustomerCode(customer.code);
      return !deprecatedCodes.has(code) && !managedCodes.has(code) && !managedCustomerIds.has(customer.kvCustomerId);
    })
    .map((customer) => ({
      ...customer,
      code: normalizeCustomerCode(customer.code),
      likelyBranch: isLikelyBranchName(customer.name)
    }))
    .sort((a, b) => Number(b.likelyBranch) - Number(a.likelyBranch) || a.name.localeCompare(b.name, "vi"));

  return { managed, candidates, recentAudits };
}

export async function confirmBranchDirectory(input: {
  id?: number;
  kvCustomerId?: number;
  customerCode?: string;
  canonicalName: string;
  rawName?: string;
  warehouse: string;
  status: string;
  notes?: string;
}) {
  await ensureBranchDirectorySeeded();
  const canonicalName = input.canonicalName.trim();
  const customerCode = normalizeCustomerCode(input.customerCode);

  if (!canonicalName) {
    throw new Error("Tên chi nhánh không được để trống.");
  }

  if (!branchWarehouses.includes(input.warehouse as BranchWarehouse)) {
    throw new Error("Kho phụ trách không hợp lệ.");
  }

  if (!branchStatuses.includes(input.status as BranchStatus)) {
    throw new Error("Trạng thái chi nhánh không hợp lệ.");
  }

  if (!input.id && !customerCode && !input.kvCustomerId) {
    throw new Error("Cần có mã khách hoặc ID KiotViet để xác nhận chi nhánh.");
  }

  const previous = await prisma.branchDirectory.findFirst({
    where: {
      OR: [
        ...(input.id ? [{ id: input.id }] : []),
        ...(customerCode ? [{ customerCode }] : []),
        ...(input.kvCustomerId ? [{ kvCustomerId: input.kvCustomerId }] : []),
        { customerCode: null, canonicalName }
      ]
    }
  });
  const data = {
    customerCode: customerCode || previous?.customerCode || null,
    kvCustomerId: input.kvCustomerId ?? previous?.kvCustomerId ?? null,
    canonicalName,
    rawName: input.rawName?.trim() || previous?.rawName || canonicalName,
    warehouse: input.warehouse,
    status: input.status,
    routeType: previous?.routeType ?? "UNSPECIFIED",
    day: previous?.day ?? null,
    sourceCell: previous?.sourceCell ?? null,
    notes: input.notes?.trim() || previous?.notes || null,
    source: previous?.source ?? "DASHBOARD_CONFIRMATION",
    confirmedAt: new Date()
  };

  const branch = await prisma.$transaction(async (tx) => {
    const saved = previous
      ? await tx.branchDirectory.update({ where: { id: previous.id }, data })
      : await tx.branchDirectory.create({ data });

    await tx.branchDirectoryAudit.create({
      data: {
        branchDirectoryId: saved.id,
        action: previous ? "UPDATE" : "CONFIRM",
        previousJson: previous ? serializeBranch(previous) : null,
        nextJson: serializeBranch(saved)
      }
    });

    return saved;
  });

  await exportBranchKnowledgeBase();
  return branch;
}

export async function exportBranchKnowledgeBase() {
  const [knowledge, branches] = await Promise.all([
    readKnowledgeMap(),
    prisma.branchDirectory.findMany({ orderBy: { id: "asc" } })
  ]);
  const verifiedAt = formatLocalDate(new Date());
  const nextVersion = Number(knowledge.version || 0) + 1;
  const exportedBranches: KnowledgeBranch[] = branches.map((branch) => ({
    warehouse: branch.warehouse,
    day: branch.day,
    sourceCell: branch.sourceCell,
    rawName: branch.rawName,
    canonicalName: branch.canonicalName,
    customerCode: branch.customerCode,
    status: branch.status,
    routeType: branch.routeType,
    notes: branch.notes
  }));
  const nextKnowledge: KnowledgeMap = {
    ...knowledge,
    version: nextVersion,
    verifiedAt,
    counts: buildCounts(exportedBranches),
    branches: exportedBranches
  };
  const docsDir = path.join(process.cwd(), "docs", "knowledge");
  const canonicalPath = path.join(docsDir, "yagami-branch-warehouse-map.json");
  const skillPath = path.join(process.cwd(), ".codex", "skills", "yagami-data-analyst", "references", "branch-warehouse-map.json");
  const manifestPath = path.join(docsDir, "KNOWLEDGE_MANIFEST.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, unknown>;
  manifest.version = nextVersion;
  manifest.verifiedAt = verifiedAt;

  await Promise.all([
    fs.writeFile(canonicalPath, `${JSON.stringify(nextKnowledge, null, 2)}\n`, "utf8"),
    fs.writeFile(skillPath, `${JSON.stringify(nextKnowledge, null, 2)}\n`, "utf8"),
    fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    fs.writeFile(path.join(docsDir, "yagami-branches.csv"), buildCsv(nextKnowledge), "utf8"),
    fs.writeFile(path.join(docsDir, "yagami-branches.jsonl"), buildJsonl(nextKnowledge), "utf8"),
    fs.writeFile(path.join(docsDir, "yagami-branch-warehouse-map.md"), buildMarkdown(nextKnowledge), "utf8")
  ]);

  return { version: nextVersion, verifiedAt, records: exportedBranches.length };
}

function serializeBranch(branch: BranchDirectory) {
  return JSON.stringify({
    id: branch.id,
    customerCode: branch.customerCode,
    kvCustomerId: branch.kvCustomerId,
    canonicalName: branch.canonicalName,
    warehouse: branch.warehouse,
    status: branch.status,
    notes: branch.notes,
    confirmedAt: branch.confirmedAt?.toISOString() ?? null
  });
}

async function readKnowledgeMap() {
  const filePath = path.join(process.cwd(), "docs", "knowledge", "yagami-branch-warehouse-map.json");
  return JSON.parse(await fs.readFile(filePath, "utf8")) as KnowledgeMap;
}

function normalizeCustomerCode(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase();
}

function isLikelyBranchName(name: string) {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
  return /^(YAGAMI|HAKIMI|CHIBA)\b/.test(normalized);
}

function parseVerifiedDate(value: string) {
  const date = new Date(`${value}T00:00:00+07:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatLocalDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Saigon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(value);
}

function buildCounts(branches: KnowledgeBranch[]) {
  return {
    totalRouteEntries: branches.length,
    caoLanh: branches.filter((branch) => branch.warehouse === "CAO_LANH").length,
    binhDuong: branches.filter((branch) => branch.warehouse === "BINH_DUONG").length,
    activeWithKiotVietCode: branches.filter((branch) => branch.status === "ACTIVE" && branch.customerCode).length,
    plannedWithoutKiotVietCode: branches.filter((branch) => branch.status.startsWith("PLANNED") && !branch.customerCode).length
  };
}

function buildCsv(knowledge: KnowledgeMap) {
  const fields: Array<keyof KnowledgeBranch> = [
    "warehouse",
    "day",
    "sourceCell",
    "rawName",
    "canonicalName",
    "customerCode",
    "status",
    "routeType",
    "notes"
  ];
  const rows = [fields.join(","), ...knowledge.branches.map((branch) => fields.map((field) => csvCell(branch[field])).join(","))];
  return `${rows.join("\r\n")}\r\n`;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildJsonl(knowledge: KnowledgeMap) {
  return `${knowledge.branches
    .map((branch) => JSON.stringify({ knowledge: "yagami-branch-warehouse-map", version: knowledge.version, verifiedAt: knowledge.verifiedAt, ...branch }))
    .join("\n")}\n`;
}

function buildMarkdown(knowledge: KnowledgeMap) {
  const groups = branchWarehouses.map((warehouse) => ({
    warehouse,
    branches: knowledge.branches.filter((branch) => branch.warehouse === warehouse)
  }));
  const lines = [
    "# Yagami Branch and Warehouse Map",
    "",
    `Verified: ${knowledge.verifiedAt}`,
    `Knowledge version: ${knowledge.version}`,
    "",
    "Database xác nhận trên Yagami Dashboard là nguồn vận hành; file này là bản xuất dễ đọc cho AI và con người.",
    ""
  ];

  for (const group of groups) {
    lines.push(`## ${group.warehouse}`, "");
    for (const branch of group.branches) {
      lines.push(`- ${branch.canonicalName} | ${branch.customerCode ?? "Chưa có mã"} | ${branch.status} | ${branch.routeType}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}
