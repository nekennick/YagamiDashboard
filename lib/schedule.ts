import { prisma } from "@/lib/prisma";
import { syncKiotViet, type SyncType } from "@/lib/kiotviet/sync";

export type ScheduledSyncType = Exclude<SyncType, "all">;

export type ScheduleSettings = {
  enabled: boolean;
  intervalMinutes: number;
  syncTypes: ScheduledSyncType[];
  lastRunAt: string | null;
};

const defaultSyncTypes: ScheduledSyncType[] = ["branches", "products", "customers", "invoices", "inventory"];
const schedulerGlobal = globalThis as typeof globalThis & {
  yagamiAutoSyncInterval?: ReturnType<typeof setInterval>;
  yagamiAutoSyncRunning?: boolean;
};

export async function getScheduleSettings(): Promise<ScheduleSettings> {
  const settings = await prisma.appSetting.findMany({
    where: {
      key: {
        in: ["autoSyncEnabled", "autoSyncIntervalMinutes", "autoSyncTypes", "autoSyncLastRunAt"]
      }
    }
  });
  const map = new Map(settings.map((setting) => [setting.key, setting.value]));

  return {
    enabled: map.get("autoSyncEnabled") === "true",
    intervalMinutes: normalizeInterval(Number(map.get("autoSyncIntervalMinutes") ?? 60)),
    syncTypes: parseSyncTypes(map.get("autoSyncTypes")),
    lastRunAt: map.get("autoSyncLastRunAt") ?? null
  };
}

export async function saveScheduleSettings(settings: Pick<ScheduleSettings, "enabled" | "intervalMinutes" | "syncTypes">) {
  const normalized = {
    enabled: settings.enabled,
    intervalMinutes: normalizeInterval(settings.intervalMinutes),
    syncTypes: normalizeSyncTypes(settings.syncTypes)
  };

  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key: "autoSyncEnabled" },
      create: { key: "autoSyncEnabled", value: String(normalized.enabled) },
      update: { value: String(normalized.enabled) }
    }),
    prisma.appSetting.upsert({
      where: { key: "autoSyncIntervalMinutes" },
      create: { key: "autoSyncIntervalMinutes", value: String(normalized.intervalMinutes) },
      update: { value: String(normalized.intervalMinutes) }
    }),
    prisma.appSetting.upsert({
      where: { key: "autoSyncTypes" },
      create: { key: "autoSyncTypes", value: JSON.stringify(normalized.syncTypes) },
      update: { value: JSON.stringify(normalized.syncTypes) }
    })
  ]);

  return normalized;
}

export function ensureAutoSyncScheduler() {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  if (schedulerGlobal.yagamiAutoSyncInterval) {
    return;
  }

  schedulerGlobal.yagamiAutoSyncInterval = setInterval(() => {
    void runAutoSyncIfDue();
  }, 60_000);
}

export async function runScheduledSyncNow() {
  const settings = await getScheduleSettings();
  return runScheduledSync(settings.syncTypes);
}

async function runAutoSyncIfDue() {
  if (schedulerGlobal.yagamiAutoSyncRunning) {
    return;
  }

  const settings = await getScheduleSettings();

  if (!settings.enabled) {
    return;
  }

  const lastRunAt = settings.lastRunAt ? new Date(settings.lastRunAt).getTime() : 0;
  const elapsedMinutes = (Date.now() - lastRunAt) / 60_000;

  if (lastRunAt > 0 && elapsedMinutes < settings.intervalMinutes) {
    return;
  }

  await runScheduledSync(settings.syncTypes);
}

async function runScheduledSync(syncTypes: ScheduledSyncType[]) {
  schedulerGlobal.yagamiAutoSyncRunning = true;

  try {
    const results = [];

    for (const syncType of normalizeSyncTypes(syncTypes)) {
      const [result] = await syncKiotViet(syncType);
      results.push(result);
    }

    await prisma.appSetting.upsert({
      where: { key: "autoSyncLastRunAt" },
      create: { key: "autoSyncLastRunAt", value: new Date().toISOString() },
      update: { value: new Date().toISOString() }
    });

    return results;
  } finally {
    schedulerGlobal.yagamiAutoSyncRunning = false;
  }
}

function normalizeInterval(value: number) {
  if ([30, 60, 180, 1440].includes(value)) {
    return value;
  }

  return 60;
}

function normalizeSyncTypes(value: ScheduledSyncType[]) {
  const allowed = new Set<ScheduledSyncType>(["branches", "products", "customers", "invoices", "invoiceHistory", "inventory"]);
  const normalized = value.filter((item): item is ScheduledSyncType => allowed.has(item));
  return normalized.length > 0 ? normalized : defaultSyncTypes;
}

function parseSyncTypes(value: string | undefined) {
  if (!value) {
    return defaultSyncTypes;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? normalizeSyncTypes(parsed) : defaultSyncTypes;
  } catch {
    return defaultSyncTypes;
  }
}
