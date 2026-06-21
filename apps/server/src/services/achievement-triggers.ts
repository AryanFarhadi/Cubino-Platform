import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { messages, dmMessages, denMembers } from "../db/schema.js";
import { ACHIEVEMENTS, unlockAchievement } from "../routes/achievements.js";
import { getChatNs } from "../ws/io.js";

async function grantAchievement(userId: string, achievementId: string): Promise<void> {
  const newlyUnlocked = await unlockAchievement(userId, achievementId);
  if (!newlyUnlocked) return;

  const def = ACHIEVEMENTS.find((a) => a.id === achievementId);
  if (!def) return;

  getChatNs()?.to(`user:${userId}`).emit("achievement:unlock", {
    id: def.id,
    name: def.name,
    description: def.description,
  });
}

async function countUserMessages(userId: string): Promise<number> {
  const [channelCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(eq(messages.authorId, userId));
  const [dmCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(dmMessages)
    .where(and(eq(dmMessages.authorId, userId), isNull(dmMessages.deletedAt)));
  return (channelCount?.count ?? 0) + (dmCount?.count ?? 0);
}

/** Unlock message-count achievements at 1, 100, and 500 messages. */
export async function maybeUnlockMessageMilestones(userId: string): Promise<void> {
  const total = await countUserMessages(userId);
  if (total === 1) await grantAchievement(userId, "first_roar");
  if (total === 100) await grantAchievement(userId, "chatterbox");
  if (total === 500) await grantAchievement(userId, "roaring_legend");
}

/** @deprecated Use maybeUnlockMessageMilestones */
export async function maybeUnlockFirstRoar(userId: string): Promise<void> {
  await maybeUnlockMessageMilestones(userId);
}

/** @deprecated Use maybeUnlockMessageMilestones */
export async function maybeUnlockChatterbox(userId: string): Promise<void> {
  await maybeUnlockMessageMilestones(userId);
}

/** Unlock "Social Lion" for both users when a friendship is accepted. */
export async function unlockSocialLion(userId: string, friendId: string): Promise<void> {
  await grantAchievement(userId, "social_lion");
  await grantAchievement(friendId, "social_lion");
}

/** Unlock "Pride Leader" when a user creates a den. */
export async function grantDenCreatedAchievement(userId: string): Promise<void> {
  await grantAchievement(userId, "pride_leader");
}

/** Unlock den-join achievements at 1 and 5 dens joined. */
export async function maybeUnlockDenJoinMilestones(userId: string): Promise<void> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(denMembers)
    .where(eq(denMembers.userId, userId));
  const total = row?.count ?? 0;
  if (total === 1) await grantAchievement(userId, "pride_member");
  if (total === 5) await grantAchievement(userId, "pride_explorer");
}

/** @deprecated Use maybeUnlockDenJoinMilestones */
export async function maybeUnlockPrideMember(userId: string): Promise<void> {
  await maybeUnlockDenJoinMilestones(userId);
}
