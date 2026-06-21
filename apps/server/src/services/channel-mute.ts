import { eq, and, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { memberChannelMutes, channels } from "../db/schema.js";

export async function isChannelMuted(userId: string, channelId: string): Promise<boolean> {
  const [row] = await db
    .select({ channelId: memberChannelMutes.channelId })
    .from(memberChannelMutes)
    .where(
      and(eq(memberChannelMutes.channelId, channelId), eq(memberChannelMutes.userId, userId))
    )
    .limit(1);
  return !!row;
}

export async function getMutedUserIdsForChannel(channelId: string): Promise<Set<string>> {
  const rows = await db
    .select({ userId: memberChannelMutes.userId })
    .from(memberChannelMutes)
    .where(eq(memberChannelMutes.channelId, channelId));
  return new Set(rows.map((r) => r.userId));
}

export async function getMutedChannelIdsForUser(
  userId: string,
  denId: string
): Promise<string[]> {
  const rows = await db
    .select({ channelId: memberChannelMutes.channelId })
    .from(memberChannelMutes)
    .innerJoin(channels, eq(memberChannelMutes.channelId, channels.id))
    .where(and(eq(memberChannelMutes.userId, userId), eq(channels.denId, denId)));
  return rows.map((r) => r.channelId);
}

export async function setChannelMuted(
  userId: string,
  channelId: string,
  muted: boolean
): Promise<void> {
  if (muted) {
    await db
      .insert(memberChannelMutes)
      .values({ channelId, userId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(memberChannelMutes)
      .where(
        and(eq(memberChannelMutes.channelId, channelId), eq(memberChannelMutes.userId, userId))
      );
  }
}
