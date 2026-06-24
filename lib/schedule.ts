import { prisma } from "@/lib/prisma";
import { syncKiotVietBatch, type SyncType } from "@/lib/kiotviet/sync";

export type ScheduledSyncType = Exclude<SyncType, "all">;

export type ScheduleSettings = {
  enabled: boolean;
  intervalMinutes: number;
  startTime: string;
  syncTypes: ScheduledSyncType[];
  lastRunAt: string | null;
};

const scheduledSyncRunOrder: ScheduledSyncType[] = [
  "branches",
  "products",
  "customers",
  "orders",
  "invoices",
  "invoiceHistory",
  "inventory"
];
const defaultSyncTypes: ScheduledSyncType[] = ["branches", "products", "customers", "orders", "invoices", "inventory"];
const schedulerGlobal = globalThis as typeof globalThis & {
  yagamiAutoSyncInterval?: ReturnType<typeof setInterval>;
  yagamiAutoSyncRunning?: boolean;
};

export async function getScheduleSettings(): Promise<ScheduleSettings> {
  const settings = await prisma.appSetting.findMany({
    where: {
      key: {
        in: ["autoSyncEnabled", "autoSyncIntervalMinutes", "autoSyncStartTime", "autoSyncTypes", "autoSyncLastRunAt"]
      }
    }
  });
  const map = new Map(settings.map((setting) => [setting.key, setting.value]));

  return {
    enabled: map.get("autoSyncEnabled") === "true",
    intervalMinutes: normalizeInterval(Number(map.get("autoSyncIntervalMinutes") ?? 60)),
    startTime: normalizeStartTime(map.get("autoSyncStartTime")),
    syncTypes: parseSyncTypes(map.get("autoSyncTypes")),
    lastRunAt: map.get("autoSyncLastRunAt") ?? null
  };
}

export async function saveScheduleSettings(settings: Pick<ScheduleSettings, "enabled" | "intervalMinutes" | "startTime" | "syncTypes">) {
  const normalized = {
    enabled: settings.enabled,
    intervalMinutes: normalizeInterval(settings.intervalMinutes),
    startTime: normalizeStartTime(settings.startTime),
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
      where: { key: "autoSyncStartTime" },
      create: { key: "autoSyncStartTime", value: normalized.startTime },
      update: { value: normalized.startTime }
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

  if (settings.intervalMinutes === 1440) {
    const scheduledAt = getTodayScheduledAt(settings.startTime);
    const now = Date.now();

    if (now < scheduledAt.getTime()) {
      return;
    }

    if (lastRunAt >= scheduledAt.getTime()) {
      return;
    }
  } else {
    const elapsedMinutes = (Date.now() - lastRunAt) / 60_000;

    if (lastRunAt > 0 && elapsedMinutes < settings.intervalMinutes) {
      return;
    }
  }

  await runScheduledSync(settings.syncTypes);
}

async function runScheduledSync(syncTypes: ScheduledSyncType[]) {
  schedulerGlobal.yagamiAutoSyncRunning = true;

  try {
    const results = await syncKiotVietBatch(normalizeSyncTypes(syncTypes));

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

function normalizeStartTime(value: string | undefined) {
  if (value && /^\d{2}:\d{2}$/.test(value)) {
    const [hour, minute] = value.split(":").map(Number);

    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return value;
    }
  }

  return "17:00";
}

function getTodayScheduledAt(startTime: string) {
  const [hour, minute] = normalizeStartTime(startTime).split(":").map(Number);
  const scheduledAt = new Date();
  scheduledAt.setHours(hour, minute, 0, 0);
  return scheduledAt;
}

function normalizeSyncTypes(value: ScheduledSyncType[]) {
  const allowed = new Set<ScheduledSyncType>(scheduledSyncRunOrder);
  const selected = new Set(value.filter((item): item is ScheduledSyncType => allowed.has(item)));
  const normalized = scheduledSyncRunOrder.filter((item) => selected.has(item));
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
