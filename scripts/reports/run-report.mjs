import fs from "node:fs";
import path from "node:path";

loadEnv();
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const timezone = "Asia/Saigon";
const localUtcOffsetMs = 7 * 60 * 60 * 1000;
const websiteSaleChannelId = 226442;
const websiteRolloutDate = "2026-06-01";

const preset = process.argv[2] || "daily";
const args = parseArgs(process.argv.slice(3));

function loadEnv() {
  const envPath = ".env";
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

function localDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

function parseLocalDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid date: ${value}. Expected YYYY-MM-DD.`);
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function startOfLocalDay(parts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - localUtcOffsetMs);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function currentRange() {
  if (args.from || args.to) {
    if (!args.from || !args.to) throw new Error("Use both --from and --to for a custom range.");
    const from = startOfLocalDay(parseLocalDate(args.from));
    const to = addDays(startOfLocalDay(parseLocalDate(args.to)), 1);
    return { from, to, label: `${formatDate(from)} đến ${formatDate(addDays(to, -1))}` };
  }

  if (args.date) {
    const from = startOfLocalDay(parseLocalDate(args.date));
    return { from, to: addDays(from, 1), label: formatDate(from) };
  }

  const today = localDateParts();
  if (preset === "daily") {
    const from = startOfLocalDay(today);
    return { from, to: addDays(from, 1), label: formatDate(from) };
  }

  if (preset === "website") {
    const from = startOfLocalDay(parseLocalDate(websiteRolloutDate));
    const tomorrow = addDays(startOfLocalDay(today), 1);
    return { from, to: tomorrow, label: `${formatDate(from)} đến ${formatDate(addDays(tomorrow, -1))}` };
  }

  const monthStart = startOfLocalDay({ year: today.year, month: today.month, day: 1 });
  const tomorrow = addDays(startOfLocalDay(today), 1);
  return { from: monthStart, to: tomorrow, label: `${formatDate(monthStart)} đến ${formatDate(addDays(tomorrow, -1))}` };
}

function formatDate(date) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTime(date) {
  if (!date) return "Không có";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function number(value, fractionDigits = 0) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: fractionDigits }).format(Number(value || 0));
}

function money(value) {
  return `${number(value)} đ`;
}

function decimal(value) {
  return Number(value || 0);
}

function safeJson(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function includesWebsiteChannel(invoice) {
  const raw = safeJson(invoice.rawJson);
  const saleChannelId = raw?.saleChannelId ?? raw?.saleChannel?.id;
  const saleChannelName = String(raw?.saleChannelName ?? raw?.saleChannel?.name ?? "").toLowerCase();
  return saleChannelId === websiteSaleChannelId || saleChannelName.includes("website");
}

function groupRows(rows, keyFn, seedFn, updateFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, seedFn(row));
    updateFn(map.get(key), row);
  }
  return [...map.values()];
}

function normalizeCustomerCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

function groupBranchesByWarehouse(branches) {
  return groupRows(
    branches,
    (branch) => branch.warehouse,
    (branch) => ({ warehouse: branch.warehouse, count: 0, branches: [] }),
    (entry, branch) => {
      entry.count += 1;
      entry.branches.push(branch.canonicalName);
    },
  );
}

function topRows(rows, count, sortFn) {
  return [...rows].sort(sortFn).slice(0, count);
}

function markdownTable(headers, rows) {
  if (!rows.length) return "_Không có dữ liệu._";
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell ?? "").replace(/\|/g, "\\|")).join(" | ")} |`),
  ].join("\n");
}

async function freshness() {
  const [syncLogs, settings] = await Promise.all([
    prisma.syncLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
    prisma.appSetting.findMany({
      where: { key: { in: ["invoiceRecentSyncedAt", "orderRecentSyncedAt", "inventoryLastSyncedAt", "autoSyncLastRunAt"] } },
    }),
  ]);

  return {
    settings: Object.fromEntries(settings.map((setting) => [setting.key, setting.value])),
    recentSyncLogs: syncLogs.map((log) => ({
      type: log.syncType,
      status: log.status,
      startedAt: log.startedAt,
      finishedAt: log.finishedAt,
      totalRecords: log.totalRecords,
      errorMessage: log.errorMessage,
    })),
  };
}

