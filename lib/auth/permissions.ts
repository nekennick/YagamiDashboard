import { prisma } from "@/lib/prisma";
import {
  DEFAULT_MEMBER_TABS,
  MANAGEABLE_TABS,
  TabGroup,
  TabItem,
  memberTabsCookieName
} from "./permissions-constants";

export type { TabGroup, TabItem };
export { DEFAULT_MEMBER_TABS, MANAGEABLE_TABS, memberTabsCookieName };

export async function getMemberAllowedTabs(): Promise<string[]> {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: "MEMBER_ALLOWED_TABS" }
    });
    if (!setting?.value) return DEFAULT_MEMBER_TABS;
    const parsed = JSON.parse(setting.value);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return DEFAULT_MEMBER_TABS;
  } catch {
    return DEFAULT_MEMBER_TABS;
  }
}

export async function setMemberAllowedTabs(paths: string[]): Promise<string[]> {
  const validPathSet = new Set(MANAGEABLE_TABS.map((t) => t.path));
  const filtered = paths.filter((p) => validPathSet.has(p));
  const finalPaths = filtered.length > 0 ? filtered : DEFAULT_MEMBER_TABS;

  await prisma.appSetting.upsert({
    where: { key: "MEMBER_ALLOWED_TABS" },
    update: { value: JSON.stringify(finalPaths) },
    create: { key: "MEMBER_ALLOWED_TABS", value: JSON.stringify(finalPaths) }
  });

  return finalPaths;
}
