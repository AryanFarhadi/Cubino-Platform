import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { roles, memberRoles, dens } from "../db/schema.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { can, Permission } from "../services/permissions.js";

export async function roleRoutes(app: FastifyInstance) {
  app.get("/api/v1/dens/:denId/roles", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId } = req.params as { denId: string };
    if (!(await can(userId, denId, Permission.MANAGE_ROLES))) {
      if (!(await can(userId, denId, Permission.SEND_MESSAGES))) {
        return reply.status(403).send({ error: "Forbidden" });
      }
    }
    const rows = await db
      .select()
      .from(roles)
      .where(eq(roles.denId, denId))
      .orderBy(desc(roles.position));
    return {
      roles: rows.map((r) => ({
        id: r.id,
        denId: r.denId,
        name: r.name,
        color: r.color,
        position: r.position,
        permissions: r.permissions.toString(),
      })),
    };
  });

  app.post("/api/v1/dens/:denId/roles", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { denId } = req.params as { denId: string };
    if (!(await can(userId, denId, Permission.MANAGE_ROLES))) {
      return reply.status(403).send({ error: "Missing permission" });
    }
    const body = z
      .object({
        name: z.string().min(1).max(64),
        color: z.string().default("#e8a838"),
        permissions: z.string(),
      })
      .parse(req.body);

    const [role] = await db
      .insert(roles)
      .values({
        denId,
        name: body.name,
        color: body.color,
        permissions: BigInt(body.permissions),
      })
      .returning();

    return {
      role: {
        id: role.id,
        denId: role.denId,
        name: role.name,
        color: role.color,
        position: role.position,
        permissions: role.permissions.toString(),
      },
    };
  });

  app.patch("/api/v1/roles/:roleId", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { roleId } = req.params as { roleId: string };
    const body = z
      .object({
        name: z.string().optional(),
        color: z.string().optional(),
        permissions: z.string().optional(),
        position: z.number().optional(),
      })
      .parse(req.body);

    const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) return reply.status(404).send({ error: "Not found" });
    if (!(await can(userId, role.denId, Permission.MANAGE_ROLES))) {
      return reply.status(403).send({ error: "Missing permission" });
    }

    const [updated] = await db
      .update(roles)
      .set({
        name: body.name ?? role.name,
        color: body.color ?? role.color,
        position: body.position ?? role.position,
        permissions: body.permissions ? BigInt(body.permissions) : role.permissions,
      })
      .where(eq(roles.id, roleId))
      .returning();

    return {
      role: {
        id: updated.id,
        denId: updated.denId,
        name: updated.name,
        color: updated.color,
        position: updated.position,
        permissions: updated.permissions.toString(),
      },
    };
  });

  app.delete("/api/v1/roles/:roleId", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { roleId } = req.params as { roleId: string };
    const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) return reply.status(404).send({ error: "Not found" });
    if (role.name === "@whole-den") return reply.status(400).send({ error: "Cannot delete @whole-den" });
    if (!(await can(userId, role.denId, Permission.MANAGE_ROLES))) {
      return reply.status(403).send({ error: "Missing permission" });
    }
    await db.delete(roles).where(eq(roles.id, roleId));
    return { ok: true };
  });

  app.put(
    "/api/v1/dens/:denId/members/:memberId/roles",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { userId } = req as AuthedRequest;
      const { denId, memberId } = req.params as { denId: string; memberId: string };
      if (!(await can(userId, denId, Permission.MANAGE_ROLES))) {
        return reply.status(403).send({ error: "Missing permission" });
      }

      const [den] = await db
        .select({ ownerId: dens.ownerId })
        .from(dens)
        .where(eq(dens.id, denId))
        .limit(1);
      if (den?.ownerId === memberId) {
        return reply.status(403).send({ error: "Cannot change the Den owner's roles" });
      }

      const body = z.object({ roleIds: z.array(z.string().uuid()) }).parse(req.body);

      const [everyoneRole] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.denId, denId), eq(roles.name, "@whole-den")))
        .limit(1);

      let roleIds = [...body.roleIds];
      if (everyoneRole && !roleIds.includes(everyoneRole.id)) {
        roleIds.push(everyoneRole.id);
      }

      await db
        .delete(memberRoles)
        .where(and(eq(memberRoles.denId, denId), eq(memberRoles.userId, memberId)));

      if (roleIds.length > 0) {
        await db.insert(memberRoles).values(
          roleIds.map((roleId) => ({ denId, userId: memberId, roleId }))
        );
      }
      return { ok: true };
    }
  );
}