async function reportDaily(range) {
  const [invoices, orders, inventory, fresh] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: "Hoàn thành", purchaseDate: { gte: range.from, lt: range.to } },
      include: { customer: true, branch: true, items: { include: { product: true } } },
      orderBy: { purchaseDate: "desc" },
    }),
    prisma.order.findMany({
      where: { statusValue: "Phiếu tạm", purchaseDate: { gte: range.from, lt: range.to } },
      include: { customer: true, items: { include: { product: true } } },
      orderBy: { purchaseDate: "desc" },
    }),
    latestInventorySummary(),
    freshness(),
  ]);

  return buildCommerceReport({
    title: "Báo cáo nhanh hằng ngày",
    preset: "daily",
    range,
    invoices,
    orders,
    inventory,
    fresh,
  });
}

async function reportSales(range) {
  const [invoices, fresh] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: "Hoàn thành", purchaseDate: { gte: range.from, lt: range.to } },
      include: { customer: true, branch: true, items: { include: { product: true } } },
      orderBy: { total: "desc" },
    }),
    freshness(),
  ]);

  return buildCommerceReport({
    title: "Báo cáo bán hàng",
    preset: "sales",
    range,
    invoices,
    orders: [],
    inventory: null,
    fresh,
  });
}

async function reportWebsite(range) {
  const branchMap = JSON.parse(fs.readFileSync("docs/knowledge/yagami-branch-warehouse-map.json", "utf8"));
  const directoryBranches = await loadBranchDirectoryForReport(branchMap);
  const activeBranches = directoryBranches.filter((branch) => branch.status === "ACTIVE" && branch.customerCode);
  const branchByCode = new Map(activeBranches.map((branch) => [normalizeCustomerCode(branch.customerCode), branch]));
  const invoices = await prisma.invoice.findMany({
    where: { status: "Hoàn thành", purchaseDate: { gte: range.from, lt: range.to } },
    include: { customer: true, branch: true },
    orderBy: { purchaseDate: "desc" },
  });
  const websiteInvoices = invoices.filter(includesWebsiteChannel);
  const websiteCodes = new Set(
    websiteInvoices
      .map((invoice) => normalizeCustomerCode(invoice.customer?.code))
      .filter(Boolean),
  );
  const websiteBranches = activeBranches.filter((branch) => websiteCodes.has(normalizeCustomerCode(branch.customerCode)));
  const noWebsite = activeBranches.filter((branch) => !websiteCodes.has(normalizeCustomerCode(branch.customerCode)));
  const websiteByWarehouse = groupBranchesByWarehouse(websiteBranches);
  const noWebsiteByWarehouse = groupRows(
    noWebsite,
    (branch) => branch.warehouse,
    (branch) => ({ warehouse: branch.warehouse, count: 0, branches: [] }),
    (entry, branch) => {
      entry.count += 1;
      entry.branches.push(branch.canonicalName);
    },
  );

  const customerRows = topRows(
    groupRows(
      websiteInvoices,
      (invoice) => invoice.customer?.code || invoice.customer?.name || "Không rõ",
      (invoice) => ({
        customerCode: invoice.customer?.code || "",
        customerName: invoice.customer?.name || "Không rõ",
        warehouse: branchByCode.get(normalizeCustomerCode(invoice.customer?.code))?.warehouse || "CHƯA MAP",
        invoices: 0,
        revenue: 0,
      }),
      (entry, invoice) => {
        entry.invoices += 1;
        entry.revenue += decimal(invoice.total);
      },
    ),
    15,
    (a, b) => b.revenue - a.revenue,
  );

  const fresh = await freshness();
  const markdown = [
    `# Báo cáo hóa đơn website`,
    "",
    `- Kỳ báo cáo: **${range.label}**`,
    `- Nguồn dữ liệu: \`Invoice\`, \`Customer\`, \`BranchDirectory\` (knowledge base là bản xuất chia sẻ)`,
    `- Bộ lọc: \`Invoice.status = Hoàn thành\`, kênh bán website \`saleChannelId = ${websiteSaleChannelId}\` hoặc tên kênh có chữ website`,
    `- Knowledge version: \`${branchMap.version}\`, verifiedAt: \`${branchMap.verifiedAt}\``,
    "",
    "## Tổng quan",
    "",
    markdownTable(
      ["Chỉ số", "Giá trị"],
      [
        ["Hóa đơn website", number(websiteInvoices.length)],
        ["Doanh thu website", money(websiteInvoices.reduce((sum, invoice) => sum + decimal(invoice.total), 0))],
        ["Chi nhánh đang hoạt động", number(activeBranches.length)],
        ["Chi nhánh đã phát sinh đơn website", number(websiteBranches.length)],
        ["Chi nhánh chưa phát sinh đơn website", number(noWebsite.length)],
      ],
    ),
    "",
    "## Đã phát sinh website theo kho",
    "",
    markdownTable(
      ["Kho", "Số chi nhánh", "Danh sách"],
      websiteByWarehouse.map((entry) => [entry.warehouse, number(entry.count), entry.branches.join("; ")]),
    ),
    "",
    "## Chưa phát sinh website theo kho",
    "",
    markdownTable(
      ["Kho", "Số chi nhánh", "Danh sách"],
      noWebsiteByWarehouse.map((entry) => [entry.warehouse, number(entry.count), entry.branches.join("; ")]),
    ),
    "",
    "## Top khách website theo doanh thu",
    "",
    markdownTable(
      ["STT", "Khách hàng", "Mã KH", "Kho", "Hóa đơn", "Doanh thu"],
      customerRows.map((row, index) => [
        index + 1,
        row.customerName,
        row.customerCode,
        row.warehouse,
        number(row.invoices),
        money(row.revenue),
      ]),
    ),
    "",
    syncSection(fresh),
  ].join("\n");

  return {
    title: "Báo cáo hóa đơn website",
    preset: "website",
    range: serializeRange(range),
    metrics: {
      websiteInvoices: websiteInvoices.length,
      websiteRevenue: websiteInvoices.reduce((sum, invoice) => sum + decimal(invoice.total), 0),
      activeBranches: activeBranches.length,
      branchesWithWebsite: websiteBranches.length,
      branchesWithoutWebsite: noWebsite.length,
      branchesWithWebsiteByWarehouse: websiteByWarehouse,
      branchesWithoutWebsiteByWarehouse: noWebsiteByWarehouse,
      topCustomers: customerRows,
    },
    freshness: fresh,
    markdown,
  };
}

