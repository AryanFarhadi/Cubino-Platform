import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  messages,
  messageReactions,
  users,
  channels,
  dmMessages,
  dmParticipants,
  dmMessageReactions,
} from "../db/schema.js";
import { createNotification } from "../routes/notifications.js";
import { verifyAccess } from "../lib/auth.js";
import { toUserPublic } from "../lib/auth.js";
import { can, isChannelMember, Permission } from "../services/permissions.js";
import { checkSlowMode } from "../services/slow-mode.js";
import { setTyping, clearTyping, getTyping, setDmTyping, clearDmTyping, getDmTyping, setPresence } from "../lib/redis.js";
import {
  broadcastChannelMessage,
  broadcastMessageUpdate,
  broadcastMessageDelete,
  broadcastDmMessageCreate,
  broadcastDmMessageUpdate,
  broadcastDmMessageDelete,
  notifyDmParticipants,
} from "../services/chat-broadcast.js";
import { maybeUnlockMessageMilestones } from "../services/achievement-triggers.js";
import { isDmParticipant } from "../services/dm-mute.js";
import { isDirectDmBlocked } from "../services/user-blocks.js";

type AuthedSocket = Socket & { userId: string; username: string };

const attachmentInputSchema = z.object({
  url: z.string().min(1).max(2048),
  mime: z.string().min(1).max(128),
  size: z.number().int().min(1).max(25 * 1024 * 1024),
  filename: z.string().min(1).max(256),
});

const sendPayloadSchema = z.object({
  content: z.string().max(4000).default(""),
  attachments: z.array(attachmentInputSchema).max(5).optional(),
});

function authSocket(socket: Socket): AuthedSocket | null {
  const token =
    socket.handshake.auth?.token ??
    socket.handshake.headers.authorization?.toString().replace("Bearer ", "");
  if (!token) return null;
  try {
    const payload = verifyAccess(token);
    (socket as AuthedSocket).userId = payload.sub;
    (socket as AuthedSocket).username = payload.username;
    return socket as AuthedSocket;
  } catch {
    return null;
  }
}

