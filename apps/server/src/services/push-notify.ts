import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { pushSubscriptions } from "../db/schema.js";

export interface PushPayload {
  title: string;
  body: string;
  /** Relative app URL opened when the notification is clicked. */
  url?: string;
}

type WebPushModule = typeof import("web-push");

let webPushModule: WebPushModule | null | undefined;
let vapidConfigured = false;

async function getWebPush(): Promise<WebPushModule | null> {
  if (webPushModule !== undefined) return webPushModule;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    webPushModule = null;
    return null;
  }

  try {
    const mod = await import("web-push");
    if (!vapidConfigured) {
      mod.setVapidDetails(
        process.env.VAPID_SUBJECT ?? "mailto:notifications@cubino.local",
        publicKey,
        privateKey
      );
      vapidConfigured = true;
    }
    webPushModule = mod;
    return mod;
  } catch {
    webPushModule = null;
    return null;
  }
}

/** Send a Web Push notification to all of a user's registered subscriptions. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const webPush = await getWebPush();
  if (!webPush) return;

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  if (subs.length === 0) return;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/app",
  });

  for (const sub of subs) {
    try {
      await webPush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        body
      );
    } catch (err: unknown) {
      const statusCode =
        err && typeof err === "object" && "statusCode" in err
          ? (err as { statusCode: number }).statusCode
          : 0;
      // Remove expired or invalid subscriptions (404/410).
      if (statusCode === 404 || statusCode === 410) {
        await db
          .delete(pushSubscriptions)
          .where(
            and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, sub.endpoint))
          );
      }
    }
  }
}