async function loadBranchDirectoryForReport(branchMap) {
  const count = await prisma.branchDirectory.count();

  if (count === 0) {
    const customers = await prisma.customer.findMany({
      where: { code: { not: null } },
      select: { code: true, kvCustomerId: true },
    });
    const customerByCode = new Map(customers.map((customer) => [normalizeCustomerCode(customer.code), customer.kvCustomerId]));
    const confirmedAt = new Date(`${branchMap.verifiedAt}T00:00:00+07:00`);

    await prisma.branchDirectory.createMany({
      data: branchMap.branches.map((branch) => ({
        customerCode: branch.customerCode ? normalizeCustomerCode(branch.customerCode) : null,
        kvCustomerId: branch.customerCode ? customerByCode.get(normalizeCustomerCode(branch.customerCode)) ?? null : null,
        canonicalName: branch.canonicalName,
        rawName: branch.rawName ?? null,
        warehouse: branch.warehouse,
        status: branch.status,
        routeType: branch.routeType || "UNSPECIFIED",
        day: branch.day ?? null,
        sourceCell: branch.sourceCell ?? null,
        notes: branch.notes ?? null,
        source: "KNOWLEDGE_BASE",
        confirmedAt: Number.isNaN(confirmedAt.getTime()) ? new Date() : confirmedAt,
      })),
    });
  }

  return prisma.branchDirectory.findMany({
    orderBy: { id: "asc" },
    select: {
      warehouse: true,
      day: true,
      sourceCell: true,
      rawName: true,
      canonicalName: true,
      customerCode: true,
      status: true,
      routeType: true,
      notes: true,
    },
  });
}

