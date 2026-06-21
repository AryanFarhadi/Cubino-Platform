import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, or, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { friendships, users, dmChannels, dmParticipants, dmChannelsExtended } from "../db/schema.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { toUserPublic } from "../lib/auth.js";
import { unlockSocialLion } from "../services/achievement-triggers.js";
import { createNotification } from "./notifications.js";
import { getChatNs } from "../ws/io.js";
import { isBlockedEitherWay, clearFriendshipBetween } from "../services/user-blocks.js";

/** Mark two users as friends (both directions) and notify the requester. */
async function completeFriendAcceptance(accepterId: string, requesterId: string): Promise<void> {
  await db
    .update(friendships)
    .set({ status: "accepted" })
    .where(and(eq(friendships.userId, requesterId), eq(friendships.friendId, accepterId)));

  const existing = await db
    .select()
    .from(friendships)
    .where(and(eq(friendships.userId, accepterId), eq(friendships.friendId, requesterId)))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(friendships).values({
      userId: accepterId,
      friendId: requesterId,
      status: "accepted",
    });
  } else {
    await db
      .update(friendships)
      .set({ status: "accepted" })
      .where(and(eq(friendships.userId, accepterId), eq(friendships.friendId, requesterId)));
  }

  void unlockSocialLion(accepterId, requesterId);

  const [accepter] = await db.select().from(users).where(eq(users.id, accepterId)).limit(1);
  if (accepter) {
    getChatNs()?.to(`user:${requesterId}`).emit("friend:accepted", {
      user: toUserPublic(accepter),
    });
  }
}

