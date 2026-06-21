import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, desc, and, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { notifications, pushSubscriptions } from "../db/schema.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { sendPushToUser } from "../services/push-notify.js";
import { buildNotificationPushUrl } from "../lib/notification-url.js";
import { queueChannelPushNotification, queueDmPushNotification } from "../services/push-cooldown.js";

export async function notificationRoutes(app: FastifyInstance) {
  app.get("/api/v1/notifications", { preHandler: requireAuth }, async (req) => {
    const { userId } = req as AuthedRequest;
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    return {
      notifications: rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        read: n.read === 1,
        metadata: n.metadata,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  });

  app.get("/api/v1/notifications/unread-count", { preHandler: requireAuth }, async (req) => {
    const { userId } = req as AuthedRequest;
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, 0)));
    return { count: row?.count ?? 0 };
  });

  app.post("/api/v1/notifications/read-all", { preHandler: requireAuth }, async (req) => {
    const { userId } = req as AuthedRequest;
    await db
      .update(notifications)
      .set({ read: 1 })
      .where(and(eq(notifications.userId, userId), eq(notifications.read, 0)));
    return { ok: true };
  });

  app.patch("/api/v1/notifications/:id/read", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const { id } = req.params as { id: string };
    const [n] = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
    if (!n || n.userId !== userId) return reply.status(404).send({ error: "Not found" });
    await db.update(notifications).set({ read: 1 }).where(eq(notifications.id, id));
    return { ok: true };
  });

  app.post("/api/v1/notifications/push/subscribe", { preHandler: requireAuth }, async (req) => {
    const { userId } = req as AuthedRequest;
    const body = z
      .object({
        endpoint: z.string().url(),
        keys: z.object({ p256dh: z.string(), auth: z.string() }),
      })
      .parse(req.body);
    await db
      .delete(pushSubscriptions)
      .where(
        and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, body.endpoint))
      );
    await db.insert(pushSubscriptions).values({
      userId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    });
    return { ok: true };
  });

  app.get("/api/v1/notifications/vapid-public-key", async () => ({
    publicKey: process.env.VAPID_PUBLIC_KEY ?? null,
  }));
}

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  body?: string,
  metadata?: string
) {
  await db.insert(notifications).values({ userId, type, title, body, metadata });

  const url = buildNotificationPushUrl(metadata);

  const pushPayload = {
    title,
    body: body ?? "",
    url,
  };

  if (metadata) {
    try {
      const parsed = JSON.parse(metadata) as { dmId?: string; channelId?: string };
      if (typeof parsed.dmId === "string" && type === "dm") {
        queueDmPushNotification(userId, parsed.dmId, pushPayload);
        return;
      }
      if (
        typeof parsed.channelId === "string" &&
        (type === "mention" || type === "everyone")
      ) {
        queueChannelPushNotification(userId, parsed.channelId, pushPayload);
        return;
      }
    } catch {
      /* fall through to immediate push */
    }
  }

  void sendPushToUser(userId, pushPayload);
}
