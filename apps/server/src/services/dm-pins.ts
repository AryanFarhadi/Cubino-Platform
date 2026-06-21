import { eq, and, count } from "drizzle-orm";
import { db } from "../db/index.js";
import { memberDmPins } from "../db/schema.js";

export const MAX_DM_PINS = 5;

export async function countDmPinsForUser(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(memberDmPins)
    .where(eq(memberDmPins.userId, userId));
  return row?.total ?? 0;
}

export async function isDmPinned(userId: string, dmChannelId: string): Promise<boolean> {
  const [row] = await db
    .select({ dmChannelId: memberDmPins.dmChannelId })
    .from(memberDmPins)
    .where(and(eq(memberDmPins.dmChannelId, dmChannelId), eq(memberDmPins.userId, userId)))
    .limit(1);
  return !!row;
}

export async function getPinnedDmIdsForUser(userId: string): Promise<string[]> {
  const rows = await db
    .select({ dmChannelId: memberDmPins.dmChannelId })
    .from(memberDmPins)
    .where(eq(memberDmPins.userId, userId));
  return rows.map((r) => r.dmChannelId);
}

export async function setDmPinned(
  userId: string,
  dmChannelId: string,
  pinned: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (pinned) {
    const already = await isDmPinned(userId, dmChannelId);
    if (!already) {
      const total = await countDmPinsForUser(userId);
      if (total >= MAX_DM_PINS) {
        return { ok: false, error: `Max ${MAX_DM_PINS} pinned conversations` };
      }
    }
    await db
      .insert(memberDmPins)
      .values({ dmChannelId, userId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(memberDmPins)
      .where(and(eq(memberDmPins.dmChannelId, dmChannelId), eq(memberDmPins.userId, userId)));
  }
  return { ok: true };
}
