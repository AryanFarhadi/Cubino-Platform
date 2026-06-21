import { eq, and, or, isNull, gt } from "drizzle-orm";
import { db } from "../db/index.js";
import { bans } from "../db/schema.js";

/** True when the user has an active (non-expired) ban for this den. */
export async function isUserBanned(userId: string, denId: string): Promise<boolean> {
  const now = new Date();
  const rows = await db
    .select({ id: bans.id })
    .from(bans)
    .where(
      and(
        eq(bans.denId, denId),
        eq(bans.userId, userId),
        or(isNull(bans.expiresAt), gt(bans.expiresAt, now))
      )
    )
    .limit(1);
  return rows.length > 0;
}
