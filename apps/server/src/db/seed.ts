import "dotenv/config";
import { eq } from "drizzle-orm";
import argon2 from "argon2";
import { db } from "./index.js";
import { users } from "./schema.js";

async function seed() {
  const existing = await db.select().from(users).where(eq(users.username, "cubby"));
  if (existing.length > 0) {
    console.log("Seed already applied");
    return;
  }

  const hash = await argon2.hash("cubino123");
  await db.insert(users).values({
    email: "cubby@cubino.local",
    username: "cubby",
    passwordHash: hash,
    displayName: "Cubby",
    bio: "Official Cubino mascot",
    avatarUrl: "/avatars/cubby-1.svg",
  });

  console.log("Seeded demo user: cubby / cubino123");
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
