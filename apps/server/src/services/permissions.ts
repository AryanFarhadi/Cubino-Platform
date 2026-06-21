import { eq, and, desc } from "drizzle-orm";
import { hasPermission, Permission, DEFAULT_ADMIN } from "@cubino/shared";
import { db } from "../db/index.js";
import { denMembers, memberRoles, roles, channels, dens } from "../db/schema.js";

export async function getMemberPermissions(
  userId: string,
  denId: string
): Promise<bigint> {
  const member = await db
    .select()
    .from(denMembers)
    .where(and(eq(denMembers.denId, denId), eq(denMembers.userId, userId)))
    .limit(1);

  if (member.length === 0) return 0n;

  const assigned = await db
    .select({ permissions: roles.permissions, position: roles.position })
    .from(memberRoles)
    .innerJoin(roles, eq(memberRoles.roleId, roles.id))
    .where(and(eq(memberRoles.denId, denId), eq(memberRoles.userId, userId)))
    .orderBy(desc(roles.position));

  let combined = 0n;
  for (const r of assigned) {
    combined |= r.permissions;
  }
  return combined;
}

/** Den owners receive full admin permissions; others use assigned roles. */
export async function getEffectivePermissions(userId: string, denId: string): Promise<bigint> {
  const [den] = await db
    .select({ ownerId: dens.ownerId })
    .from(dens)
    .where(eq(dens.id, denId))
    .limit(1);
  if (den?.ownerId === userId) return DEFAULT_ADMIN;
  return getMemberPermissions(userId, denId);
}

export async function can(
  userId: string,
  denId: string,
  flag: bigint
): Promise<boolean> {
  const perms = await getEffectivePermissions(userId, denId);
  return hasPermission(perms, flag);
}

export async function canManageDen(userId: string, denId: string): Promise<boolean> {
  const { dens } = await import("../db/schema.js");
  const [den] = await db.select({ ownerId: dens.ownerId }).from(dens).where(eq(dens.id, denId)).limit(1);
  if (den?.ownerId === userId) return true;
  return can(userId, denId, Permission.MANAGE_DEN);
}

export async function isChannelMember(userId: string, channelId: string) {
  const ch = await db
    .select({ denId: channels.denId })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  if (ch.length === 0) return false;
  const member = await db
    .select()
    .from(denMembers)
    .where(and(eq(denMembers.denId, ch[0].denId), eq(denMembers.userId, userId)))
    .limit(1);
  return member.length > 0;
}

export async function getChannelDenId(channelId: string) {
  const ch = await db
    .select({ denId: channels.denId })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  return ch[0]?.denId ?? null;
}

export { Permission };
