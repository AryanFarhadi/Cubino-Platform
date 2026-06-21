import { eq, and, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { friendships, dmParticipants } from "../db/schema.js";

/** True if either user has blocked the other. */
export async function isBlockedEitherWay(userA: string, userB: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: friendships.userId })
    .from(friendships)
    .where(
      and(
        eq(friendships.status, "blocked"),
        or(
          and(eq(friendships.userId, userA), eq(friendships.friendId, userB)),
          and(eq(friendships.userId, userB), eq(friendships.friendId, userA))
        )
      )
    )
    .limit(1);
  return !!row;
}

/** Remove all friendship rows between two users (both directions). */
export async function clearFriendshipBetween(userA: string, userB: string): Promise<void> {
  await db
    .delete(friendships)
    .where(
      or(
        and(eq(friendships.userId, userA), eq(friendships.friendId, userB)),
        and(eq(friendships.userId, userB), eq(friendships.friendId, userA))
      )
    );
}

/** True when a 1:1 DM has a block between the two participants. */
export async function isDirectDmBlocked(userId: string, dmChannelId: string): Promise<boolean> {
  const parts = await db
    .select({ userId: dmParticipants.userId })
    .from(dmParticipants)
    .where(eq(dmParticipants.dmChannelId, dmChannelId));

  if (parts.length !== 2) return false;

  const otherId = parts.find((p) => p.userId !== userId)?.userId;
  if (!otherId) return false;

  return isBlockedEitherWay(userId, otherId);
}