export function registerChatHandlers(io: Server) {
  const chat = io.of("/chat");

  chat.use((socket, next) => {
    if (!authSocket(socket)) return next(new Error("Unauthorized"));
    next();
  });

  chat.on("connection", async (socket) => {
    const s = socket as AuthedSocket;
    socket.join(`user:${s.userId}`);

    const myDms = await db
      .select({ dmChannelId: dmParticipants.dmChannelId })
      .from(dmParticipants)
      .where(eq(dmParticipants.userId, s.userId));
    for (const { dmChannelId } of myDms) {
      socket.join(`dm:${dmChannelId}`);
    }

    await setPresence(s.userId, { status: "online" });
    socket.broadcast.emit("presence:update", {
      userId: s.userId,
      status: "online",
    });

    socket.on("join:channel", async ({ channelId }: { channelId: string }) => {
      if (!(await isChannelMember(s.userId, channelId))) return;
      socket.join(`channel:${channelId}`);
    });

    socket.on("leave:channel", ({ channelId }: { channelId: string }) => {
      socket.leave(`channel:${channelId}`);
    });

    socket.on("join:dm", async ({ dmId }: { dmId: string }) => {
      const member = await db
        .select()
        .from(dmParticipants)
        .where(
          and(eq(dmParticipants.dmChannelId, dmId), eq(dmParticipants.userId, s.userId))
        )
        .limit(1);
      if (member.length === 0) return;
      socket.join(`dm:${dmId}`);
    });

    socket.on(
      "message:send",
      async (payload: { channelId: string; content?: string; attachments?: unknown[] }) => {
        const { channelId } = payload;
        const parsed = sendPayloadSchema.safeParse(payload);
        if (!parsed.success) return;

        const content = parsed.data.content.trim();
        const attachmentInputs = parsed.data.attachments ?? [];
        if (!content && attachmentInputs.length === 0) return;
        if (!validateAttachmentInputs(attachmentInputs, s.userId)) return;

        const [ch] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
        if (!ch || !(await isChannelMember(s.userId, channelId))) return;
        if (!(await can(s.userId, ch.denId, Permission.SEND_MESSAGES))) return;

        const slowCheck = await checkSlowMode(
          s.userId,
          channelId,
          ch.denId,
          ch.slowModeSeconds ?? 0
        );
        if (!slowCheck.allowed) {
          socket.emit("message:error", {
            channelId,
            code: "SLOW_MODE",
            retryAfterMs: slowCheck.retryAfterMs ?? 0,
          });
          return;
        }

        const [msg] = await db
          .insert(messages)
          .values({ channelId, authorId: s.userId, content })
          .returning();
        const savedAttachments = await insertChannelAttachments(msg.id, attachmentInputs);
        const [author] = await db
          .select()
          .from(users)
          .where(eq(users.id, s.userId))
          .limit(1);

        const dto = {
          id: msg.id,
          channelId: msg.channelId,
          authorId: msg.authorId,
          content: msg.content,
          editedAt: null,
          deletedAt: null,
          createdAt: msg.createdAt.toISOString(),
          author: toUserPublic(author),
          reactions: [],
          attachments: savedAttachments,
        };
        await broadcastChannelMessage(dto, ch.denId, s.userId);
        void maybeUnlockMessageMilestones(s.userId);
      }
    );

    socket.on(
      "dm:send",
      async (payload: { dmId: string; content?: string; attachments?: unknown[] }) => {
        const { dmId } = payload;
        const parsed = sendPayloadSchema.safeParse(payload);
        if (!parsed.success) return;

        const content = parsed.data.content.trim();
        const attachmentInputs = parsed.data.attachments ?? [];
        if (!content && attachmentInputs.length === 0) return;
        if (!validateAttachmentInputs(attachmentInputs, s.userId)) return;

        const member = await db
          .select()
          .from(dmParticipants)
          .where(
            and(eq(dmParticipants.dmChannelId, dmId), eq(dmParticipants.userId, s.userId))
          )
          .limit(1);
        if (member.length === 0) return;
        if (await isDirectDmBlocked(s.userId, dmId)) return;

        const [msg] = await db
          .insert(dmMessages)
          .values({ dmChannelId: dmId, authorId: s.userId, content })
          .returning();
        const savedAttachments = await insertDmAttachments(msg.id, attachmentInputs);
        const [author] = await db
          .select()
          .from(users)
          .where(eq(users.id, s.userId))
          .limit(1);

        const dto = {
          id: msg.id,
          dmChannelId: dmId,
          authorId: msg.authorId,
          content: msg.content,
          editedAt: null,
          deletedAt: null,
          createdAt: msg.createdAt.toISOString(),
          author: toUserPublic(author),
          attachments: savedAttachments,
        };
        broadcastDmMessageCreate(dto);

        const notifyBody =
          content ||
          (savedAttachments[0]
            ? `Sent ${savedAttachments[0].filename}`
            : "Sent an attachment");

        await notifyDmParticipants(
          dto,
          s.userId,
          author.displayName,
          notifyBody,
          createNotification
        );
        void maybeUnlockMessageMilestones(s.userId);
      }
    );

    socket.on(
      "dm:edit",
      async ({ messageId, content }: { messageId: string; content: string }) => {
        const trimmed = content.trim();
        if (!trimmed) return;
        const [msg] = await db
          .select()
          .from(dmMessages)
          .where(eq(dmMessages.id, messageId))
          .limit(1);
        if (!msg || msg.authorId !== s.userId || msg.deletedAt) return;
        if (!(await isDmParticipant(s.userId, msg.dmChannelId))) return;
        if (await isDirectDmBlocked(s.userId, msg.dmChannelId)) return;
        const [updated] = await db
          .update(dmMessages)
          .set({ content: trimmed, editedAt: new Date() })
          .where(eq(dmMessages.id, messageId))
          .returning();
        broadcastDmMessageUpdate({
          id: updated.id,
          dmChannelId: updated.dmChannelId,
          content: updated.content,
          editedAt: updated.editedAt!.toISOString(),
        });
      }
    );

    socket.on("dm:delete", async ({ messageId }: { messageId: string }) => {
      const [msg] = await db
        .select()
        .from(dmMessages)
        .where(eq(dmMessages.id, messageId))
        .limit(1);
      if (!msg || msg.authorId !== s.userId || msg.deletedAt) return;
      if (!(await isDmParticipant(s.userId, msg.dmChannelId))) return;
      if (await isDirectDmBlocked(s.userId, msg.dmChannelId)) return;
      await db
        .update(dmMessages)
        .set({ deletedAt: new Date(), content: "" })
        .where(eq(dmMessages.id, messageId));
      broadcastDmMessageDelete({ id: messageId, dmChannelId: msg.dmChannelId });
    });

    socket.on(
      "message:edit",
      async ({ messageId, content }: { messageId: string; content: string }) => {
        const trimmed = content.trim();
        if (!trimmed || trimmed.length > 4000) return;
        const [msg] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
        if (!msg || msg.authorId !== s.userId || msg.deletedAt) return;
        if (!(await isChannelMember(s.userId, msg.channelId))) return;
        const [updated] = await db
          .update(messages)
          .set({ content: trimmed, editedAt: new Date() })
          .where(eq(messages.id, messageId))
          .returning();
        broadcastMessageUpdate({
          id: updated.id,
          channelId: updated.channelId,
          content: updated.content,
          editedAt: updated.editedAt!.toISOString(),
        });
      }
    );

    socket.on("message:delete", async ({ messageId }: { messageId: string }) => {
      const [msg] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
      if (!msg || msg.deletedAt) return;
      if (!(await isChannelMember(s.userId, msg.channelId))) return;
      const [ch] = await db.select().from(channels).where(eq(channels.id, msg.channelId)).limit(1);
      const allowed =
        msg.authorId === s.userId ||
        (ch && (await can(s.userId, ch.denId, Permission.MANAGE_MESSAGES)));
      if (!allowed) return;
      await db
        .update(messages)
        .set({ deletedAt: new Date(), content: "" })
        .where(eq(messages.id, messageId));
      broadcastMessageDelete({ id: messageId, channelId: msg.channelId });
    });

    socket.on("typing:start", async ({ channelId }: { channelId: string }) => {
      if (!(await isChannelMember(s.userId, channelId))) return;
      await setTyping(channelId, s.userId);
      const userIds = await getTyping(channelId);
      chat.to(`channel:${channelId}`).emit("typing:update", { channelId, userIds });
    });

    socket.on("typing:stop", async ({ channelId }: { channelId: string }) => {
      if (!(await isChannelMember(s.userId, channelId))) return;
      await clearTyping(channelId, s.userId);
      const userIds = await getTyping(channelId);
      chat.to(`channel:${channelId}`).emit("typing:update", { channelId, userIds });
    });

    socket.on("dm:typing:start", async ({ dmId }: { dmId: string }) => {
      const member = await db
        .select()
        .from(dmParticipants)
        .where(and(eq(dmParticipants.dmChannelId, dmId), eq(dmParticipants.userId, s.userId)))
        .limit(1);
      if (member.length === 0) return;
      if (await isDirectDmBlocked(s.userId, dmId)) return;
      await setDmTyping(dmId, s.userId);
      const userIds = await getDmTyping(dmId);
      chat.to(`dm:${dmId}`).emit("dm:typing:update", { dmId, userIds });
    });

    socket.on("dm:typing:stop", async ({ dmId }: { dmId: string }) => {
      if (!(await isDmParticipant(s.userId, dmId))) return;
      if (await isDirectDmBlocked(s.userId, dmId)) return;
      await clearDmTyping(dmId, s.userId);
      const userIds = await getDmTyping(dmId);
      chat.to(`dm:${dmId}`).emit("dm:typing:update", { dmId, userIds });
    });

    socket.on(
      "reaction:toggle",
      async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
        if (!emoji || emoji.length > 32) return;

        const [msg] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
        if (!msg || msg.deletedAt) return;
        if (!(await isChannelMember(s.userId, msg.channelId))) return;

        const existing = await db
          .select()
          .from(messageReactions)
          .where(
            and(
              eq(messageReactions.messageId, messageId),
              eq(messageReactions.userId, s.userId),
              eq(messageReactions.emoji, emoji)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          await db
            .delete(messageReactions)
            .where(
              and(
                eq(messageReactions.messageId, messageId),
                eq(messageReactions.userId, s.userId),
                eq(messageReactions.emoji, emoji)
              )
            );
        } else {
          await db.insert(messageReactions).values({
            messageId,
            userId: s.userId,
            emoji,
          });
        }

        const all = await db
          .select()
          .from(messageReactions)
          .where(eq(messageReactions.messageId, messageId));
        const grouped = new Map<string, string[]>();
        for (const r of all) {
          const list = grouped.get(r.emoji) ?? [];
          list.push(r.userId);
          grouped.set(r.emoji, list);
        }
        chat.in(`channel:${msg.channelId}`).emit("reaction:update", {
          messageId,
          reactions: [...grouped.entries()].map(([e, userIds]) => ({
            emoji: e,
            count: userIds.length,
            userIds,
          })),
        });
      }
    );

    socket.on(
      "dm:reaction:toggle",
      async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
        if (!emoji || emoji.length > 32) return;

        const [msg] = await db
          .select()
          .from(dmMessages)
          .where(eq(dmMessages.id, messageId))
          .limit(1);
        if (!msg || msg.deletedAt) return;
        if (!(await isDmParticipant(s.userId, msg.dmChannelId))) return;
        if (await isDirectDmBlocked(s.userId, msg.dmChannelId)) return;

        const existing = await db
          .select()
          .from(dmMessageReactions)
          .where(
            and(
              eq(dmMessageReactions.messageId, messageId),
              eq(dmMessageReactions.userId, s.userId),
              eq(dmMessageReactions.emoji, emoji)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          await db
            .delete(dmMessageReactions)
            .where(
              and(
                eq(dmMessageReactions.messageId, messageId),
                eq(dmMessageReactions.userId, s.userId),
                eq(dmMessageReactions.emoji, emoji)
              )
            );
        } else {
          await db.insert(dmMessageReactions).values({
            messageId,
            userId: s.userId,
            emoji,
          });
        }

        const all = await db
          .select()
          .from(dmMessageReactions)
          .where(eq(dmMessageReactions.messageId, messageId));
        const grouped = new Map<string, string[]>();
        for (const r of all) {
          const list = grouped.get(r.emoji) ?? [];
          list.push(r.userId);
          grouped.set(r.emoji, list);
        }
        chat.in(`dm:${msg.dmChannelId}`).emit("dm:reaction:update", {
          messageId,
          reactions: [...grouped.entries()].map(([e, userIds]) => ({
            emoji: e,
            count: userIds.length,
            userIds,
          })),
        });
      }
    );

    socket.on("presence:set", async ({ status }: { status: string }) => {
      if (!["online", "idle", "dnd", "invisible"].includes(status)) return;
      await db.update(users).set({ status: status as typeof users.$inferSelect.status }).where(eq(users.id, s.userId));
      const visible = status !== "invisible" ? status : "offline";
      socket.broadcast.emit("presence:update", { userId: s.userId, status: visible });
    });

    socket.on("disconnect", () => {
      socket.broadcast.emit("presence:update", {
        userId: s.userId,
        status: "offline",
      });
    });
  });
}

