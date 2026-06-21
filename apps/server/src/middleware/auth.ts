import type { FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { verifyAccess, getBearerToken } from "../lib/auth.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

export type AuthedRequest = FastifyRequest & {
  userId: string;
  username: string;
};

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const token = getBearerToken(req) ?? (req.cookies as { accessToken?: string })?.accessToken;
  if (!token) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
  try {
    const payload = verifyAccess(token);
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);
    if (user.length === 0) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    (req as AuthedRequest).userId = payload.sub;
    (req as AuthedRequest).username = payload.username;
  } catch {
    return reply.status(401).send({ error: "Invalid token" });
  }
}
