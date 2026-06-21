import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { channels } from "../db/schema.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { can, Permission } from "../services/permissions.js";

export async function livekitRoutes(app: FastifyInstance) {
  app.post("/api/v1/voice/livekit/token", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const body = z.object({ channelId: z.string().uuid() }).parse(req.body);
    const [ch] = await db.select().from(channels).where(eq(channels.id, body.channelId)).limit(1);
    if (!ch || ch.type !== "VOICE") return reply.status(404).send({ error: "Voice channel not found" });
    if (!(await can(userId, ch.denId, Permission.CONNECT_VOICE))) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL;

    if (!apiKey || !apiSecret || !livekitUrl) {
      return {
        mode: "p2p",
        message: "LiveKit not configured — using P2P mesh. Set LIVEKIT_* env vars for SFU.",
        turnUrls: process.env.TURN_URLS?.split(",") ?? [],
        turnUsername: process.env.TURN_USERNAME ?? null,
        turnCredential: process.env.TURN_CREDENTIAL ?? null,
      };
    }

    const crypto = await import("crypto");
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(
      JSON.stringify({
        iss: apiKey,
        sub: userId,
        iat: now,
        exp: now + 3600,
        video: { roomJoin: true, room: `voice-${body.channelId}`, canPublish: true, canSubscribe: true },
      })
    ).toString("base64url");
    const sig = crypto.createHmac("sha256", apiSecret).update(`${header}.${payload}`).digest("base64url");
    return { mode: "livekit", token: `${header}.${payload}.${sig}`, url: livekitUrl };
  });
}
