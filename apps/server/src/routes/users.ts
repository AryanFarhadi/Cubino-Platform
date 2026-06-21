import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, memberRoles, roles, denMembers } from "../db/schema.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { toUserPublic } from "../lib/auth.js";
import { roleMentionKey } from "../services/mention-notify.js";

const patchMeSchema = z.object({
  displayName: z.string().min(1).max(64).optional(),
  bio: z.string().max(256).optional().nullable(),
  customStatus: z.string().max(128).optional().nullable(),
  status: z.enum(["online", "idle", "dnd", "invisible"]).optional(),
  avatarUrl: z
    .string()
    .max(2048)
    .optional()
    .nullable()
    .refine(
      (v) =>
        v == null ||
        v === "" ||
        v.startsWith("/uploads/") ||
        /^https?:\/\//i.test(v),
      { message: "Invalid avatar URL" }
    ),
});

export async function userRoutes(app: FastifyInstance) {
  app.patch("/api/v1/users/me", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const body = patchMeSchema.parse(req.body ?? {});

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.displayName !== undefined) updates.displayName = body.displayName;
    if (body.bio !== undefined) updates.bio = body.bio;
    if (body.customStatus !== undefined) updates.customStatus = body.customStatus;
    if (body.status !== undefined) updates.status = body.status;
    if (body.avatarUrl !== undefined) updates.avatarUrl = body.avatarUrl;

    if (Object.keys(updates).length === 1) {
      return reply.status(400).send({ error: "No fields to update" });
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning();

    if (!updated) return reply.status(404).send({ error: "User not found" });

    return { user: toUserPublic(updated) };
  });

  /** Normalized @role mention keys the current user holds, grouped by den. */
  app.get("/api/v1/users/me/role-mention-keys", { preHandler: requireAuth }, async (req) => {
    const { userId } = req as AuthedRequest;
    const rows = await db
      .select({ denId: memberRoles.denId, roleName: roles.name })
      .from(memberRoles)
      .innerJoin(roles, eq(memberRoles.roleId, roles.id))
      .innerJoin(
        denMembers,
        and(eq(denMembers.denId, memberRoles.denId), eq(denMembers.userId, userId))
      )
      .where(eq(memberRoles.userId, userId));

    const byDen: Record<string, string[]> = {};
    for (const row of rows) {
      const key = roleMentionKey(row.roleName).toLowerCase();
      if (!key) continue;
      if (!byDen[row.denId]) byDen[row.denId] = [];
      if (!byDen[row.denId].includes(key)) byDen[row.denId].push(key);
    }

    return { byDen };
  });

  app.get("/api/v1/users/:username", { preHandler: requireAuth }, async (req, reply) => {
    const { username } = req.params as { username: string };
    if (username === "me") {
      return reply.status(400).send({ error: "Use PATCH /api/v1/users/me" });
    }
    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (!user) return reply.status(404).send({ error: "User not found" });
    return { user: toUserPublic(user) };
  });
}
