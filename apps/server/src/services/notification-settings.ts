import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { memberNotificationSettings } from "../db/schema.js";

export type NotificationLevel = "all" | "mentions" | "none";

const LEVELS = new Set<NotificationLevel>(["all", "mentions", "none"]);

export function parseNotificationLevel(value: string | null | undefined): NotificationLevel {
  if (value && LEVELS.has(value as NotificationLevel)) {
    return value as NotificationLevel;
  }
  return "all";
}

export async function getMemberNotificationLevel(
  userId: string,
  denId: string
): Promise<NotificationLevel> {
  const [row] = await db
    .select({ level: memberNotificationSettings.level })
    .from(memberNotificationSettings)
    .where(
      and(
        eq(memberNotificationSettings.denId, denId),
        eq(memberNotificationSettings.userId, userId)
      )
    )
    .limit(1);
  return parseNotificationLevel(row?.level);
}

export async function getDenNotificationLevels(
  denId: string
): Promise<Map<string, NotificationLevel>> {
  const rows = await db
    .select({
      userId: memberNotificationSettings.userId,
      level: memberNotificationSettings.level,
    })
    .from(memberNotificationSettings)
    .where(eq(memberNotificationSettings.denId, denId));

  const map = new Map<string, NotificationLevel>();
  for (const row of rows) {
    map.set(row.userId, parseNotificationLevel(row.level));
  }
  return map;
}
