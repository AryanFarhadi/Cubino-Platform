import { DEFAULT_ADMIN, DEFAULT_EVERYONE } from "@cubino/shared";
import { db } from "../db/index.js";
import {
  dens,
  denMembers,
  categories,
  channels,
  roles,
  memberRoles,
  invites,
} from "../db/schema.js";
import { nanoid } from "nanoid";

export async function bootstrapDen(ownerId: string, name: string) {
  const [den] = await db
    .insert(dens)
    .values({ name, ownerId, description: `Welcome to ${name}!` })
    .returning();

  await db.insert(denMembers).values({ denId: den.id, userId: ownerId });

  const [everyoneRole] = await db
    .insert(roles)
    .values({
      denId: den.id,
      name: "@whole-den",
      color: "#a89888",
      position: 0,
      permissions: DEFAULT_EVERYONE,
    })
    .returning();

  const [keeperRole] = await db
    .insert(roles)
    .values({
      denId: den.id,
      name: "Den Keeper",
      color: "#e8a838",
      position: 1,
      permissions: DEFAULT_ADMIN,
    })
    .returning();

  await db.insert(memberRoles).values({
    denId: den.id,
    userId: ownerId,
    roleId: keeperRole.id,
  });

  const [category] = await db
    .insert(categories)
    .values({ denId: den.id, name: "General", position: 0 })
    .returning();

  await db.insert(channels).values([
    {
      denId: den.id,
      categoryId: category.id,
      name: "welcome",
      type: "TEXT",
      position: 0,
      topic: "Say hello to the den!",
    },
    {
      denId: den.id,
      categoryId: category.id,
      name: "campfire",
      type: "VOICE",
      position: 1,
    },
  ]);

  const code = nanoid(10);
  await db.insert(invites).values({
    denId: den.id,
    code,
    creatorId: ownerId,
  });

  return { den, inviteCode: code, everyoneRoleId: everyoneRole.id };
}