async function reportInventory() {
  const [inventory, fresh] = await Promise.all([latestInventorySummary(true), freshness()]);
  const markdown = [
    "# Báo cáo tồn kho",
    "",
    `- Snapshot mới nhất: **${formatDateTime(inventory.snapshotDate)}**`,
    "- Nguồn dữ liệu: `InventorySnapshot`, `Product`, `Branch`",
    "- Bộ lọc: chỉ dùng snapshot mới nhất, không cộng dồn nhiều snapshot.",
    "",
    "## Tổng quan",
    "",
    markdownTable(
      ["Chỉ số", "Giá trị"],
      [
        ["Dòng tồn kho", number(inventory.totalRows)],
        ["Tổng tồn", number(inventory.totalOnHand, 2)],
        ["Tổng đặt giữ", number(inventory.totalReserved, 2)],
        ["Tồn âm", number(inventory.negativeRows)],
        ["Hết hàng", number(inventory.zeroRows)],
      ],
    ),
    "",
    "## Tồn âm lớn nhất",
    "",
    markdownTable(
      ["STT", "Sản phẩm", "Mã", "Chi nhánh", "Tồn"],
      inventory.topNegative.map((row, index) => [
        index + 1,
        row.productName,
        row.productCode,
        row.branchName,
        number(row.onHand, 2),
      ]),
    ),
    "",
    "## Tồn cao nhất",
    "",
    markdownTable(
      ["STT", "Sản phẩm", "Mã", "Chi nhánh", "Tồn"],
      inventory.topHighStock.map((row, index) => [
        index + 1,
        row.productName,
        row.productCode,
        row.branchName,
        number(row.onHand, 2),
      ]),
    ),
    "",
    syncSection(fresh),
  ].join("\n");

  return {
    title: "Báo cáo tồn kho",
    preset: "inventory",
    range: null,
    metrics: inventory,
    freshness: fresh,
    markdown,
  };
}

function buildCommerceReport({ title, preset: reportPreset, range, invoices, orders, inventory, fresh }) {
  const revenue = invoices.reduce((sum, invoice) => sum + decimal(invoice.total), 0);
  const distinctCustomers = new Set(invoices.map((invoice) => invoice.customerId).filter(Boolean)).size;
  const items = invoices.flatMap((invoice) =>
    invoice.items.map((item) => ({
      invoice,
      item,
      product: item.product,
    })),
  );

  const topProducts = topRows(
    groupRows(
      items,
      (row) => row.product?.code || row.product?.name || row.item.id,
      (row) => ({
        productCode: row.product?.code || "",
        productName: row.product?.name || "Không rõ",
        quantity: 0,
        revenue: 0,
        invoices: new Set(),
      }),
      (entry, row) => {
        entry.quantity += decimal(row.item.quantity);
        entry.revenue += decimal(row.item.subtotal);
        entry.invoices.add(row.invoice.id);
      },
    ).map((row) => ({ ...row, invoices: row.invoices.size })),
    10,
    (a, b) => b.revenue - a.revenue,
  );

  const topCustomers = topRows(
    groupRows(
      invoices,
      (invoice) => invoice.customer?.code || invoice.customer?.name || "Không rõ",
      (invoice) => ({
        customerCode: invoice.customer?.code || "",
        customerName: invoice.customer?.name || "Không rõ",
        invoices: 0,
        revenue: 0,
      }),
      (entry, invoice) => {
        entry.invoices += 1;
        entry.revenue += decimal(invoice.total);
      },
    ),
    10,
    (a, b) => b.revenue - a.revenue,
  );

  const orderValue = orders.reduce((sum, order) => sum + decimal(order.total), 0);
  const markdown = [
    `# ${title}`,
    "",
    `- Kỳ báo cáo: **${range.label}**`,
    "- Nguồn dữ liệu: `Invoice`, `InvoiceItem`, `Order`, `OrderItem`, `InventorySnapshot`, `SyncLog`, `AppSetting`",
    "- Bộ lọc hóa đơn: `Invoice.status = Hoàn thành`",
    "- Bộ lọc đơn đặt: `Order.statusValue = Phiếu tạm`",
    "",
    "## Tổng quan",
    "",
    markdownTable(
      ["Chỉ số", "Giá trị"],
      [
        ["Hóa đơn hoàn thành", number(invoices.length)],
        ["Doanh thu", money(revenue)],
        ["Khách đã mua", number(distinctCustomers)],
        ["Đơn đặt phiếu tạm", number(orders.length)],
        ["Giá trị phiếu tạm", money(orderValue)],
        ...(inventory
          ? [
              ["Snapshot tồn kho mới nhất", formatDateTime(inventory.snapshotDate)],
              ["Dòng tồn âm", number(inventory.negativeRows)],
            ]
          : []),
      ],
    ),
    "",
    "## Top sản phẩm theo doanh thu",
    "",
    markdownTable(
      ["STT", "Sản phẩm", "Mã", "Số lượng", "Lượt hóa đơn", "Doanh thu"],
      topProducts.map((row, index) => [
        index + 1,
        row.productName,
        row.productCode,
        number(row.quantity, 2),
        number(row.invoices),
        money(row.revenue),
      ]),
    ),
    "",
    "## Top khách hàng theo doanh thu",
    "",
    markdownTable(
      ["STT", "Khách hàng", "Mã KH", "Hóa đơn", "Doanh thu"],
      topCustomers.map((row, index) => [
        index + 1,
        row.customerName,
        row.customerCode,
        number(row.invoices),
        money(row.revenue),
      ]),
    ),
    "",
    syncSection(fresh),
  ].join("\n");

  return {
    title,
    preset: reportPreset,
    range: serializeRange(range),
    metrics: {
      invoiceCount: invoices.length,
      revenue,
      distinctCustomers,
      temporaryOrderCount: orders.length,
      temporaryOrderValue: orderValue,
      topProducts,
      topCustomers,
      inventory,
    },
    freshness: fresh,
    markdown,
  };
}

