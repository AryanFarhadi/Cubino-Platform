import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, notInArray, desc, sql, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  dens,
  denMembers,
  categories,
  channels,
  invites,
  users,
  roles,
  memberRoles,
  memberNotificationSettings,
} from "../db/schema.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { bootstrapDen } from "../services/den-bootstrap.js";
import { can, canManageDen, getEffectivePermissions, Permission } from "../services/permissions.js";
import { toUserPublic } from "../lib/auth.js";
import { inviteCodeMatches } from "../lib/invite-code.js";
import { isUserBanned } from "../services/bans.js";
import { parseNotificationLevel } from "../services/notification-settings.js";
import { announceMemberJoin } from "../services/join-announce.js";
import { getMutedChannelIdsForUser } from "../services/channel-mute.js";
import { grantDenCreatedAchievement, maybeUnlockDenJoinMilestones } from "../services/achievement-triggers.js";

export async function denRoutes(app: FastifyInstance) {
  app.get("/api/v1/dens", { preHandler: requireAuth }, async (req) => {
    const { userId } = req as AuthedRequest;
    const rows = await db
      .select({ den: dens })
      .from(denMembers)
      .innerJoin(dens, eq(denMembers.denId, dens.id))
      .where(eq(denMembers.userId, userId));
    return {
      dens: rows.map((r) => ({
        id: r.den.id,
        name: r.den.name,
        iconUrl: r.den.iconUrl,
        ownerId: r.den.ownerId,
        description: r.den.description,
      })),
    };
  });

  app.post("/api/v1/dens", { preHandler: requireAuth }, async (req) => {
    const { userId } = req as AuthedRequest;
    const body = z.object({ name: z.string().min(2).max(100) }).parse(req.body);
    const { den, inviteCode } = await bootstrapDen(userId, body.name);
    void grantDenCreatedAchievement(userId);
    return {
      den: {
        id: den.id,
        name: den.name,
        iconUrl: den.iconUrl,
        ownerId: den.ownerId,
        description: den.description,
      },
      inviteCode,
    };
  });

  app.get("/api/v1/dens/:denId", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId } = req.params as { denId: string };
    const member = await db
      .select()
      .from(denMembers)
      .where(and(eq(denMembers.denId, denId), eq(denMembers.userId, userId)))
      .limit(1);
    if (member.length === 0) return reply.status(403).send({ error: "Not a member" });
    const [den] = await db.select().from(dens).where(eq(dens.id, denId)).limit(1);
    return {
      den: {
        id: den.id,
        name: den.name,
        iconUrl: den.iconUrl,
        bannerUrl: den.bannerUrl,
        ownerId: den.ownerId,
        description: den.description,
        welcomeMessage: den.welcomeMessage,
        isPublic: den.isPublic === 1,
      },
    };
  });

  app.get("/api/v1/dens/:denId/notification-settings", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId } = req.params as { denId: string };
    const member = await db
      .select()
      .from(denMembers)
      .where(and(eq(denMembers.denId, denId), eq(denMembers.userId, userId)))
      .limit(1);
    if (member.length === 0) return reply.status(403).send({ error: "Not a member" });

    const [row] = await db
      .select({ level: memberNotificationSettings.level })
      .from(memberNotificationSettings)
      .where(
        and(
          eq(memberNotificationSettings.denId, denId),
          eq(memberNotificationSettings.userId, userId)
        )
      )
      .limit(1);

    return { level: parseNotificationLevel(row?.level) };
  });

  app.patch("/api/v1/dens/:denId/notification-settings", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId } = req.params as { denId: string };
    const member = await db
      .select()
      .from(denMembers)
      .where(and(eq(denMembers.denId, denId), eq(denMembers.userId, userId)))
      .limit(1);
    if (member.length === 0) return reply.status(403).send({ error: "Not a member" });

    const body = z.object({ level: z.enum(["all", "mentions", "none"]) }).parse(req.body);

    await db
      .insert(memberNotificationSettings)
      .values({ denId, userId, level: body.level })
      .onConflictDoUpdate({
        target: [memberNotificationSettings.denId, memberNotificationSettings.userId],
        set: { level: body.level },
      });

    return { level: body.level };
  });

  app.get("/api/v1/notification-settings", { preHandler: requireAuth }, async (req) => {
    const { userId } = req as AuthedRequest;

    const memberRows = await db
      .select({ denId: denMembers.denId })
      .from(denMembers)
      .where(eq(denMembers.userId, userId));

    const settingRows = await db
      .select({ denId: memberNotificationSettings.denId, level: memberNotificationSettings.level })
      .from(memberNotificationSettings)
      .where(eq(memberNotificationSettings.userId, userId));

    const levelByDen = new Map(
      settingRows.map((r) => [r.denId, parseNotificationLevel(r.level)])
    );

    const levels: Record<string, "all" | "mentions" | "none"> = {};
    for (const { denId } of memberRows) {
      levels[denId] = levelByDen.get(denId) ?? "all";
    }

    return { levels };
  });

  app.get("/api/v1/dens/:denId/channels", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId } = req.params as { denId: string };
    const member = await db
      .select()
      .from(denMembers)
      .where(and(eq(denMembers.denId, denId), eq(denMembers.userId, userId)))
      .limit(1);
    if (member.length === 0) return reply.status(403).send({ error: "Not a member" });

    const cats = await db
      .select()
      .from(categories)
      .where(eq(categories.denId, denId))
      .orderBy(categories.position);
    const chs = await db
      .select()
      .from(channels)
      .where(eq(channels.denId, denId))
      .orderBy(channels.position);

    return {
      categories: cats.map((c) => ({
        id: c.id,
        denId: c.denId,
        name: c.name,
        position: c.position,
      })),
      channels: chs.map((c) => ({
        id: c.id,
        denId: c.denId,
        categoryId: c.categoryId,
        name: c.name,
        type: c.type,
        position: c.position,
        topic: c.topic,
        slowModeSeconds: c.slowModeSeconds ?? 0,
      })),
    };
  });

  app.patch("/api/v1/dens/:denId", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId } = req.params as { denId: string };
    if (!(await canManageDen(userId, denId))) {
      return reply.status(403).send({ error: "Missing permission" });
    }
    const assetUrl = z
      .union([
        z.string().url(),
        z.string().regex(/^\/uploads\/[\w\-./]+$/),
      ])
      .optional()
      .nullable();

    const body = z
      .object({
        name: z.string().min(2).max(100).optional(),
        description: z.string().max(500).optional().nullable(),
        welcomeMessage: z.string().max(500).optional().nullable(),
        iconUrl: assetUrl,
        bannerUrl: assetUrl,
        isPublic: z.boolean().optional(),
      })
      .parse(req.body);
    const [updated] = await db
      .update(dens)
      .set({
        name: body.name,
        description: body.description,
        welcomeMessage: body.welcomeMessage,
        iconUrl: body.iconUrl,
        bannerUrl: body.bannerUrl,
        isPublic: body.isPublic !== undefined ? (body.isPublic ? 1 : 0) : undefined,
      })
      .where(eq(dens.id, denId))
      .returning();
    return {
      den: {
        id: updated.id,
        name: updated.name,
        iconUrl: updated.iconUrl,
        bannerUrl: updated.bannerUrl,
        ownerId: updated.ownerId,
        description: updated.description,
        welcomeMessage: updated.welcomeMessage,
        isPublic: updated.isPublic === 1,
      },
    };
  });

  app.patch("/api/v1/channels/:channelId", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { channelId } = req.params as { channelId: string };
    const [ch] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
    if (!ch) return reply.status(404).send({ error: "Not found" });
    if (!(await can(userId, ch.denId, Permission.MANAGE_CHANNELS))) {
      return reply.status(403).send({ error: "Missing permission" });
    }
    const body = z
      .object({
        name: z.string().min(1).max(100).optional(),
        topic: z.string().max(256).optional().nullable(),
        categoryId: z.string().uuid().optional().nullable(),
        position: z.number().optional(),
        slowModeSeconds: z.number().min(0).max(21600).optional(),
      })
      .parse(req.body);
    const [updated] = await db
      .update(channels)
      .set(body)
      .where(eq(channels.id, channelId))
      .returning();
    return {
      channel: {
        id: updated.id,
        denId: updated.denId,
        categoryId: updated.categoryId,
        name: updated.name,
        type: updated.type,
        position: updated.position,
        topic: updated.topic,
        slowModeSeconds: updated.slowModeSeconds ?? 0,
      },
    };
  });

  app.delete("/api/v1/channels/:channelId", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { channelId } = req.params as { channelId: string };
    const [ch] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
    if (!ch) return reply.status(404).send({ error: "Not found" });
    if (!(await can(userId, ch.denId, Permission.MANAGE_CHANNELS))) {
      return reply.status(403).send({ error: "Missing permission" });
    }
    await db.delete(channels).where(eq(channels.id, channelId));
    return { ok: true };
  });

  app.post("/api/v1/dens/:denId/categories", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId } = req.params as { denId: string };
    if (!(await can(userId, denId, Permission.MANAGE_CHANNELS))) {
      return reply.status(403).send({ error: "Missing permission" });
    }
    const body = z.object({ name: z.string().min(1).max(100) }).parse(req.body);
    const [cat] = await db
      .insert(categories)
      .values({ denId, name: body.name })
      .returning();
    return { category: { id: cat.id, denId: cat.denId, name: cat.name, position: cat.position } };
  });

  app.patch("/api/v1/categories/:categoryId", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { categoryId } = req.params as { categoryId: string };
    const [cat] = await db.select().from(categories).where(eq(categories.id, categoryId)).limit(1);
    if (!cat) return reply.status(404).send({ error: "Not found" });
    if (!(await can(userId, cat.denId, Permission.MANAGE_CHANNELS))) {
      return reply.status(403).send({ error: "Missing permission" });
    }
    const body = z
      .object({ name: z.string().min(1).max(100).optional(), position: z.number().optional() })
      .parse(req.body);
    const [updated] = await db
      .update(categories)
      .set(body)
      .where(eq(categories.id, categoryId))
      .returning();
    return {
      category: {
        id: updated.id,
        denId: updated.denId,
        name: updated.name,
        position: updated.position,
      },
    };
  });

  app.delete("/api/v1/categories/:categoryId", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { categoryId } = req.params as { categoryId: string };
    const [cat] = await db.select().from(categories).where(eq(categories.id, categoryId)).limit(1);
    if (!cat) return reply.status(404).send({ error: "Not found" });
    if (!(await can(userId, cat.denId, Permission.MANAGE_CHANNELS))) {
      return reply.status(403).send({ error: "Missing permission" });
    }
    await db.delete(categories).where(eq(categories.id, categoryId));
    return { ok: true };
  });

  app.get("/api/v1/dens/:denId/members/me", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId } = req.params as { denId: string };
    const [member] = await db
      .select({ nickname: denMembers.nickname })
      .from(denMembers)
      .where(and(eq(denMembers.denId, denId), eq(denMembers.userId, userId)))
      .limit(1);
    if (!member) return reply.status(403).send({ error: "Not a member" });
    return { nickname: member.nickname ?? null };
  });

  app.patch("/api/v1/dens/:denId/members/me", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId } = req.params as { denId: string };
    const body = z.object({ nickname: z.string().max(64).optional().nullable() }).parse(req.body);
    const member = await db
      .select()
      .from(denMembers)
      .where(and(eq(denMembers.denId, denId), eq(denMembers.userId, userId)))
      .limit(1);
    if (member.length === 0) return reply.status(403).send({ error: "Not a member" });
    await db
      .update(denMembers)
      .set({ nickname: body.nickname })
      .where(and(eq(denMembers.denId, denId), eq(denMembers.userId, userId)));
    return { ok: true };
  });

  app.post("/api/v1/dens/:denId/channels", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId } = req.params as { denId: string };
    if (!(await can(userId, denId, Permission.MANAGE_CHANNELS))) {
      return reply.status(403).send({ error: "Missing permission" });
    }
    const body = z
      .object({
        name: z.string().min(1).max(100),
        type: z.enum(["TEXT", "VOICE"]),
        categoryId: z.string().uuid().optional(),
        topic: z.string().max(256).optional(),
      })
      .parse(req.body);

    const [ch] = await db
      .insert(channels)
      .values({
        denId,
        name: body.name,
        type: body.type,
        categoryId: body.categoryId,
        topic: body.topic,
      })
      .returning();

    return {
      channel: {
        id: ch.id,
        denId: ch.denId,
        categoryId: ch.categoryId,
        name: ch.name,
        type: ch.type,
        position: ch.position,
        topic: ch.topic,
      },
    };
  });

  app.post("/api/v1/dens/:denId/join", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId } = req.params as { denId: string };
    const body = z.object({ code: z.string().optional() }).parse(req.body ?? {});

    const [den] = await db.select().from(dens).where(eq(dens.id, denId)).limit(1);
    if (!den) return reply.status(404).send({ error: "Den not found" });

    const code = body.code?.trim() ?? "";
    let inviteRecord: (typeof invites.$inferSelect) | null = null;

    if (code) {
      const [invite] = await db
        .select()
        .from(invites)
        .where(and(eq(invites.denId, denId), inviteCodeMatches(code)))
        .limit(1);
      if (!invite) return reply.status(404).send({ error: "Invalid invite" });
      if (invite.expiresAt && invite.expiresAt < new Date()) {
        return reply.status(410).send({ error: "Invite expired" });
      }
      if (invite.maxUses && invite.uses >= invite.maxUses) {
        return reply.status(410).send({ error: "Invite max uses reached" });
      }
      inviteRecord = invite;
    } else if (den.isPublic !== 1) {
      return reply.status(400).send({ error: "Invite code required" });
    }

    if (await isUserBanned(userId, denId)) {
      return reply.status(403).send({ error: "You are banned from this Den" });
    }

    const existing = await db
      .select()
      .from(denMembers)
      .where(and(eq(denMembers.denId, denId), eq(denMembers.userId, userId)))
      .limit(1);
    const isNewMember = existing.length === 0;
    if (isNewMember) {
      await db.insert(denMembers).values({ denId, userId });
      const [everyone] = await db
        .select()
        .from(roles)
        .where(and(eq(roles.denId, denId), eq(roles.name, "@whole-den")))
        .limit(1);
      if (everyone) {
        await db.insert(memberRoles).values({
          denId,
          userId,
          roleId: everyone.id,
        });
      }
    }

    if (inviteRecord) {
      await db
        .update(invites)
        .set({ uses: inviteRecord.uses + 1 })
        .where(eq(invites.id, inviteRecord.id));
    }

    if (isNewMember) {
      announceMemberJoin(denId, userId).catch(() => {});
      void maybeUnlockDenJoinMilestones(userId);
    }

    return {
      den: {
        id: den.id,
        name: den.name,
        iconUrl: den.iconUrl,
        ownerId: den.ownerId,
        description: den.description,
      },
    };
  });

  app.get("/api/v1/dens/:denId/members", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId } = req.params as { denId: string };
    const member = await db
      .select()
      .from(denMembers)
      .where(and(eq(denMembers.denId, denId), eq(denMembers.userId, userId)))
      .limit(1);
    if (member.length === 0) return reply.status(403).send({ error: "Not a member" });

    const rows = await db
      .select({ user: users, nickname: denMembers.nickname })
      .from(denMembers)
      .innerJoin(users, eq(denMembers.userId, users.id))
      .where(eq(denMembers.denId, denId));

    const roleRows = await db
      .select({ userId: memberRoles.userId, role: roles })
      .from(memberRoles)
      .innerJoin(roles, eq(memberRoles.roleId, roles.id))
      .where(eq(memberRoles.denId, denId));

    const rolesByUser = new Map<string, { id: string; name: string; color: string }[]>();
    for (const r of roleRows) {
      if (!rolesByUser.has(r.userId)) rolesByUser.set(r.userId, []);
      rolesByUser.get(r.userId)!.push({ id: r.role.id, name: r.role.name, color: r.role.color });
    }

    const [den] = await db.select().from(dens).where(eq(dens.id, denId)).limit(1);

    return {
      members: rows.map((r) => ({
        ...toUserPublic(r.user),
        nickname: r.nickname,
        isOwner: r.user.id === den.ownerId,
        roles: rolesByUser.get(r.user.id) ?? [],
      })),
    };
  });

  app.get("/api/v1/dens/:denId/permissions/me", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId } = req.params as { denId: string };

    const member = await db
      .select()
      .from(denMembers)
      .where(and(eq(denMembers.denId, denId), eq(denMembers.userId, userId)))
      .limit(1);
    if (member.length === 0) return reply.status(403).send({ error: "Not a member" });

    const permissions = await getEffectivePermissions(userId, denId);
    return { permissions: permissions.toString() };
  });

  app.post("/api/v1/dens/join-by-code", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const body = z.object({ code: z.string().min(4).max(32) }).parse(req.body);

    const [invite] = await db
      .select()
      .from(invites)
      .where(inviteCodeMatches(body.code.trim()))
      .limit(1);
    if (!invite) return reply.status(404).send({ error: "Invalid invite code" });
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return reply.status(410).send({ error: "Invite expired" });
    }
    if (invite.maxUses && invite.uses >= invite.maxUses) {
      return reply.status(410).send({ error: "Invite max uses reached" });
    }

    const denId = invite.denId;

    if (await isUserBanned(userId, denId)) {
      return reply.status(403).send({ error: "You are banned from this Den" });
    }

    const existing = await db
      .select()
      .from(denMembers)
      .where(and(eq(denMembers.denId, denId), eq(denMembers.userId, userId)))
      .limit(1);
    const isNewMember = existing.length === 0;
    if (isNewMember) {
      await db.insert(denMembers).values({ denId, userId });
      const [everyone] = await db
        .select()
        .from(roles)
        .where(and(eq(roles.denId, denId), eq(roles.name, "@whole-den")))
        .limit(1);
      if (everyone) {
        await db.insert(memberRoles).values({ denId, userId, roleId: everyone.id });
      }
    }

    await db
      .update(invites)
      .set({ uses: invite.uses + 1 })
      .where(eq(invites.id, invite.id));

    if (isNewMember) {
      announceMemberJoin(denId, userId).catch(() => {});
      void maybeUnlockDenJoinMilestones(userId);
    }

    const [den] = await db.select().from(dens).where(eq(dens.id, denId)).limit(1);
    return {
      den: {
        id: den.id,
        name: den.name,
        iconUrl: den.iconUrl,
        ownerId: den.ownerId,
        description: den.description,
      },
    };
  });

  app.get("/api/v1/dens/:denId/invites", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId } = req.params as { denId: string };
    if (!(await canManageDen(userId, denId))) {
      return reply.status(403).send({ error: "Missing permission" });
    }
    const rows = await db.select().from(invites).where(eq(invites.denId, denId));
    return {
      invites: rows.map((i) => ({
        code: i.code,
        uses: i.uses,
        maxUses: i.maxUses,
        expiresAt: i.expiresAt?.toISOString() ?? null,
      })),
    };
  });

  app.post("/api/v1/dens/:denId/invites", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId } = req.params as { denId: string };
    if (!(await canManageDen(userId, denId))) {
      return reply.status(403).send({ error: "Missing permission" });
    }
    const body = z
      .object({
        maxUses: z.number().min(1).max(1000).optional(),
        expiresInHours: z.number().min(1).max(8760).optional(),
      })
      .optional()
      .parse(req.body ?? {});
    const { nanoid } = await import("nanoid");
    const code = nanoid(10);
    const expiresAt = body?.expiresInHours
      ? new Date(Date.now() + body.expiresInHours * 3600_000)
      : null;
    await db.insert(invites).values({
      denId,
      code,
      creatorId: userId,
      maxUses: body?.maxUses ?? null,
      expiresAt,
    });
    return { code, maxUses: body?.maxUses ?? null, expiresAt: expiresAt?.toISOString() ?? null };
  });

  app.delete("/api/v1/dens/:denId/invites/:code", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId, code } = req.params as { denId: string; code: string };
    if (!(await canManageDen(userId, denId))) {
      return reply.status(403).send({ error: "Missing permission" });
    }
    await db.delete(invites).where(and(eq(invites.denId, denId), eq(invites.code, code)));
    return { ok: true };
  });

  app.get("/api/v1/dens/:denId/muted-channels", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId } = req.params as { denId: string };
    const member = await db
      .select()
      .from(denMembers)
      .where(and(eq(denMembers.denId, denId), eq(denMembers.userId, userId)))
      .limit(1);
    if (member.length === 0) return reply.status(403).send({ error: "Not a member" });

    const channelIds = await getMutedChannelIdsForUser(userId, denId);
    if (channelIds.length === 0) {
      return { channelIds: [], channels: [] };
    }
    const mutedChannels = await db
      .select({ id: channels.id, name: channels.name })
      .from(channels)
      .where(inArray(channels.id, channelIds));
    return { channelIds, channels: mutedChannels };
  });

  app.get("/api/v1/dens/discover", { preHandler: requireAuth }, async (req) => {
    const { userId } = req as AuthedRequest;
    const joined = await db
      .select({ denId: denMembers.denId })
      .from(denMembers)
      .where(eq(denMembers.userId, userId));
    const joinedIds = joined.map((row) => row.denId);

    const rows = await db
      .select({
        id: dens.id,
        name: dens.name,
        iconUrl: dens.iconUrl,
        description: dens.description,
        memberCount: sql<number>`(
          SELECT count(*)::int FROM den_members
          WHERE den_id = ${dens.id}
        )`.as("member_count"),
      })
      .from(dens)
      .where(
        joinedIds.length > 0
          ? and(eq(dens.isPublic, 1), notInArray(dens.id, joinedIds))
          : eq(dens.isPublic, 1)
      )
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
}
