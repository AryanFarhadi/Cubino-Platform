import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { memberDmMutes, dmParticipants } from "../db/schema.js";

export async function isDmMuted(userId: string, dmChannelId: string): Promise<boolean> {
  const [row] = await db
    .select({ dmChannelId: memberDmMutes.dmChannelId })
    .from(memberDmMutes)
    .where(
      and(eq(memberDmMutes.dmChannelId, dmChannelId), eq(memberDmMutes.userId, userId))
    )
    .limit(1);
  return !!row;
}

export async function getMutedDmIdsForUser(userId: string): Promise<string[]> {
  const rows = await db
    .select({ dmChannelId: memberDmMutes.dmChannelId })
    .from(memberDmMutes)
    .where(eq(memberDmMutes.userId, userId));
  return rows.map((r) => r.dmChannelId);
}

export async function setDmMuted(
  userId: string,
  dmChannelId: string,
  muted: boolean
): Promise<void> {
  if (muted) {
    await db
      .insert(memberDmMutes)
      .values({ dmChannelId, userId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(memberDmMutes)
      .where(
        and(eq(memberDmMutes.dmChannelId, dmChannelId), eq(memberDmMutes.userId, userId))
      );
  }
}

export async function isDmParticipant(userId: string, dmChannelId: string): Promise<boolean> {
  const [row] = await db
    .select({ dmChannelId: dmParticipants.dmChannelId })
    .from(dmParticipants)
    .where(
      and(eq(dmParticipants.dmChannelId, dmChannelId), eq(dmParticipants.userId, userId))
    )
    .limit(1);
  return !!row;
}
