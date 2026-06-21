import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, lt, desc, isNull, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { messages, messageReactions, users, channels } from "../db/schema.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { isChannelMember, can, Permission } from "../services/permissions.js";
import { checkSlowMode } from "../services/slow-mode.js";
import { toUserPublic } from "../lib/auth.js";
import { broadcastChannelMessage, broadcastMessageUpdate, broadcastMessageDelete } from "../services/chat-broadcast.js";
import { fetchChannelAttachments } from "../services/attachments.js";
import { maybeUnlockMessageMilestones } from "../services/achievement-triggers.js";

export async function messageRoutes(app: FastifyInstance) {
  app.get("/api/v1/channels/:channelId/messages", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { channelId } = req.params as { channelId: string };
    const query = z
      .object({
        before: z.string().uuid().optional(),
        limit: z.coerce.number().min(1).max(100).default(50),
      })
      .parse(req.query);

    if (!(await isChannelMember(userId, channelId))) {
      return reply.status(403).send({ error: "Not a member" });
    }

    const conditions = [
      eq(messages.channelId, channelId),
      isNull(messages.deletedAt),
    ];
    if (query.before) {
      const [ref] = await db
        .select({ createdAt: messages.createdAt })
        .from(messages)
        .where(eq(messages.id, query.before))
        .limit(1);
      if (ref) conditions.push(lt(messages.createdAt, ref.createdAt));
    }

    const rows = await db
      .select({ message: messages, author: users })
      .from(messages)
      .innerJoin(users, eq(messages.authorId, users.id))
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(query.limit);

    const ids = rows.map((r) => r.message.id);
    const attachmentMap = await fetchChannelAttachments(ids);
    const allReactions =
      ids.length > 0
        ? await db
            .select()
            .from(messageReactions)
            .where(inArray(messageReactions.messageId, ids))
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
        channelId: r.message.channelId,
        authorId: r.message.authorId,
        content: r.message.content,
        editedAt: r.message.editedAt?.toISOString() ?? null,
        deletedAt: r.message.deletedAt?.toISOString() ?? null,
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

  app.post("/api/v1/channels/:channelId/messages", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { channelId } = req.params as { channelId: string };
    const body = z.object({ content: z.string().min(1).max(4000) }).parse(req.body);

    const [ch] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
    if (!ch) return reply.status(404).send({ error: "Channel not found" });
    if (!(await isChannelMember(userId, channelId))) {
      return reply.status(403).send({ error: "Not a member" });
    }
    if (!(await can(userId, ch.denId, Permission.SEND_MESSAGES))) {
      return reply.status(403).send({ error: "Missing permission" });
    }

    const slowCheck = await checkSlowMode(
      userId,
      channelId,
      ch.denId,
      ch.slowModeSeconds ?? 0
    );
    if (!slowCheck.allowed) {
      return reply.status(429).send({
        error: "Slow mode is active",
        code: "SLOW_MODE",
        retryAfterMs: slowCheck.retryAfterMs ?? 0,
      });
    }

    const [msg] = await db
      .insert(messages)
      .values({ channelId, authorId: userId, content: body.content })
      .returning();
    const [author] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    const dto = {
      id: msg.id,
      channelId: msg.channelId,
      authorId: msg.authorId,
      content: msg.content,
      editedAt: null,
      deletedAt: null,
      createdAt: msg.createdAt.toISOString(),
      author: toUserPublic(author),
      reactions: [] as { emoji: string; count: number; userIds: string[] }[],
    };

    await broadcastChannelMessage(dto, ch.denId, userId);
    void maybeUnlockMessageMilestones(userId);

    return { message: dto };
  });

  app.patch("/api/v1/messages/:messageId", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { messageId } = req.params as { messageId: string };
    const body = z.object({ content: z.string().min(1).max(4000) }).parse(req.body);

    const [msg] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    if (!msg) return reply.status(404).send({ error: "Not found" });
    if (!(await isChannelMember(userId, msg.channelId))) {
      return reply.status(403).send({ error: "Not a member" });
    }
    if (msg.authorId !== userId) return reply.status(403).send({ error: "Not your message" });

    const [updated] = await db
      .update(messages)
      .set({ content: body.content, editedAt: new Date() })
      .where(eq(messages.id, messageId))
      .returning();

    const editedAt = updated.editedAt!.toISOString();
    broadcastMessageUpdate({
      id: updated.id,
      channelId: updated.channelId,
      content: updated.content,
      editedAt,
    });

    return {
      message: {
        id: updated.id,
        channelId: updated.channelId,
        authorId: updated.authorId,
        content: updated.content,
        editedAt,
        deletedAt: null,
        createdAt: updated.createdAt.toISOString(),
      },
    };
  });

  app.delete("/api/v1/messages/:messageId", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { messageId } = req.params as { messageId: string };

    const [msg] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    if (!msg) return reply.status(404).send({ error: "Not found" });
    if (!(await isChannelMember(userId, msg.channelId))) {
      return reply.status(403).send({ error: "Not a member" });
    }

    const [ch] = await db.select().from(channels).where(eq(channels.id, msg.channelId)).limit(1);
    const allowed =
      msg.authorId === userId ||
      (ch && (await can(userId, ch.denId, Permission.MANAGE_MESSAGES)));
    if (!allowed) return reply.status(403).send({ error: "Forbidden" });

    await db
      .update(messages)
      .set({ deletedAt: new Date(), content: "" })
      .where(eq(messages.id, messageId));

    broadcastMessageDelete({ id: messageId, channelId: msg.channelId });

    return { ok: true };
  });
}