async function latestInventorySummary(includeRows = false) {
  const latest = await prisma.inventorySnapshot.findFirst({
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });
  if (!latest) {
    return {
      snapshotDate: null,
      totalRows: 0,
      totalOnHand: 0,
      totalReserved: 0,
      negativeRows: 0,
      zeroRows: 0,
      topNegative: [],
      topHighStock: [],
    };
  }

  const rows = await prisma.inventorySnapshot.findMany({
    where: { snapshotDate: latest.snapshotDate },
    include: { product: true, branch: true },
  });
  const mapped = rows.map((row) => ({
    productName: row.product.name,
    productCode: row.product.code || "",
    branchName: row.branch.name,
    onHand: decimal(row.onHand),
    reserved: decimal(row.reserved),
    actualReserved: decimal(row.actualReserved),
  }));

  const summary = {
    snapshotDate: latest.snapshotDate,
    totalRows: rows.length,
    totalOnHand: mapped.reduce((sum, row) => sum + row.onHand, 0),
    totalReserved: mapped.reduce((sum, row) => sum + row.reserved, 0),
    negativeRows: mapped.filter((row) => row.onHand < 0).length,
    zeroRows: mapped.filter((row) => row.onHand === 0).length,
    topNegative: topRows(
      mapped.filter((row) => row.onHand < 0),
      10,
      (a, b) => a.onHand - b.onHand,
    ),
    topHighStock: topRows(mapped, 10, (a, b) => b.onHand - a.onHand),
  };

  return includeRows ? summary : summary;
}

function syncSection(fresh) {
  const failed = fresh.recentSyncLogs.filter((log) => log.status !== "success").slice(0, 5);
  return [
    "## Độ mới dữ liệu",
    "",
    markdownTable(
      ["Mốc", "Giá trị"],
      Object.entries(fresh.settings).map(([key, value]) => [key, value]),
    ),
    "",
    "## Sync lỗi gần đây",
    "",
    markdownTable(
      ["Loại", "Trạng thái", "Bắt đầu", "Lỗi"],
      failed.map((log) => [log.type, log.status, formatDateTime(log.startedAt), log.errorMessage || ""]),
    ),
  ].join("\n");
}

function serializeRange(range) {
  return {
    label: range.label,
    from: range.from.toISOString(),
    toExclusive: range.to.toISOString(),
    timezone,
  };
}

