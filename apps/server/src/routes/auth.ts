import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, refreshTokens } from "../db/schema.js";
import {
  signAccess,
  signRefresh,
  verifyRefresh,
  hashToken,
  toUserPublic,
} from "../lib/auth.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8),
  displayName: z.string().min(1).max(64).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

function setAuthCookies(reply: FastifyReply, access: string, refresh: string) {
  reply.setCookie("accessToken", access, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60,
  });
  reply.setCookie("refreshToken", refresh, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
}

async function issueTokens(user: { id: string; username: string }) {
  const payload = { sub: user.id, username: user.username };
  const access = signAccess(payload);
  const refresh = signRefresh(payload);
  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: hashToken(refresh),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  return { access, refresh };
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/v1/auth/register", async (req, reply) => {
    const body = registerSchema.parse(req.body);
    const hash = await argon2.hash(body.password);
    try {
      const [user] = await db
        .insert(users)
        .values({
          email: body.email,
          username: body.username,
          passwordHash: hash,
          displayName: body.displayName ?? body.username,
        })
        .returning();
      const tokens = await issueTokens(user);
      setAuthCookies(reply, tokens.access, tokens.refresh);
      return { accessToken: tokens.access, user: toUserPublic(user) };
    } catch {
      return reply.status(409).send({ error: "Email or username taken" });
    }
  });

  app.post("/api/v1/auth/login", async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const found = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    if (found.length === 0) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }
    const user = found[0];
    const ok = await argon2.verify(user.passwordHash, body.password);
    if (!ok) return reply.status(401).send({ error: "Invalid credentials" });
    const tokens = await issueTokens(user);
    setAuthCookies(reply, tokens.access, tokens.refresh);
    return { accessToken: tokens.access, user: toUserPublic(user) };
  });

  app.post("/api/v1/auth/refresh", async (req, reply) => {
    const token =
      (req.cookies as { refreshToken?: string }).refreshToken ??
      (req.body as { refreshToken?: string })?.refreshToken;
    if (!token) return reply.status(401).send({ error: "No refresh token" });
    try {
      const payload = verifyRefresh(token);
      const stored = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, hashToken(token)))
        .limit(1);
      if (stored.length === 0 || stored[0].revokedAt) {
        return reply.status(401).send({ error: "Invalid refresh token" });
      }
      const user = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
      if (user.length === 0) return reply.status(401).send({ error: "User not found" });
      const tokens = await issueTokens(user[0]);
      setAuthCookies(reply, tokens.access, tokens.refresh);
      return { accessToken: tokens.access };
    } catch {
      return reply.status(401).send({ error: "Invalid refresh token" });
    }
  });

  app.post("/api/v1/auth/logout", async (req, reply) => {
    const token = (req.cookies as { refreshToken?: string }).refreshToken;
    if (token) {
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.tokenHash, hashToken(token)));
    }
    reply.clearCookie("accessToken", { path: "/" });
    reply.clearCookie("refreshToken", { path: "/" });
    return { ok: true };
  });

  app.get(
    "/api/v1/auth/me",
    { preHandler: requireAuth },
    async (req) => {
      const { userId } = req as AuthedRequest;
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      return { user: toUserPublic(user) };
    }
  );
}