export function registerSignalHandlers(io: Server) {
  const signal = io.of("/signal");

  signal.use((socket, next) => {
    if (!authSocket(socket)) return next(new Error("Unauthorized"));
    next();
  });

  /** Require an active voice room join before relaying WebRTC signaling. */
  async function canRelayVoiceSignal(
    socket: Socket,
    userId: string,
    channelId: string
  ): Promise<boolean> {
    if (!socket.rooms.has(`voice:${channelId}`)) return false;
    if (!(await isChannelMember(userId, channelId))) return false;
    const [ch] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
    if (!ch) return false;
    return can(userId, ch.denId, Permission.CONNECT_VOICE);
  }

  signal.on("connection", (socket) => {
    const s = socket as AuthedSocket;
    socket.on("voice:join", async ({ channelId }: { channelId: string }) => {
      if (!(await isChannelMember(s.userId, channelId))) return;
      const [ch] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
      if (!ch || !(await can(s.userId, ch.denId, Permission.CONNECT_VOICE))) return;
      socket.join(`voice:${channelId}`);
      socket.to(`voice:${channelId}`).emit("voice:user-joined", {
        userId: s.userId,
        channelId,
      });
    });

    socket.on("voice:leave", ({ channelId }: { channelId: string }) => {
      socket.to(`voice:${channelId}`).emit("voice:state", {
        userId: s.userId,
        channelId,
        muted: true,
        deafened: false,
        speaking: false,
      });
      socket.leave(`voice:${channelId}`);
      socket.to(`voice:${channelId}`).emit("voice:user-left", {
        userId: s.userId,
        channelId,
      });
    });

    socket.on(
      "signal:offer",
      async ({
        channelId,
        targetUserId,
        sdp,
      }: {
        channelId: string;
        targetUserId: string;
        sdp: unknown;
      }) => {
        if (!(await canRelayVoiceSignal(socket, s.userId, channelId))) return;
        signal.to(`voice:${channelId}`).emit("signal:offer", {
          fromUserId: s.userId,
          targetUserId,
          sdp,
        });
      }
    );

    socket.on(
      "signal:answer",
      async ({
        channelId,
        targetUserId,
        sdp,
      }: {
        channelId: string;
        targetUserId: string;
        sdp: unknown;
      }) => {
        if (!(await canRelayVoiceSignal(socket, s.userId, channelId))) return;
        signal.to(`voice:${channelId}`).emit("signal:answer", {
          fromUserId: s.userId,
          targetUserId,
          sdp,
        });
      }
    );

    socket.on(
      "signal:ice",
      async ({
        channelId,
        targetUserId,
        candidate,
      }: {
        channelId: string;
        targetUserId: string;
        candidate: unknown;
      }) => {
        if (!(await canRelayVoiceSignal(socket, s.userId, channelId))) return;
        signal.to(`voice:${channelId}`).emit("signal:ice", {
          fromUserId: s.userId,
          targetUserId,
          candidate,
        });
      }
    );

    socket.on(
      "voice:state",
      async ({
        channelId,
        muted,
        deafened,
        speaking,
      }: {
        channelId: string;
        muted: boolean;
        deafened: boolean;
        speaking: boolean;
      }) => {
        if (!(await canRelayVoiceSignal(socket, s.userId, channelId))) return;
        let actualSpeaking = speaking;
        if (speaking && !muted) {
          const [ch] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
          if (ch && !(await can(s.userId, ch.denId, Permission.SPEAK))) {
            actualSpeaking = false;
          }
        }
        socket.to(`voice:${channelId}`).emit("voice:state", {
          userId: s.userId,
          channelId,
          muted,
          deafened,
          speaking: actualSpeaking,
        });
      }
    );
  });
}
