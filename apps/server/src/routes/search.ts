import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc, inArray, ilike, sql, notInArray, or } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  messages,
  channels,
  pinnedMessages,
  channelReadState,
  users,
  dens,
  dmMessages,
  dmParticipants,
  denMembers,
} from "../db/schema.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { can, isChannelMember, Permission } from "../services/permissions.js";
import { toUserPublic } from "../lib/auth.js";
import { isChannelMuted, setChannelMuted } from "../services/channel-mute.js";

export async function searchRoutes(app: FastifyInstance) {
  app.get("/api/v1/search/messages", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const q = z
      .object({
        q: z.string().min(1).max(200),
        channelId: z.string().uuid().optional(),
        denId: z.string().uuid().optional(),
      })
      .parse(req.query);

    let channelIds: string[] = [];
    if (q.channelId) {
      if (!(await isChannelMember(userId, q.channelId))) {
        return reply.status(403).send({ error: "Forbidden" });
      }
      channelIds = [q.channelId];
    } else if (q.denId) {
      const member = await db
        .select({ denId: denMembers.denId })
        .from(denMembers)
        .where(and(eq(denMembers.denId, q.denId), eq(denMembers.userId, userId)))
        .limit(1);
      if (member.length === 0) {
        return reply.status(403).send({ error: "Forbidden" });
      }
      const chs = await db.select().from(channels).where(eq(channels.denId, q.denId));
      channelIds = chs.map((c) => c.id);
    } else {
      return reply.status(400).send({ error: "channelId or denId required" });
    }

    const rows = await db
      .select({ msg: messages, author: users })
      .from(messages)
      .innerJoin(users, eq(messages.authorId, users.id))
      .where(
        and(
          inArray(messages.channelId, channelIds),
          sql`to_tsvector('english', ${messages.content}) @@ plainto_tsquery('english', ${q.q})`,
          sql`${messages.deletedAt} IS NULL`
        )
      )
      .orderBy(desc(messages.createdAt))
      .limit(25);

    return {
      results: rows.map((r) => ({
        id: r.msg.id,
        channelId: r.msg.channelId,
        content: r.msg.content,
        createdAt: r.msg.createdAt.toISOString(),
        author: toUserPublic(r.author),
      })),
    };
  });

  app.get("/api/v1/search/dm-messages", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const q = z
      .object({
        q: z.string().min(1).max(200),
        dmId: z.string().uuid().optional(),
      })
      .parse(req.query);

    let dmIds: string[] = [];
    if (q.dmId) {
      const participant = await db
        .select()
        .from(dmParticipants)
        .where(and(eq(dmParticipants.dmChannelId, q.dmId), eq(dmParticipants.userId, userId)))
        .limit(1);
      if (participant.length === 0) return reply.status(403).send({ error: "Forbidden" });
      dmIds = [q.dmId];
    } else {
      const myDms = await db
        .select({ dmChannelId: dmParticipants.dmChannelId })
        .from(dmParticipants)
        .where(eq(dmParticipants.userId, userId));
      dmIds = myDms.map((r) => r.dmChannelId);
      if (dmIds.length === 0) return { results: [] };
    }

    const rows = await db
      .select({ msg: dmMessages, author: users })
      .from(dmMessages)
      .innerJoin(users, eq(dmMessages.authorId, users.id))
      .where(
        and(
          inArray(dmMessages.dmChannelId, dmIds),
          sql`to_tsvector('english', ${dmMessages.content}) @@ plainto_tsquery('english', ${q.q})`,
          sql`${dmMessages.deletedAt} IS NULL`
        )
      )
      .orderBy(desc(dmMessages.createdAt))
      .limit(25);

    return {
      results: rows.map((r) => ({
        id: r.msg.id,
        dmChannelId: r.msg.dmChannelId,
        content: r.msg.content,
        createdAt: r.msg.createdAt.toISOString(),
        author: toUserPublic(r.author),
      })),
    };
  });

  app.post("/api/v1/channels/:channelId/pins", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { channelId } = req.params as { channelId: string };
    const body = z.object({ messageId: z.string().uuid() }).parse(req.body);
    const [ch] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
    if (!ch || !(await can(userId, ch.denId, Permission.MANAGE_MESSAGES))) {
      return reply.status(403).send({ error: "Forbidden" });
    }
    const [msg] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.id, body.messageId), eq(messages.channelId, channelId)))
      .limit(1);
    if (!msg || msg.deletedAt) {
      return reply.status(404).send({ error: "Message not found in channel" });
    }
    const [pin] = await db
      .insert(pinnedMessages)
      .values({ channelId, messageId: body.messageId, pinnedBy: userId })
      .returning();
    return { pin: { id: pin.id, messageId: pin.messageId, pinnedAt: pin.pinnedAt.toISOString() } };
  });

  app.get("/api/v1/channels/:channelId/pins", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { channelId } = req.params as { channelId: string };
    if (!(await isChannelMember(userId, channelId))) {
      return reply.status(403).send({ error: "Forbidden" });
    }
    const rows = await db
      .select({ pin: pinnedMessages, msg: messages, author: users })
      .from(pinnedMessages)
      .innerJoin(messages, eq(pinnedMessages.messageId, messages.id))
      .innerJoin(users, eq(messages.authorId, users.id))
      .where(eq(pinnedMessages.channelId, channelId))
      .orderBy(desc(pinnedMessages.pinnedAt));
    return {
      pins: rows.map((r) => ({
        id: r.pin.id,
        messageId: r.msg.id,
        content: r.msg.content,
        pinnedAt: r.pin.pinnedAt.toISOString(),
        authorId: r.msg.authorId,
        author: toUserPublic(r.author),
      })),
    };
  });

  app.delete(
    "/api/v1/channels/:channelId/pins/:messageId",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { userId } = req as AuthedRequest;
      const { channelId, messageId } = req.params as { channelId: string; messageId: string };
      const [ch] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
      if (!ch || !(await can(userId, ch.denId, Permission.MANAGE_MESSAGES))) {
        return reply.status(403).send({ error: "Forbidden" });
      }
      await db
        .delete(pinnedMessages)
        .where(
          and(eq(pinnedMessages.channelId, channelId), eq(pinnedMessages.messageId, messageId))
        );
      return { ok: true };
    }
  );

  app.post("/api/v1/channels/:channelId/read", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { channelId } = req.params as { channelId: string };
    if (!(await isChannelMember(userId, channelId))) {
      return reply.status(403).send({ error: "Forbidden" });
    }
    await db
      .insert(channelReadState)
      .values({ channelId, userId, lastReadAt: new Date() })
      .onConflictDoUpdate({
        target: [channelReadState.channelId, channelReadState.userId],
        set: { lastReadAt: new Date() },
      });
    return { ok: true };
  });

  app.get("/api/v1/dens/discover/search", { preHandler: requireAuth }, async (req) => {
    const { userId } = req as AuthedRequest;
    const q = z.object({ q: z.string().optional() }).parse(req.query);

    const joined = await db
      .select({ denId: denMembers.denId })
      .from(denMembers)
      .where(eq(denMembers.userId, userId));
    const joinedIds = joined.map((row) => row.denId);

    const publicFilter =
      joinedIds.length > 0
        ? and(eq(dens.isPublic, 1), notInArray(dens.id, joinedIds))
        : eq(dens.isPublic, 1);

    const rows = q.q
      ? await db
          .select({
            id: dens.id,
            name: dens.name,
            iconUrl: dens.iconUrl,
            description: dens.description,
            createdAt: dens.createdAt,
            memberCount: sql<number>`(
              SELECT count(*)::int FROM den_members
              WHERE den_id = ${dens.id}
            )`.as("member_count"),
          })
          .from(dens)
          .where(
            and(
              publicFilter,
              or(ilike(dens.name, `%${q.q}%`), ilike(dens.description, `%${q.q}%`))
            )
          )
          .orderBy(desc(dens.createdAt))
          .limit(50)
      : await db
          .select({
            id: dens.id,
            name: dens.name,
            iconUrl: dens.iconUrl,
            description: dens.description,
            createdAt: dens.createdAt,
            memberCount: sql<number>`(
              SELECT count(*)::int FROM den_members
              WHERE den_id = ${dens.id}
            )`.as("member_count"),
          })
          .from(dens)
          .where(publicFilter)
          .orderBy(desc(dens.createdAt))
          .limit(50);
    return {
      dens: rows.map((d) => ({
        id: d.id,
        name: d.name,
        iconUrl: d.iconUrl,
        description: d.description,
        memberCount: d.memberCount,
      })),
    };
  });

  app.get("/api/v1/channels/:channelId/mute", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { channelId } = req.params as { channelId: string };
    if (!(await isChannelMember(userId, channelId))) {
      return reply.status(403).send({ error: "Forbidden" });
    }
    const muted = await isChannelMuted(userId, channelId);
    return { muted };
  });

  app.put("/api/v1/channels/:channelId/mute", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { channelId } = req.params as { channelId: string };
    if (!(await isChannelMember(userId, channelId))) {
      return reply.status(403).send({ error: "Forbidden" });
    }
    const body = z.object({ muted: z.boolean() }).parse(req.body);
    await setChannelMuted(userId, channelId, body.muted);
    return { muted: body.muted };
  });
}
