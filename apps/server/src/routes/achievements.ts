import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { userAchievements, customEmotes, denMembers } from "../db/schema.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

const ACHIEVEMENTS = [
  { id: "first_roar", name: "First Roar", description: "Send your first message" },
  { id: "pride_leader", name: "Pride Leader", description: "Create a den" },
  { id: "social_lion", name: "Social Lion", description: "Make a friend" },
  { id: "pride_member", name: "Pride Member", description: "Join your first den" },
  { id: "chatterbox", name: "Chatterbox", description: "Send 100 messages" },
  { id: "pride_explorer", name: "Pride Explorer", description: "Join 5 dens" },
  { id: "roaring_legend", name: "Roaring Legend", description: "Send 500 messages" },
] as const;

export { ACHIEVEMENTS };
export type AchievementId = (typeof ACHIEVEMENTS)[number]["id"];

export async function achievementRoutes(app: FastifyInstance) {
  app.get("/api/v1/achievements", async () => ({ achievements: ACHIEVEMENTS }));

  app.get("/api/v1/users/me/achievements", { preHandler: requireAuth }, async (req) => {
    const { userId } = req as AuthedRequest;
    const rows = await db
      .select()
      .from(userAchievements)
      .where(eq(userAchievements.userId, userId));
    return {
      unlocked: rows.map((r) => ({
        id: r.achievementId,
        unlockedAt: r.unlockedAt.toISOString(),
      })),
    };
  });

  app.get("/api/v1/dens/:denId/emotes", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId } = req.params as { denId: string };
    const member = await db
      .select()
      .from(denMembers)
      .where(and(eq(denMembers.denId, denId), eq(denMembers.userId, userId)))
      .limit(1);
    if (member.length === 0) return reply.status(403).send({ error: "Not a member" });
    const rows = await db.select().from(customEmotes).where(eq(customEmotes.denId, denId));
    return { emotes: rows.map((e) => ({ id: e.id, name: e.name, url: e.url })) };
  });
}

export async function unlockAchievement(userId: string, achievementId: string): Promise<boolean> {
  if (!ACHIEVEMENTS.some((a) => a.id === achievementId)) return false;
  try {
    await db.insert(userAchievements).values({ userId, achievementId });
    return true;
  } catch {
    return false;
  }
}
