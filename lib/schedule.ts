import { prisma } from "@/lib/prisma";
import { syncKiotVietBatch, type SyncType } from "@/lib/kiotviet/sync";

export type ScheduledSyncType = Exclude<SyncType, "all">;
export type ScheduleGroupId = "foundation" | "transaction" | "inventory" | "history";

export type ScheduleGroupSetting = {
  id: ScheduleGroupId;
  label: string;
  description: string;
  enabled: boolean;
  intervalMinutes: number;
  startTime: string;
  syncTypes: ScheduledSyncType[];
  lastRunAt: string | null;
};

export type ScheduleSettings = {
  enabled: boolean;
  intervalMinutes: number;
  startTime: string;
  syncTypes: ScheduledSyncType[];
  lastRunAt: string | null;
  groups: ScheduleGroupSetting[];
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

const defaultScheduleGroups: ScheduleGroupSetting[] = [
  {
    id: "transaction",
    label: "Giao dịch",
    description: "Đơn đặt hàng và hóa đơn gần đây, cập nhật tăng dần.",
    enabled: true,
    intervalMinutes: 60,
    startTime: "08:00",
    syncTypes: ["orders", "invoices"],
    lastRunAt: null
  },
  {
    id: "foundation",
    label: "Dữ liệu nền",
    description: "Chi nhánh, sản phẩm và khách hàng.",
    enabled: true,
    intervalMinutes: 1440,
    startTime: "06:00",
    syncTypes: ["branches", "products", "customers"],
    lastRunAt: null
  },
  {
    id: "inventory",
    label: "Tồn kho",
    description: "Snapshot tồn kho hiện tại, nên chạy sau cùng.",
    enabled: true,
    intervalMinutes: 1440,
    startTime: "17:00",
    syncTypes: ["inventory"],
    lastRunAt: null
  },
  {
    id: "history",
    label: "Dữ liệu cũ",
    description: "Lịch sử hóa đơn, chỉ nên chạy thủ công khi cần.",
    enabled: false,
    intervalMinutes: 1440,
    startTime: "22:00",
    syncTypes: ["invoiceHistory"],
    lastRunAt: null
  }
];

const schedulerGlobal = globalThis as typeof globalThis & {
  yagamiAutoSyncInterval?: ReturnType<typeof setInterval>;
  yagamiAutoSyncRunning?: boolean;
};

export async function getScheduleSettings(): Promise<ScheduleSettings> {
  const settings = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [
          "autoSyncEnabled",
          "autoSyncIntervalMinutes",
          "autoSyncStartTime",
          "autoSyncTypes",
          "autoSyncLastRunAt",
          "autoSyncGroups"
        ]
      }
    }
  });
  const map = new Map(settings.map((setting) => [setting.key, setting.value]));
  const legacy = {
    enabled: map.get("autoSyncEnabled") === "true",
    intervalMinutes: normalizeInterval(Number(map.get("autoSyncIntervalMinutes") ?? 60)),
    startTime: normalizeStartTime(map.get("autoSyncStartTime")),
    syncTypes: parseSyncTypes(map.get("autoSyncTypes")),
    lastRunAt: map.get("autoSyncLastRunAt") ?? null
  };

  return {
    ...legacy,
    groups: parseScheduleGroups(map.get("autoSyncGroups"), legacy.lastRunAt)
  };
}

export async function saveScheduleSettings(settings: {
  enabled: boolean;
  intervalMinutes?: number;
  startTime?: string;
  syncTypes?: ScheduledSyncType[];
  groups?: ScheduleGroupSetting[];
}) {
  const normalizedGroups = normalizeScheduleGroups(settings.groups);
  const fallbackGroup = normalizedGroups.find((group) => group.id === "transaction") ?? normalizedGroups[0];
  const normalized = {
    enabled: settings.enabled,
    intervalMinutes: normalizeInterval(settings.intervalMinutes ?? fallbackGroup?.intervalMinutes ?? 60),
    startTime: normalizeStartTime(settings.startTime ?? fallbackGroup?.startTime),
    syncTypes: normalizeSyncTypes(settings.syncTypes ?? flattenGroupSyncTypes(normalizedGroups)),
    groups: normalizedGroups
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
    }),
    prisma.appSetting.upsert({
      where: { key: "autoSyncGroups" },
      create: { key: "autoSyncGroups", value: JSON.stringify(normalized.groups) },
      update: { value: JSON.stringify(normalized.groups) }
    })
  ]);

  return {
    ...normalized,
    lastRunAt: null
  };
}