export async function friendRoutes(app: FastifyInstance) {
  app.get("/api/v1/friends", { preHandler: requireAuth }, async (req) => {
    const { userId } = req as AuthedRequest;

    const outgoing = await db
      .select({ f: friendships, user: users })
      .from(friendships)
      .innerJoin(users, eq(friendships.friendId, users.id))
      .where(eq(friendships.userId, userId));

    const incoming = await db
      .select({ f: friendships, user: users })
      .from(friendships)
      .innerJoin(users, eq(friendships.userId, users.id))
      .where(and(eq(friendships.friendId, userId), eq(friendships.status, "pending")));

    const seen = new Set<string>();
    const friends: {
      status: string;
      direction?: "incoming" | "outgoing";
      user: ReturnType<typeof toUserPublic>;
    }[] = [];

    for (const row of outgoing) {
      if (row.f.status === "blocked") continue;
      seen.add(row.user.id);
      friends.push({
        status: row.f.status,
        direction: row.f.status === "pending" ? "outgoing" : undefined,
        user: toUserPublic(row.user),
      });
    }

    for (const row of incoming) {
      if (seen.has(row.user.id)) continue;
      friends.push({
        status: row.f.status,
        direction: "incoming",
        user: toUserPublic(row.user),
      });
    }

    const blockedByMe = await db
      .select({ user: users })
      .from(friendships)
      .innerJoin(users, eq(friendships.friendId, users.id))
      .where(and(eq(friendships.userId, userId), eq(friendships.status, "blocked")));

    return {
      friends,
      blocked: blockedByMe.map((r) => ({ user: toUserPublic(r.user) })),
    };
  });

  app.post("/api/v1/friends/request", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const body = z.object({ username: z.string() }).parse(req.body);
    const [target] = await db.select().from(users).where(eq(users.username, body.username)).limit(1);
    if (!target) return reply.status(404).send({ error: "User not found" });
    if (target.id === userId) return reply.status(400).send({ error: "Cannot friend yourself" });

    if (await isBlockedEitherWay(userId, target.id)) {
      return reply.status(403).send({ error: "Cannot interact with this user" });
    }

    const [existing] = await db
      .select()
      .from(friendships)
      .where(
        or(
          and(eq(friendships.userId, userId), eq(friendships.friendId, target.id)),
          and(eq(friendships.userId, target.id), eq(friendships.friendId, userId))
        )
      )
      .limit(1);

    if (existing) {
      if (existing.status === "accepted") {
        return reply.status(400).send({ error: "Already friends" });
      }
      if (existing.status === "blocked") {
        return reply.status(403).send({ error: "Cannot interact with this user" });
      }
      if (existing.status === "pending") {
        // They already sent us a request — accept automatically.
        if (existing.userId === target.id && existing.friendId === userId) {
          await completeFriendAcceptance(userId, target.id);
          return { ok: true, accepted: true };
        }
        return reply.status(409).send({ error: "Friend request already pending" });
      }
    }

    const [sender] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!sender) return reply.status(401).send({ error: "Unauthorized" });

    await db
      .insert(friendships)
      .values({ userId, friendId: target.id, status: "pending" })
      .catch(() => {});

    const metadata = JSON.stringify({ panel: "friends", friendId: userId });
    await createNotification(
      target.id,
      "friend_request",
      `${sender.displayName} sent you a friend request`,
      `@${sender.username}`,
      metadata
    );

    getChatNs()?.to(`user:${target.id}`).emit("friend:request", {
      fromUser: toUserPublic(sender),
    });

    return { ok: true };
  });

  app.post("/api/v1/friends/:friendId/accept", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { friendId } = req.params as { friendId: string };

    const [incoming] = await db
      .select()
      .from(friendships)
      .where(
        and(
          eq(friendships.userId, friendId),
          eq(friendships.friendId, userId),
          eq(friendships.status, "pending")
        )
      )
      .limit(1);

    if (!incoming) {
      return reply.status(404).send({ error: "No pending friend request" });
    }

    if (await isBlockedEitherWay(userId, friendId)) {
      return reply.status(403).send({ error: "Cannot interact with this user" });
    }

    await completeFriendAcceptance(userId, friendId);
    return { ok: true };
  });

  app.delete("/api/v1/friends/:friendId", { preHandler: requireAuth }, async (req) => {
    const { userId } = req as AuthedRequest;
    const { friendId } = req.params as { friendId: string };
    await db
      .delete(friendships)
      .where(
        or(
          and(eq(friendships.userId, userId), eq(friendships.friendId, friendId)),
          and(eq(friendships.userId, friendId), eq(friendships.friendId, userId))
        )
      );
    return { ok: true };
  });

  app.post("/api/v1/friends/:friendId/block", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { friendId } = req.params as { friendId: string };
    if (friendId === userId) return reply.status(400).send({ error: "Cannot block yourself" });

    const [target] = await db.select().from(users).where(eq(users.id, friendId)).limit(1);
    if (!target) return reply.status(404).send({ error: "User not found" });

    await clearFriendshipBetween(userId, friendId);
    await db.insert(friendships).values({ userId, friendId, status: "blocked" });
    return { ok: true };
  });

  app.post("/api/v1/dms/group", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const body = z
      .object({
        name: z.string().max(100).optional(),
        userIds: z.array(z.string().uuid()).min(1).max(9),
      })
      .parse(req.body);
    const uniqueIds = [...new Set(body.userIds.filter((id) => id !== userId))];
    if (uniqueIds.length === 0) {
      return reply.status(400).send({ error: "At least one other user is required" });
    }

    const existingUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, uniqueIds));
    if (existingUsers.length !== uniqueIds.length) {
      return reply.status(404).send({ error: "One or more users not found" });
    }

    for (const id of uniqueIds) {
      if (await isBlockedEitherWay(userId, id)) {
        return reply.status(403).send({ error: "Cannot add a blocked user to a group" });
      }
    }

    const allIds = [userId, ...uniqueIds];
    if (allIds.length > 10) return reply.status(400).send({ error: "Max 10 members" });
    const [dm] = await db.insert(dmChannels).values({}).returning();
    await db.insert(dmParticipants).values(allIds.map((uid) => ({ dmChannelId: dm.id, userId: uid })));
    await db.insert(dmChannelsExtended).values({
      dmChannelId: dm.id,
      name: body.name ?? null,
      isGroup: 1,
      creatorId: userId,
    });
    return { dmChannelId: dm.id };
  });
}
