import { eq, and, desc, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { messages } from "../db/schema.js";
import { can, Permission } from "./permissions.js";

export interface SlowModeResult {
  allowed: boolean;
  retryAfterMs?: number;
}

/** Returns whether the user may send in a slow-mode channel (mods bypass). */
export async function checkSlowMode(
  userId: string,
  channelId: string,
  denId: string,
  slowModeSeconds: number
): Promise<SlowModeResult> {
  if (slowModeSeconds <= 0) return { allowed: true };
  if (await can(userId, denId, Permission.MANAGE_MESSAGES)) return { allowed: true };

  const [last] = await db
    .select({ createdAt: messages.createdAt })
    .from(messages)
    .where(
      and(
        eq(messages.channelId, channelId),
        eq(messages.authorId, userId),
        isNull(messages.deletedAt)
      )
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);

  if (!last) return { allowed: true };

  const elapsed = Date.now() - last.createdAt.getTime();
  const requiredMs = slowModeSeconds * 1000;
  if (elapsed >= requiredMs) return { allowed: true };

  return { allowed: false, retryAfterMs: requiredMs - elapsed };
}