export function ensureAutoSyncScheduler() {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  if (schedulerGlobal.yagamiAutoSyncInterval) {
    return;
  }

  schedulerGlobal.yagamiAutoSyncInterval = setInterval(() => {
    void runAutoSyncIfDue().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[auto-sync] Khong the kiem tra lich dong bo: ${message}`);
    });
  }, 60_000);
}

export async function runScheduledSyncNow(groupId?: ScheduleGroupId) {
  const settings = await getScheduleSettings();
  const groups = groupId
    ? settings.groups.filter((group) => group.id === groupId)
    : settings.groups.filter((group) => group.enabled);

  return runScheduledGroups(groups.length > 0 ? groups : settings.groups.filter((group) => group.id === "transaction"));
}

async function runAutoSyncIfDue() {
  if (schedulerGlobal.yagamiAutoSyncRunning) {
    return;
  }

  const settings = await getScheduleSettings();

  if (!settings.enabled) {
    return;
  }

  const dueGroups = settings.groups.filter((group) => group.enabled && isGroupDue(group));

  if (dueGroups.length === 0) {
    return;
  }

  await runScheduledGroups(dueGroups);
}

async function runScheduledGroups(groups: ScheduleGroupSetting[]) {
  schedulerGlobal.yagamiAutoSyncRunning = true;

  try {
    const normalizedGroups = normalizeSelectedScheduleGroups(groups);
    const syncTypes = flattenGroupSyncTypes(normalizedGroups);
    const results = await syncKiotVietBatch(syncTypes);
    const now = new Date().toISOString();
    const currentSettings = await getScheduleSettings();
    const ranGroupIds = new Set(normalizedGroups.map((group) => group.id));
    const nextGroups = currentSettings.groups.map((group) =>
      ranGroupIds.has(group.id) ? { ...group, lastRunAt: now } : group
    );

    await prisma.$transaction([
      prisma.appSetting.upsert({
        where: { key: "autoSyncLastRunAt" },
        create: { key: "autoSyncLastRunAt", value: now },
        update: { value: now }
      }),
      prisma.appSetting.upsert({
        where: { key: "autoSyncGroups" },
        create: { key: "autoSyncGroups", value: JSON.stringify(nextGroups) },
        update: { value: JSON.stringify(nextGroups) }
      })
    ]);

    return results;
  } finally {
    schedulerGlobal.yagamiAutoSyncRunning = false;
  }
}

function isGroupDue(group: ScheduleGroupSetting) {
  const lastRunAt = group.lastRunAt ? new Date(group.lastRunAt).getTime() : 0;

  if (group.intervalMinutes === 1440) {
    const scheduledAt = getTodayScheduledAt(group.startTime);
    const now = Date.now();

    if (now < scheduledAt.getTime()) {
      return false;
    }

    return lastRunAt < scheduledAt.getTime();
  }

  const elapsedMinutes = (Date.now() - lastRunAt) / 60_000;
  return lastRunAt === 0 || elapsedMinutes >= group.intervalMinutes;
}

function normalizeInterval(value: number) {
  if ([15, 30, 60, 180, 360, 720, 1440].includes(value)) {
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

function flattenGroupSyncTypes(groups: ScheduleGroupSetting[]) {
  return normalizeSyncTypes(groups.flatMap((group) => group.syncTypes));
}

function normalizeScheduleGroups(groups?: ScheduleGroupSetting[]) {
  const byId = new Map((groups ?? []).map((group) => [group.id, group]));

  return defaultScheduleGroups.map((defaultGroup) => {
    const group = byId.get(defaultGroup.id);

    return {
      ...defaultGroup,
      ...group,
      enabled: Boolean(group?.enabled ?? defaultGroup.enabled),
      intervalMinutes: normalizeInterval(Number(group?.intervalMinutes ?? defaultGroup.intervalMinutes)),
      startTime: normalizeStartTime(group?.startTime ?? defaultGroup.startTime),
      syncTypes: normalizeSyncTypes(group?.syncTypes ?? defaultGroup.syncTypes),
      lastRunAt: group?.lastRunAt ?? defaultGroup.lastRunAt
    };
  });
}

function normalizeSelectedScheduleGroups(groups: ScheduleGroupSetting[]) {
  const defaultById = new Map(defaultScheduleGroups.map((group) => [group.id, group]));
  const seen = new Set<ScheduleGroupId>();
  const normalized: ScheduleGroupSetting[] = [];

  for (const group of groups) {
    if (seen.has(group.id)) {
      continue;
    }

    const defaultGroup = defaultById.get(group.id);

    if (!defaultGroup) {
      continue;
    }

    normalized.push({
      ...defaultGroup,
      ...group,
      enabled: Boolean(group.enabled ?? defaultGroup.enabled),
      intervalMinutes: normalizeInterval(Number(group.intervalMinutes ?? defaultGroup.intervalMinutes)),
      startTime: normalizeStartTime(group.startTime ?? defaultGroup.startTime),
      syncTypes: normalizeSyncTypes(group.syncTypes ?? defaultGroup.syncTypes),
      lastRunAt: group.lastRunAt ?? defaultGroup.lastRunAt
    });
    seen.add(group.id);
  }

  return normalized;
}

function parseScheduleGroups(value: string | undefined, legacyLastRunAt: string | null) {
  if (!value) {
    return defaultScheduleGroups.map((group) => ({ ...group, lastRunAt: group.lastRunAt ?? legacyLastRunAt }));
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? normalizeScheduleGroups(parsed) : normalizeScheduleGroups();
  } catch {
    return normalizeScheduleGroups();
  }
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
