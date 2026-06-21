import type { FastifyInstance } from "fastify";

const buckets = new Map<string, { count: number; resetAt: number }>();

function checkLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count++;
  return true;
}

export async function registerRateLimit(app: FastifyInstance) {
  app.addHook("onRequest", async (req, reply) => {
    const path = req.url.split("?")[0];
    if (path.startsWith("/api/v1/auth/login") || path.startsWith("/api/v1/auth/register")) {
      const ip = req.ip;
      if (!checkLimit(`auth:${ip}`, 20, 60_000)) {
        return reply.status(429).send({ error: "Too many requests" });
      }
    }
    if (path.includes("/messages") && req.method === "POST") {
      const auth = req.headers.authorization?.replace("Bearer ", "") ?? "anon";
      if (!checkLimit(`msg:${auth}`, 30, 10_000)) {
        return reply.status(429).send({ error: "Slow down" });
      }
    }
  });
}
