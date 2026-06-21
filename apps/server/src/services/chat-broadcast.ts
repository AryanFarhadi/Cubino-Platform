import { eq, and, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import { denMembers, dmParticipants, channels, users } from "../db/schema.js";
import { getChatNs } from "../ws/io.js";
import { notifyMentionedUsers, resolveMentionRecipients } from "./mention-notify.js";
import { getDenNotificationLevels } from "./notification-settings.js";
import { getMutedUserIdsForChannel } from "./channel-mute.js";
import { isDmMuted } from "./dm-mute.js";
import { isUserMentioned } from "./mention-notify.js";
import { sendPushToUser } from "./push-notify.js";
import { buildNotificationPushUrl } from "../lib/notification-url.js";
import { queueChannelPushNotification, prunePushCooldownMap } from "./push-cooldown.js";

export interface ChannelMessagePayload {
  id: string;
  channelId: string;
  authorId: string;
  content: string;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    status: string;
  };
  reactions: { emoji: string; count: number; userIds: string[] }[];
  attachments?: {
    id: string;
    url: string;
    mime: string;
    size: number;
    filename: string;
  }[];
}

/** Emit message:create to channel room and channel:notify to other den members. */
export async function broadcastChannelMessage(
  dto: ChannelMessagePayload,
  denId: string,
  senderUserId: string
): Promise<void> {
  const chat = getChatNs();
  if (!chat) return;

  chat.in(`channel:${dto.channelId}`).emit("message:create", dto);

  const [channelRow] = await db
    .select({ name: channels.name })
    .from(channels)
    .where(eq(channels.id, dto.channelId))
    .limit(1);
  const channelLabel = channelRow?.name ? `#${channelRow.name}` : "New message";
  const pushMetadata = JSON.stringify({
    denId,
    channelId: dto.channelId,
    messageId: dto.id,
  });
  const pushUrl = buildNotificationPushUrl(pushMetadata);
  const pushBody = `${dto.author.displayName}: ${dto.content.slice(0, 120)}`;

  const members = await db
    .select({ userId: denMembers.userId })
    .from(denMembers)
    .where(eq(denMembers.denId, denId));

  const notificationLevels = await getDenNotificationLevels(denId);
  const mutedUserIds = await getMutedUserIdsForChannel(dto.channelId);
  const mentionRecipients = await resolveMentionRecipients(dto.content, denId, senderUserId);

  for (const { userId } of members) {
    if (userId === senderUserId) continue;
    if (mutedUserIds.has(userId)) continue;
    if (mentionRecipients.has(userId)) continue;
    const level = notificationLevels.get(userId) ?? "all";
    if (level !== "all") continue;
    chat.to(`user:${userId}`).emit("channel:notify", {
      channelId: dto.channelId,
      denId,
      message: dto,
    });
    queueChannelPushNotification(userId, dto.channelId, {
      title: channelLabel,
      body: pushBody,
      url: pushUrl,
    });
  }

  prunePushCooldownMap();

  await notifyMentionedUsers(
    dto.content,
    denId,
    dto.channelId,
    dto.id,
    dto.author.displayName,
    senderUserId,
    mentionRecipients
  );
}

export interface MessageUpdatePayload {
  id: string;
  channelId: string;
  content: string;
  editedAt: string;
}

export interface MessageDeletePayload {
  id: string;
  channelId: string;
}

/** Emit message:update to everyone viewing the channel (including editor). */
export function broadcastMessageUpdate(payload: MessageUpdatePayload): void {
  const chat = getChatNs();
  if (!chat) return;
  chat.in(`channel:${payload.channelId}`).emit("message:update", payload);
}

/** Emit message:delete to everyone viewing the channel (including deleter). */
export function broadcastMessageDelete(payload: MessageDeletePayload): void {
  const chat = getChatNs();
  if (!chat) return;
  chat.in(`channel:${payload.channelId}`).emit("message:delete", payload);
}

export interface DmMessagePayload {
  id: string;
  dmChannelId: string;
  authorId: string;
  content: string;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  author: ChannelMessagePayload["author"];
  attachments?: ChannelMessagePayload["attachments"];
}

export interface DmMessageUpdatePayload {
  id: string;
  dmChannelId: string;
  content: string;
  editedAt: string;
}

export interface DmMessageDeletePayload {
  id: string;
  dmChannelId: string;
}

/** Emit dm:create to everyone in the DM room. */
export function broadcastDmMessageCreate(dto: DmMessagePayload): void {
  const chat = getChatNs();
  if (!chat) return;
  chat.in(`dm:${dto.dmChannelId}`).emit("dm:create", dto);
}

/** Notify other DM participants (socket + optional push notification record). */
export async function notifyDmParticipants(
  dto: DmMessagePayload,
  senderUserId: string,
  authorDisplayName: string,
  notifyBody: string,
  createNotificationFn: (
    userId: string,
    type: string,
    title: string,
    body?: string,
    metadata?: string
  ) => Promise<void>
): Promise<void> {
  const chat = getChatNs();
  if (!chat) return;

  const others = await db
    .select({ userId: dmParticipants.userId, username: users.username })
    .from(dmParticipants)
    .innerJoin(users, eq(dmParticipants.userId, users.id))
    .where(
      and(eq(dmParticipants.dmChannelId, dto.dmChannelId), ne(dmParticipants.userId, senderUserId))
    );

  for (const { userId, username } of others) {
    if (await isDmMuted(userId, dto.dmChannelId)) continue;
    chat.to(`user:${userId}`).emit("dm:notify", { dmId: dto.dmChannelId, message: dto });
    const mentioned = isUserMentioned(dto.content, username);
    await createNotificationFn(
      userId,
      mentioned ? "dm_mention" : "dm",
      mentioned ? `${authorDisplayName} mentioned you` : authorDisplayName,
      notifyBody.slice(0, 200),
      JSON.stringify({ dmId: dto.dmChannelId, messageId: dto.id })
    );
  }
}

/** Emit dm:update to everyone in the DM room. */
export function broadcastDmMessageUpdate(payload: DmMessageUpdatePayload): void {
  const chat = getChatNs();
  if (!chat) return;
  chat.in(`dm:${payload.dmChannelId}`).emit("dm:update", payload);
}

/** Emit dm:delete to everyone in the DM room. */
export function broadcastDmMessageDelete(payload: DmMessageDeletePayload): void {
  const chat = getChatNs();
  if (!chat) return;
  chat.in(`dm:${payload.dmChannelId}`).emit("dm:delete", payload);
}
