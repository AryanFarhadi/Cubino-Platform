import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { dens, channels, messages, users } from "../db/schema.js";
import { toUserPublic } from "../lib/auth.js";
import { broadcastChannelMessage } from "./chat-broadcast.js";

/** Post a welcome message in #welcome when someone newly joins a Den. */
export async function announceMemberJoin(denId: string, userId: string): Promise<void> {
  const [den] = await db.select().from(dens).where(eq(dens.id, denId)).limit(1);
  if (!den) return;

  const [welcomeCh] = await db
    .select()
    .from(channels)
    .where(and(eq(channels.denId, denId), eq(channels.name, "welcome"), eq(channels.type, "TEXT")))
    .limit(1);
  if (!welcomeCh) return;

  const [member] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const [author] = await db.select().from(users).where(eq(users.id, den.ownerId)).limit(1);
  if (!member || !author) return;

  const intro = den.welcomeMessage?.trim()
    ? den.welcomeMessage.trim()
    : den.description?.trim()
      ? den.description.trim()
      : "Say hello and introduce yourself!";

  const content = `Welcome **${member.displayName}** (@${member.username}) to **${den.name}**! ${intro}`;

  const [msg] = await db
    .insert(messages)
    .values({ channelId: welcomeCh.id, authorId: den.ownerId, content })
    .returning();

  const dto = {
    id: msg.id,
    channelId: msg.channelId,
    authorId: msg.authorId,
    content: msg.content,
    editedAt: null,
    deletedAt: null,
    createdAt: msg.createdAt.toISOString(),
    author: toUserPublic(author),
    reactions: [] as { emoji: string; count: number; userIds: string[] }[],
  };

  await broadcastChannelMessage(dto, denId, den.ownerId);
}
