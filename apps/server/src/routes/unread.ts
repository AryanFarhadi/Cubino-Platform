import type { FastifyInstance } from "fastify";
import { eq, and, isNull, sql, ne, or, ilike } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  channels,
  messages,
  dmMessages,
  dmParticipants,
  channelReadState,
  dmReadState,
  denMembers,
  memberNotificationSettings,
  memberChannelMutes,
  memberDmMutes,
  memberRoles,
  roles,
  users,
} from "../db/schema.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export async function unreadRoutes(app: FastifyInstance) {
  app.get("/api/v1/unread/summary", { preHandler: requireAuth }, async (req) => {
    const { userId } = req as AuthedRequest;

    const [currentUser] = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const username = currentUser?.username ?? "";

    const channelRows = await db
      .select({
        channelId: messages.channelId,
        denId: channels.denId,
        count: sql<number>`count(*)::int`,
      })
      .from(messages)
      .innerJoin(channels, eq(messages.channelId, channels.id))
      .innerJoin(denMembers, eq(denMembers.denId, channels.denId))
      .leftJoin(
        channelReadState,
        and(
          eq(channelReadState.channelId, messages.channelId),
          eq(channelReadState.userId, userId)
        )
      )
      .leftJoin(
        memberNotificationSettings,
        and(
          eq(memberNotificationSettings.denId, channels.denId),
          eq(memberNotificationSettings.userId, userId)
        )
      )
      .leftJoin(
        memberChannelMutes,
        and(
          eq(memberChannelMutes.channelId, messages.channelId),
          eq(memberChannelMutes.userId, userId)
        )
      )
      .where(
        and(
          eq(denMembers.userId, userId),
          ne(messages.authorId, userId),
          isNull(messages.deletedAt),
          isNull(memberChannelMutes.userId),
          sql`(${channelReadState.lastReadAt} IS NULL OR ${messages.createdAt} > ${channelReadState.lastReadAt})`,
          or(
            isNull(memberNotificationSettings.level),
            eq(memberNotificationSettings.level, "all"),
            and(
              eq(memberNotificationSettings.level, "mentions"),
              or(
                username ? ilike(messages.content, `%@${username}%`) : sql`false`,
                sql`${messages.content} ~* '@(everyone|here)\\y'`,
                sql`exists (
                  select 1 from ${memberRoles} mr
                  inner join ${roles} r on r.id = mr.role_id
                  where mr.user_id = ${userId}
                    and mr.den_id = ${channels.denId}
                    and lower(${messages.content}) ~ (
                      '@' || lower(regexp_replace(regexp_replace(r.name, '\\s', '', 'g'), '[^a-zA-Z0-9_]', '', 'g')) || '\\y'
                    )
                )`
              )
            )
          )
        )
      )
      .groupBy(messages.channelId, channels.denId);

    const dmRows = await db
      .select({
        dmChannelId: dmMessages.dmChannelId,
        count: sql<number>`count(*)::int`,
      })
      .from(dmMessages)
      .innerJoin(dmParticipants, eq(dmParticipants.dmChannelId, dmMessages.dmChannelId))
      .leftJoin(
        dmReadState,
        and(eq(dmReadState.dmChannelId, dmMessages.dmChannelId), eq(dmReadState.userId, userId))
      )
      .leftJoin(
        memberDmMutes,
        and(
          eq(memberDmMutes.dmChannelId, dmMessages.dmChannelId),
          eq(memberDmMutes.userId, userId)
        )
      )
      .where(
        and(
          eq(dmParticipants.userId, userId),
          ne(dmMessages.authorId, userId),
          isNull(dmMessages.deletedAt),
          isNull(memberDmMutes.userId),
          sql`(${dmReadState.lastReadAt} IS NULL OR ${dmMessages.createdAt} > ${dmReadState.lastReadAt})`
        )
      )
      .groupBy(dmMessages.dmChannelId);

    const channelsMap: Record<string, number> = {};
    const channelDens: Record<string, string> = {};
    const densMap: Record<string, number> = {};
    for (const r of channelRows) {
      channelsMap[r.channelId] = r.count;
      channelDens[r.channelId] = r.denId;
      densMap[r.denId] = (densMap[r.denId] ?? 0) + r.count;
    }

    const dmsMap: Record<string, number> = {};
    for (const r of dmRows) dmsMap[r.dmChannelId] = r.count;

    return { channels: channelsMap, dms: dmsMap, dens: densMap, channelDens };
  });

  app.post("/api/v1/dms/:dmId/read", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { dmId } = req.params as { dmId: string };
    const member = await db
      .select()
      .from(dmParticipants)
      .where(and(eq(dmParticipants.dmChannelId, dmId), eq(dmParticipants.userId, userId)))
      .limit(1);
    if (member.length === 0) return reply.status(403).send({ error: "Forbidden" });

    await db
      .insert(dmReadState)
      .values({ dmChannelId: dmId, userId, lastReadAt: new Date() })
      .onConflictDoUpdate({
        target: [dmReadState.dmChannelId, dmReadState.userId],
        set: { lastReadAt: new Date() },
      });
    return { ok: true };
  });
}
