import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc, isNull, lt, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  dmChannels,
  dmParticipants,
  dmMessages,
  dmMessageReactions,
  dmChannelsExtended,
  users,
} from "../db/schema.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { toUserPublic } from "../lib/auth.js";
import { fetchDmAttachments } from "../services/attachments.js";
import {
  broadcastDmMessageUpdate,
  broadcastDmMessageDelete,
} from "../services/chat-broadcast.js";
import {
  isDmMuted,
  setDmMuted,
  isDmParticipant,
  getMutedDmIdsForUser,
} from "../services/dm-mute.js";
import { isBlockedEitherWay, isDirectDmBlocked } from "../services/user-blocks.js";
import { getPinnedDmIdsForUser, setDmPinned, isDmPinned } from "../services/dm-pins.js";
import { getChatNs } from "../ws/io.js";
import { createNotification } from "./notifications.js";

export async function dmRoutes(app: FastifyInstance) {
  app.get("/api/v1/dms", { preHandler: requireAuth }, async (req) => {
    const { userId } = req as AuthedRequest;
    const myDms = await db
      .select({ dmChannelId: dmParticipants.dmChannelId })
      .from(dmParticipants)
      .where(eq(dmParticipants.userId, userId));

    const pinnedIds = new Set(await getPinnedDmIdsForUser(userId));

    const result = [];
    for (const { dmChannelId } of myDms) {
      const parts = await db
        .select({ user: users })
        .from(dmParticipants)
        .innerJoin(users, eq(dmParticipants.userId, users.id))
        .where(eq(dmParticipants.dmChannelId, dmChannelId));

      const [meta] = await db
        .select()
        .from(dmChannelsExtended)
        .where(eq(dmChannelsExtended.dmChannelId, dmChannelId))
        .limit(1);

      const [last] = await db
        .select()
        .from(dmMessages)
        .where(and(eq(dmMessages.dmChannelId, dmChannelId), isNull(dmMessages.deletedAt)))
        .orderBy(desc(dmMessages.createdAt))
        .limit(1);

      result.push({
        id: dmChannelId,
        participants: parts.map((p) => toUserPublic(p.user)),
        isGroup: meta?.isGroup === 1,
        name: meta?.name ?? null,
        creatorId: meta?.creatorId ?? null,
        pinned: pinnedIds.has(dmChannelId),
        lastMessage: last
          ? {
              id: last.id,
              channelId: dmChannelId,
              authorId: last.authorId,
              content: last.content,
              editedAt: last.editedAt?.toISOString() ?? null,
              deletedAt: null,
              createdAt: last.createdAt.toISOString(),
            }
          : null,
      });
    }
    return { dms: result };
  });

  app.post("/api/v1/dms", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const body = z.object({ username: z.string() }).parse(req.body);

    const [target] = await db
      .select()
      .from(users)
      .where(eq(users.username, body.username))
      .limit(1);
    if (!target) return reply.status(404).send({ error: "User not found" });
    if (target.id === userId) return reply.status(400).send({ error: "Cannot DM yourself" });

    if (await isBlockedEitherWay(userId, target.id)) {
      return reply.status(403).send({ error: "Cannot message this user" });
    }

    const myDms = await db
      .select({ dmChannelId: dmParticipants.dmChannelId })
      .from(dmParticipants)
      .where(eq(dmParticipants.userId, userId));

    for (const { dmChannelId } of myDms) {
      const parts = await db
        .select()
        .from(dmParticipants)
        .where(eq(dmParticipants.dmChannelId, dmChannelId));
      if (
        parts.length === 2 &&
        parts.some((p) => p.userId === target.id) &&
        parts.some((p) => p.userId === userId)
      ) {
        return {
          dm: {
            id: dmChannelId,
            participants: [toUserPublic(target)],
          },
        };
      }
    }

    const [dm] = await db.insert(dmChannels).values({}).returning();
    await db.insert(dmParticipants).values([
      { dmChannelId: dm.id, userId },
      { dmChannelId: dm.id, userId: target.id },
    ]);

    const [me] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return {
      dm: {
        id: dm.id,
        participants: [toUserPublic(me!), toUserPublic(target)],
      },
    };
  });

  app.get("/api/v1/dms/:dmId/messages", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { dmId } = req.params as { dmId: string };
    const query = z
      .object({
        before: z.string().uuid().optional(),
        limit: z.coerce.number().min(1).max(100).default(50),
      })
      .parse(req.query);

    const member = await db
      .select()
      .from(dmParticipants)
      .where(and(eq(dmParticipants.dmChannelId, dmId), eq(dmParticipants.userId, userId)))
      .limit(1);
    if (member.length === 0) return reply.status(403).send({ error: "Forbidden" });

    const conditions = [eq(dmMessages.dmChannelId, dmId), isNull(dmMessages.deletedAt)];
    if (query.before) {
      const [ref] = await db
        .select({ createdAt: dmMessages.createdAt })
        .from(dmMessages)
        .where(eq(dmMessages.id, query.before))
        .limit(1);
      if (ref) conditions.push(lt(dmMessages.createdAt, ref.createdAt));
    }

    const rows = await db
      .select({ message: dmMessages, author: users })
      .from(dmMessages)
      .innerJoin(users, eq(dmMessages.authorId, users.id))
      .where(and(...conditions))
      .orderBy(desc(dmMessages.createdAt))
      .limit(query.limit);

    const ids = rows.map((r) => r.message.id);
    const attachmentMap = await fetchDmAttachments(ids);
    const allReactions =
      ids.length > 0
        ? await db
            .select()
            .from(dmMessageReactions)
            .where(inArray(dmMessageReactions.messageId, ids))
        : [];

    const reactionMap = new Map<string, { emoji: string; userIds: string[] }[]>();
    for (const r of allReactions) {
      if (!ids.includes(r.messageId)) continue;
      const list = reactionMap.get(r.messageId) ?? [];
      let group = list.find((g) => g.emoji === r.emoji);
      if (!group) {
        group = { emoji: r.emoji, userIds: [] };
        list.push(group);
      }
      group.userIds.push(r.userId);
      reactionMap.set(r.messageId, list);
    }

    return {
      messages: rows.reverse().map((r) => ({
        id: r.message.id,
        dmChannelId: r.message.dmChannelId,
        authorId: r.message.authorId,
        content: r.message.content,
        editedAt: r.message.editedAt?.toISOString() ?? null,
        deletedAt: null,
        createdAt: r.message.createdAt.toISOString(),
        author: toUserPublic(r.author),
        reactions: (reactionMap.get(r.message.id) ?? []).map((g) => ({
          emoji: g.emoji,
          count: g.userIds.length,
          userIds: g.userIds,
          me: g.userIds.includes(userId),
        })),
        attachments: attachmentMap.get(r.message.id) ?? [],
      })),
    };
  });

  app.patch("/api/v1/dm-messages/:messageId", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { messageId } = req.params as { messageId: string };
    const body = z.object({ content: z.string().min(1).max(4000) }).parse(req.body);

    const [msg] = await db
      .select()
      .from(dmMessages)
      .where(eq(dmMessages.id, messageId))
      .limit(1);
    if (!msg) return reply.status(404).send({ error: "Not found" });
    if (msg.authorId !== userId) return reply.status(403).send({ error: "Not your message" });

    const member = await db
      .select()
      .from(dmParticipants)
      .where(
        and(eq(dmParticipants.dmChannelId, msg.dmChannelId), eq(dmParticipants.userId, userId))
      )
      .limit(1);
    if (member.length === 0) return reply.status(403).send({ error: "Forbidden" });
    if (await isDirectDmBlocked(userId, msg.dmChannelId)) {
      return reply.status(403).send({ error: "Cannot interact with this user" });
    }

    const [updated] = await db
      .update(dmMessages)
      .set({ content: body.content, editedAt: new Date() })
      .where(eq(dmMessages.id, messageId))
      .returning();

    const editedAt = updated.editedAt!.toISOString();
    broadcastDmMessageUpdate({
      id: updated.id,
      dmChannelId: updated.dmChannelId,
      content: updated.content,
      editedAt,
    });

    return {
      message: {
        id: updated.id,
        dmChannelId: updated.dmChannelId,
        authorId: updated.authorId,
        content: updated.content,
        editedAt,
        deletedAt: null,
        createdAt: updated.createdAt.toISOString(),
      },
    };
  });

  app.delete("/api/v1/dm-messages/:messageId", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { messageId } = req.params as { messageId: string };

    const [msg] = await db
      .select()
      .from(dmMessages)
      .where(eq(dmMessages.id, messageId))
      .limit(1);
    if (!msg) return reply.status(404).send({ error: "Not found" });
    if (msg.authorId !== userId) return reply.status(403).send({ error: "Not your message" });

    const member = await db
      .select()
      .from(dmParticipants)
      .where(
        and(eq(dmParticipants.dmChannelId, msg.dmChannelId), eq(dmParticipants.userId, userId))
      )
      .limit(1);
    if (member.length === 0) return reply.status(403).send({ error: "Forbidden" });
    if (await isDirectDmBlocked(userId, msg.dmChannelId)) {
      return reply.status(403).send({ error: "Cannot interact with this user" });
    }

    await db
      .update(dmMessages)
      .set({ deletedAt: new Date(), content: "" })
      .where(eq(dmMessages.id, messageId));

    broadcastDmMessageDelete({ id: messageId, dmChannelId: msg.dmChannelId });

    return { ok: true };
  });

  app.get("/api/v1/dms/muted", { preHandler: requireAuth }, async (req) => {
    const { userId } = req as AuthedRequest;
    const dmIds = await getMutedDmIdsForUser(userId);
    return { dmIds };
  });

  app.get("/api/v1/dms/:dmId/mute", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { dmId } = req.params as { dmId: string };
    if (!(await isDmParticipant(userId, dmId))) {
      return reply.status(403).send({ error: "Forbidden" });
    }
    const muted = await isDmMuted(userId, dmId);
    return { muted };
  });

  app.put("/api/v1/dms/:dmId/mute", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { dmId } = req.params as { dmId: string };
    if (!(await isDmParticipant(userId, dmId))) {
      return reply.status(403).send({ error: "Forbidden" });
    }
    const body = z.object({ muted: z.boolean() }).parse(req.body);
    await setDmMuted(userId, dmId, body.muted);
    return { muted: body.muted };
  });

  app.patch("/api/v1/dms/:dmId", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { dmId } = req.params as { dmId: string };
    const body = z
      .object({ name: z.string().min(1).max(100).nullable().optional() })
      .parse(req.body);

    if (!(await isDmParticipant(userId, dmId))) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const [meta] = await db
      .select()
      .from(dmChannelsExtended)
      .where(eq(dmChannelsExtended.dmChannelId, dmId))
      .limit(1);
    if (!meta || meta.isGroup !== 1) {
      return reply.status(400).send({ error: "Only group conversations can be renamed" });
    }
    if (meta.creatorId && meta.creatorId !== userId) {
      return reply.status(403).send({ error: "Only the group owner can rename this conversation" });
    }

    const name = body.name?.trim() || null;
    await db
      .update(dmChannelsExtended)
      .set({ name })
      .where(eq(dmChannelsExtended.dmChannelId, dmId));

    getChatNs()?.to(`dm:${dmId}`).emit("dm:updated", { dmId, name });
    return { ok: true, name };
  });

  app.post("/api/v1/dms/:dmId/leave", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { dmId } = req.params as { dmId: string };

    if (!(await isDmParticipant(userId, dmId))) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const [meta] = await db
      .select()
      .from(dmChannelsExtended)
      .where(eq(dmChannelsExtended.dmChannelId, dmId))
      .limit(1);
    if (!meta || meta.isGroup !== 1) {
      return reply.status(400).send({ error: "Can only leave group conversations" });
    }

    await db
      .delete(dmParticipants)
      .where(and(eq(dmParticipants.dmChannelId, dmId), eq(dmParticipants.userId, userId)));

    const remaining = await db
      .select({ userId: dmParticipants.userId })
      .from(dmParticipants)
      .where(eq(dmParticipants.dmChannelId, dmId));

    if (remaining.length === 0) {
      await db.delete(dmChannels).where(eq(dmChannels.id, dmId));
    } else {
      let nextCreatorId: string | null = null;
      if (meta.creatorId && meta.creatorId === userId) {
        nextCreatorId = remaining[0]!.userId;
        await db
          .update(dmChannelsExtended)
          .set({ creatorId: nextCreatorId })
          .where(eq(dmChannelsExtended.dmChannelId, dmId));
      }
      getChatNs()
        ?.to(`dm:${dmId}`)
        .emit("dm:participant:left", { dmId, userId });
      if (nextCreatorId) {
        getChatNs()?.to(`dm:${dmId}`).emit("dm:updated", { dmId, creatorId: nextCreatorId });
      }
    }

    getChatNs()?.to(`user:${userId}`).emit("dm:left", { dmId });
    return { ok: true };
  });

  app.put("/api/v1/dms/:dmId/pin", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { dmId } = req.params as { dmId: string };
    if (!(await isDmParticipant(userId, dmId))) {
      return reply.status(403).send({ error: "Forbidden" });
    }
    const body = z.object({ pinned: z.boolean() }).parse(req.body);
    const result = await setDmPinned(userId, dmId, body.pinned);
    if (!result.ok) return reply.status(400).send({ error: result.error });
    return { pinned: body.pinned };
  });

  app.get("/api/v1/dms/:dmId/pin", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { dmId } = req.params as { dmId: string };
    if (!(await isDmParticipant(userId, dmId))) {
      return reply.status(403).send({ error: "Forbidden" });
    }
    const pinned = await isDmPinned(userId, dmId);
    return { pinned };
  });

  app.post("/api/v1/dms/:dmId/members", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { dmId } = req.params as { dmId: string };
    const body = z
      .object({ userIds: z.array(z.string().uuid()).min(1).max(9) })
      .parse(req.body);

    if (!(await isDmParticipant(userId, dmId))) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const [meta] = await db
      .select()
      .from(dmChannelsExtended)
      .where(eq(dmChannelsExtended.dmChannelId, dmId))
      .limit(1);
    if (!meta || meta.isGroup !== 1) {
      return reply.status(400).send({ error: "Can only add members to group conversations" });
    }
    if (meta.creatorId && meta.creatorId !== userId) {
      return reply.status(403).send({ error: "Only the group owner can add members" });
    }

    const current = await db
      .select({ userId: dmParticipants.userId })
      .from(dmParticipants)
      .where(eq(dmParticipants.dmChannelId, dmId));
    const currentIds = new Set(current.map((p) => p.userId));

    const uniqueNew = [...new Set(body.userIds.filter((id) => !currentIds.has(id) && id !== userId))];
    if (uniqueNew.length === 0) {
      return reply.status(400).send({ error: "All selected users are already in the group" });
    }

    if (currentIds.size + uniqueNew.length > 10) {
      return reply.status(400).send({ error: "Max 10 members per group" });
    }

    const existingUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, uniqueNew));
    if (existingUsers.length !== uniqueNew.length) {
      return reply.status(404).send({ error: "One or more users not found" });
    }

    for (const id of uniqueNew) {
      if (await isBlockedEitherWay(userId, id)) {
        return reply.status(403).send({ error: "Cannot add a blocked user to a group" });
      }
    }

    await db
      .insert(dmParticipants)
      .values(uniqueNew.map((uid) => ({ dmChannelId: dmId, userId: uid })));

    const [adder] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const groupName = meta.name?.trim() || "a group chat";
    const metadata = JSON.stringify({ panel: "dms", dmId });

    for (const newUserId of uniqueNew) {
      getChatNs()?.to(`user:${newUserId}`).emit("dm:added", { dmId });
      if (adder) {
        await createNotification(
          newUserId,
          "dm_group_add",
          `${adder.displayName} added you to ${groupName}`,
          "Open conversation",
          metadata
        );
      }
    }

    getChatNs()
      ?.to(`dm:${dmId}`)
      .emit("dm:participants:added", { dmId, userIds: uniqueNew });

    return { ok: true, added: uniqueNew.length };
  });

  app.delete(
    "/api/v1/dms/:dmId/members/:memberId",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { userId } = req as AuthedRequest;
      const { dmId, memberId } = req.params as { dmId: string; memberId: string };

      if (memberId === userId) {
        return reply.status(400).send({ error: "Use leave to remove yourself from a group" });
      }

      if (!(await isDmParticipant(userId, dmId))) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      if (!(await isDmParticipant(memberId, dmId))) {
        return reply.status(404).send({ error: "Member not in this group" });
      }

      const [meta] = await db
        .select()
        .from(dmChannelsExtended)
        .where(eq(dmChannelsExtended.dmChannelId, dmId))
        .limit(1);
      if (!meta || meta.isGroup !== 1) {
        return reply.status(400).send({ error: "Can only remove members from group conversations" });
      }
      if (meta.creatorId && meta.creatorId !== userId) {
        return reply.status(403).send({ error: "Only the group owner can remove members" });
      }
      if (meta.creatorId && memberId === meta.creatorId) {
        return reply.status(400).send({ error: "The group owner cannot be removed" });
      }

      await db
        .delete(dmParticipants)
        .where(and(eq(dmParticipants.dmChannelId, dmId), eq(dmParticipants.userId, memberId)));

      const remaining = await db
        .select({ userId: dmParticipants.userId })
        .from(dmParticipants)
        .where(eq(dmParticipants.dmChannelId, dmId));

      if (remaining.length === 0) {
        await db.delete(dmChannels).where(eq(dmChannels.id, dmId));
      } else {
        getChatNs()
          ?.to(`dm:${dmId}`)
          .emit("dm:participant:removed", { dmId, userId: memberId });
      }

      getChatNs()?.to(`user:${memberId}`).emit("dm:left", { dmId });
      return { ok: true };
    }
  );
}
