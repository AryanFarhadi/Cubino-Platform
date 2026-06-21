import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc, or, isNull, gt } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  denMembers,
  bans,
  auditLog,
  reports,
  messages,
  channels,
  dens,
  users,
} from "../db/schema.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { can, isChannelMember, Permission } from "../services/permissions.js";
import { toUserPublic } from "../lib/auth.js";

async function logAudit(
  denId: string,
  userId: string,
  action: string,
  targetId?: string,
  metadata?: string
) {
  await db.insert(auditLog).values({ denId, userId, action, targetId, metadata });
}

export async function moderationRoutes(app: FastifyInstance) {
  app.post("/api/v1/dens/:denId/members/:memberId/kick", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId, memberId } = req.params as { denId: string; memberId: string };
    if (!(await can(userId, denId, Permission.KICK_MEMBERS))) {
      return reply.status(403).send({ error: "Missing permission" });
    }
    if (memberId === userId) {
      return reply.status(400).send({ error: "Cannot kick yourself" });
    }
    const [den] = await db.select({ ownerId: dens.ownerId }).from(dens).where(eq(dens.id, denId)).limit(1);
    if (den?.ownerId === memberId) {
      return reply.status(403).send({ error: "Cannot kick the Den owner" });
    }
    await db.delete(denMembers).where(and(eq(denMembers.denId, denId), eq(denMembers.userId, memberId)));
    await logAudit(denId, userId, "KICK", memberId);
    return { ok: true };
  });

  app.post("/api/v1/dens/:denId/members/:memberId/ban", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId, memberId } = req.params as { denId: string; memberId: string };
    if (!(await can(userId, denId, Permission.BAN_MEMBERS))) {
      return reply.status(403).send({ error: "Missing permission" });
    }
    if (memberId === userId) {
      return reply.status(400).send({ error: "Cannot ban yourself" });
    }
    const [den] = await db.select({ ownerId: dens.ownerId }).from(dens).where(eq(dens.id, denId)).limit(1);
    if (den?.ownerId === memberId) {
      return reply.status(403).send({ error: "Cannot ban the Den owner" });
    }
    const body = z
      .object({ reason: z.string().max(256).optional(), expiresInHours: z.number().optional() })
      .parse(req.body ?? {});
    const expiresAt = body.expiresInHours
      ? new Date(Date.now() + body.expiresInHours * 3600_000)
      : null;
    await db.insert(bans).values({
      denId,
      userId: memberId,
      reason: body.reason,
      bannedBy: userId,
      expiresAt,
    });
    await db.delete(denMembers).where(and(eq(denMembers.denId, denId), eq(denMembers.userId, memberId)));
    const auditMeta = JSON.stringify({
      reason: body.reason ?? null,
      duration: body.expiresInHours ? `${body.expiresInHours} hours` : "permanent",
    });
    await logAudit(denId, userId, "BAN", memberId, auditMeta);
    return { ok: true };
  });

  app.get("/api/v1/dens/:denId/bans", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId } = req.params as { denId: string };
    if (!(await can(userId, denId, Permission.BAN_MEMBERS))) {
      return reply.status(403).send({ error: "Missing permission" });
    }
    const now = new Date();
    const rows = await db
      .select({ ban: bans, user: users })
      .from(bans)
      .innerJoin(users, eq(bans.userId, users.id))
      .where(
        and(
          eq(bans.denId, denId),
          or(isNull(bans.expiresAt), gt(bans.expiresAt, now))
        )
      )
      .orderBy(desc(bans.createdAt));
    return {
      bans: rows.map((r) => ({
        id: r.ban.id,
        userId: r.ban.userId,
        reason: r.ban.reason,
        expiresAt: r.ban.expiresAt?.toISOString() ?? null,
        createdAt: r.ban.createdAt.toISOString(),
        user: toUserPublic(r.user),
      })),
    };
  });

  app.delete("/api/v1/dens/:denId/bans/:banId", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId, banId } = req.params as { denId: string; banId: string };
    if (!(await can(userId, denId, Permission.BAN_MEMBERS))) {
      return reply.status(403).send({ error: "Missing permission" });
    }
    const [ban] = await db
      .select()
      .from(bans)
      .where(and(eq(bans.id, banId), eq(bans.denId, denId)))
      .limit(1);
    if (!ban) return reply.status(404).send({ error: "Ban not found" });
    await db.delete(bans).where(eq(bans.id, banId));
    await logAudit(denId, userId, "UNBAN", ban.userId);
    return { ok: true };
  });

  app.get("/api/v1/dens/:denId/audit", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId } = req.params as { denId: string };
    if (!(await can(userId, denId, Permission.MANAGE_DEN))) {
      return reply.status(403).send({ error: "Missing permission" });
    }
    const rows = await db
      .select({ entry: auditLog, actor: users })
      .from(auditLog)
      .innerJoin(users, eq(auditLog.userId, users.id))
      .where(eq(auditLog.denId, denId))
      .orderBy(desc(auditLog.createdAt))
      .limit(100);
    return {
      entries: rows.map((r) => ({
        id: r.entry.id,
        userId: r.entry.userId,
        action: r.entry.action,
        targetId: r.entry.targetId,
        metadata: r.entry.metadata,
        createdAt: r.entry.createdAt.toISOString(),
        actor: toUserPublic(r.actor),
      })),
    };
  });

  app.post("/api/v1/messages/:messageId/report", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { messageId } = req.params as { messageId: string };
    const body = z.object({ reason: z.string().min(1).max(500) }).parse(req.body);
    const [msg] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    if (!msg) return reply.status(404).send({ error: "Not found" });
    if (!(await isChannelMember(userId, msg.channelId))) {
      return reply.status(403).send({ error: "Not a member" });
    }
    await db.insert(reports).values({ messageId, reporterId: userId, reason: body.reason });
    return { ok: true };
  });

  app.get("/api/v1/dens/:denId/reports", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId } = req.params as { denId: string };
    if (!(await can(userId, denId, Permission.MANAGE_MESSAGES))) {
      return reply.status(403).send({ error: "Missing permission" });
    }
    const chs = await db.select({ id: channels.id }).from(channels).where(eq(channels.denId, denId));
    const chIds = chs.map((c) => c.id);
    if (chIds.length === 0) return { reports: [] };
    const rows = await db
      .select({
        report: reports,
        message: messages,
        reporter: users,
      })
      .from(reports)
      .innerJoin(messages, eq(reports.messageId, messages.id))
      .innerJoin(users, eq(reports.reporterId, users.id))
      .where(eq(reports.status, "open"))
      .orderBy(desc(reports.createdAt))
      .limit(50);
    const filtered = rows.filter((r) => chIds.includes(r.message.channelId));
    return {
      reports: filtered.map((r) => ({
        id: r.report.id,
        messageId: r.report.messageId,
        channelId: r.message.channelId,
        messageContent: r.message.content.slice(0, 300),
        reason: r.report.reason,
        status: r.report.status,
        createdAt: r.report.createdAt.toISOString(),
        reporter: toUserPublic(r.reporter),
      })),
    };
  });

  app.get("/api/v1/dens/:denId/reports/count", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId } = req.params as { denId: string };
    if (!(await can(userId, denId, Permission.MANAGE_MESSAGES))) {
      return reply.status(403).send({ error: "Missing permission" });
    }
    const chs = await db.select({ id: channels.id }).from(channels).where(eq(channels.denId, denId));
    const chIds = new Set(chs.map((c) => c.id));
    if (chIds.size === 0) return { count: 0 };

    const rows = await db
      .select({ channelId: messages.channelId })
      .from(reports)
      .innerJoin(messages, eq(reports.messageId, messages.id))
      .where(eq(reports.status, "open"));
    const count = rows.filter((r) => chIds.has(r.channelId)).length;
    return { count };
  });

  app.patch("/api/v1/dens/:denId/reports/:reportId", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId, reportId } = req.params as { denId: string; reportId: string };
    if (!(await can(userId, denId, Permission.MANAGE_MESSAGES))) {
      return reply.status(403).send({ error: "Missing permission" });
    }
    const body = z.object({ status: z.enum(["resolved", "dismissed"]) }).parse(req.body);

    const [row] = await db
      .select({ report: reports, message: messages })
      .from(reports)
      .innerJoin(messages, eq(reports.messageId, messages.id))
      .where(eq(reports.id, reportId))
      .limit(1);
    if (!row) return reply.status(404).send({ error: "Report not found" });

    const [ch] = await db
      .select({ denId: channels.denId })
      .from(channels)
      .where(eq(channels.id, row.message.channelId))
      .limit(1);
    if (!ch || ch.denId !== denId) {
      return reply.status(404).send({ error: "Report not found" });
    }

    await db.update(reports).set({ status: body.status }).where(eq(reports.id, reportId));
    await logAudit(
      denId,
      userId,
      "REPORT_" + body.status.toUpperCase(),
      reportId,
      JSON.stringify({
        reason: row.report.reason,
        preview: row.message.content.slice(0, 120),
        channelId: row.message.channelId,
        messageId: row.message.id,
      })
    );
    return { ok: true };
  });
}
