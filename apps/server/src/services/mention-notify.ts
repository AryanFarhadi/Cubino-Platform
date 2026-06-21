import { eq, and, inArray } from "drizzle-orm";
import { hasPermission, Permission } from "@cubino/shared";
import { db } from "../db/index.js";
import { users, denMembers, roles, memberRoles } from "../db/schema.js";
import { createNotification } from "../routes/notifications.js";
import { getChatNs } from "../ws/io.js";
import { getEffectivePermissions } from "./permissions.js";
import { getMemberNotificationLevel } from "./notification-settings.js";
import { isChannelMuted } from "./channel-mute.js";

const MENTION_PATTERN = /@([a-zA-Z0-9_]{2,32})/g;
const EVERYONE_PATTERN = /@(?:everyone|here)\b/i;

export type MentionKind = "mention" | "everyone" | "role";

export interface MentionRecipient {
  kind: MentionKind;
  /** Set when kind is "role" — used for notification title. */
  roleName?: string;
}

/** Normalize a role name into an @mention token (e.g. "Super Mod" → "SuperMod"). */
export function roleMentionKey(name: string): string {
  return name.replace(/\s+/g, "").replace(/[^a-zA-Z0-9_]/g, "");
}

/** Extract unique @usernames from message content (without the @ prefix). */
export function extractMentionUsernames(content: string): string[] {
  const found = new Set<string>();
  for (const match of content.matchAll(MENTION_PATTERN)) {
    const name = match[1].toLowerCase();
    if (name === "everyone" || name === "here") continue;
    found.add(name);
  }
  return [...found];
}

/** Returns true when `content` contains `@username` (case-insensitive, word boundary). */
export function isUserMentioned(content: string, username: string): boolean {
  if (!username) return false;
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`@${escaped}\\b`, "i").test(content);
}

/**
 * Resolve which den members should receive mention/everyone/role notifications.
 * Used to avoid duplicate channel:notify + mention:notify for the same message.
 */
export async function resolveMentionRecipients(
  content: string,
  denId: string,
  senderUserId: string
): Promise<Map<string, MentionRecipient>> {
  const usernames = extractMentionUsernames(content);
  const hasEveryone = EVERYONE_PATTERN.test(content);
  if (usernames.length === 0 && !hasEveryone) return new Map();

  const senderPerms = await getEffectivePermissions(senderUserId, denId);
  const canMentionEveryone = hasPermission(senderPerms, Permission.MENTION_EVERYONE);

  const members = await db
    .select({ user: users })
    .from(denMembers)
    .innerJoin(users, eq(denMembers.userId, users.id))
    .where(eq(denMembers.denId, denId));

  const recipients = new Map<string, MentionRecipient>();

  for (const { user } of members) {
    if (user.id === senderUserId) continue;
    const level = await getMemberNotificationLevel(user.id, denId);
    if (level === "none") continue;

    if (usernames.includes(user.username.toLowerCase())) {
      recipients.set(user.id, { kind: "mention" });
    }
  }

  const denRoles = await db.select().from(roles).where(eq(roles.denId, denId));
  for (const role of denRoles) {
    const key = roleMentionKey(role.name).toLowerCase();
    if (!key || !usernames.includes(key)) continue;

    const roleMembers = await db
      .select({ userId: memberRoles.userId })
      .from(memberRoles)
      .where(and(eq(memberRoles.denId, denId), eq(memberRoles.roleId, role.id)));

    for (const { userId } of roleMembers) {
      if (userId === senderUserId) continue;
      if (recipients.has(userId)) continue;
      const level = await getMemberNotificationLevel(userId, denId);
      if (level === "none") continue;
      recipients.set(userId, { kind: "role", roleName: role.name });
    }
  }

  if (hasEveryone && canMentionEveryone) {
    for (const { user } of members) {
      if (user.id === senderUserId) continue;
      if (recipients.has(user.id)) continue;
      const level = await getMemberNotificationLevel(user.id, denId);
      if (level === "none") continue;
      recipients.set(user.id, { kind: "everyone" });
    }
  }

  return recipients;
}

async function notifyMember(
  userId: string,
  recipient: MentionRecipient,
  title: string,
  body: string,
  metadata: string,
  channelId: string,
  messageId: string,
  denId: string,
  authorDisplayName: string
): Promise<void> {
  if (await isChannelMuted(userId, channelId)) return;
  const notificationType = recipient.kind === "everyone" ? "everyone" : "mention";
  await createNotification(userId, notificationType, title, body, metadata);
  getChatNs()?.to(`user:${userId}`).emit("mention:notify", {
    channelId,
    messageId,
    denId,
    authorDisplayName,
    preview: body.slice(0, 120),
    kind: recipient.kind === "everyone" ? "everyone" : "mention",
  });
}

/** Create in-app notifications (and socket ping) for @mentioned den members. */
export async function notifyMentionedUsers(
  content: string,
  denId: string,
  channelId: string,
  messageId: string,
  authorDisplayName: string,
  senderUserId: string,
  precomputed?: Map<string, MentionRecipient>
): Promise<void> {
  const recipients =
    precomputed ?? (await resolveMentionRecipients(content, denId, senderUserId));
  if (recipients.size === 0) return;

  const metadata = JSON.stringify({ channelId, messageId, denId });

  for (const [userId, recipient] of recipients) {
    const title =
      recipient.kind === "everyone"
        ? `${authorDisplayName} mentioned @everyone`
        : recipient.kind === "role" && recipient.roleName
          ? `${authorDisplayName} mentioned @${recipient.roleName}`
          : `${authorDisplayName} mentioned you`;
    await notifyMember(
      userId,
      recipient,
      title,
      content.slice(0, 200),
      metadata,
      channelId,
      messageId,
      denId,
      authorDisplayName
    );
  }
}