async function run() {
  const range = currentRange();
  let report;

  if (preset === "daily") report = await reportDaily(range);
  else if (preset === "sales") report = await reportSales(range);
  else if (preset === "website") report = await reportWebsite(range);
  else if (preset === "inventory") report = await reportInventory();
  else {
    throw new Error(`Unknown report preset: ${preset}. Use daily, sales, website, or inventory.`);
  }

  const outputDir = args.out || "reports/output";
  fs.mkdirSync(outputDir, { recursive: true });
  const baseName = `${rangeStamp(report.range)}-${report.preset}`;
  const mdPath = path.join(outputDir, `${baseName}.md`);
  const jsonPath = path.join(outputDir, `${baseName}.json`);
  const reportKey = `${report.preset}:${rangeStamp(report.range)}`;

  fs.writeFileSync(mdPath, report.markdown, "utf8");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      report,
      (key, value) => {
        if (value instanceof Date) return value.toISOString();
        if (value instanceof Set) return [...value];
        return value;
      },
      2,
    ),
    "utf8",
  );

  await saveReportSnapshot(report, reportKey);

  console.log(`Report written: ${mdPath}`);
  console.log(`Report data: ${jsonPath}`);
  console.log(`Report snapshot: ${reportKey}`);
}

async function saveReportSnapshot(report, reportKey) {
  const payload = { ...report };
  delete payload.markdown;
  const metadata = reportMetadata(report.preset);

  await prisma.reportSnapshot.upsert({
    where: { reportKey },
    create: {
      reportKey,
      reportType: report.preset,
      periodLabel: report.range?.label ?? null,
      periodFrom: report.range?.from ? new Date(report.range.from) : null,
      periodTo: report.range?.toExclusive ? new Date(report.range.toExclusive) : null,
      title: report.title,
      payloadJson: stringifyForStorage(payload),
      markdown: report.markdown,
      sourceTablesJson: JSON.stringify(metadata.sourceTables),
      filtersJson: JSON.stringify(metadata.filters),
    },
    update: {
      periodLabel: report.range?.label ?? null,
      periodFrom: report.range?.from ? new Date(report.range.from) : null,
      periodTo: report.range?.toExclusive ? new Date(report.range.toExclusive) : null,
      title: report.title,
      payloadJson: stringifyForStorage(payload),
      markdown: report.markdown,
      sourceTablesJson: JSON.stringify(metadata.sourceTables),
      filtersJson: JSON.stringify(metadata.filters),
      generatedAt: new Date(),
    },
  });
}

function reportMetadata(reportPreset) {
  const common = {
    daily: {
      sourceTables: ["Invoice", "InvoiceItem", "Order", "OrderItem", "InventorySnapshot", "SyncLog", "AppSetting"],
      filters: {
        invoices: "Invoice.status = Hoàn thành",
        orders: "Order.statusValue = Phiếu tạm",
        inventory: "Latest InventorySnapshot.snapshotDate",
      },
    },
    sales: {
      sourceTables: ["Invoice", "InvoiceItem", "Customer", "Product", "SyncLog", "AppSetting"],
      filters: {
        invoices: "Invoice.status = Hoàn thành",
      },
    },
    website: {
      sourceTables: ["Invoice", "Customer", "BranchDirectory", "SyncLog", "AppSetting"],
      filters: {
        invoices: "Invoice.status = Hoàn thành",
        saleChannel: `saleChannelId = ${websiteSaleChannelId} OR saleChannelName contains website`,
      },
    },
    inventory: {
      sourceTables: ["InventorySnapshot", "Product", "Branch", "SyncLog", "AppSetting"],
      filters: {
        inventory: "Latest InventorySnapshot.snapshotDate only",
      },
    },
  };

  return common[reportPreset] ?? { sourceTables: [], filters: {} };
}

function stringifyForStorage(value) {
  return JSON.stringify(
    value,
    (key, item) => {
      if (item instanceof Date) return item.toISOString();
      if (item instanceof Set) return [...item];
      return item;
    },
    2,
  );
}

function compactDate(dateLike) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date(dateLike))
    .replaceAll("-", "");
}

function rangeStamp(range) {
  if (!range) return compactDate(new Date());
  const from = compactDate(range.from);
  const lastIncluded = compactDate(new Date(new Date(range.toExclusive).getTime() - 1));
  return from === lastIncluded ? from : `${from}-${lastIncluded}`;
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
