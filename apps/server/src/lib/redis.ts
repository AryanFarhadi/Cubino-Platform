import { Redis } from "ioredis";

export const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

export async function setTyping(channelId: string, userId: string) {
  const key = `typing:${channelId}`;
  await redis.sadd(key, userId);
  await redis.expire(key, 8);
}

export async function clearTyping(channelId: string, userId: string) {
  await redis.srem(`typing:${channelId}`, userId);
}

export async function getTyping(channelId: string): Promise<string[]> {
  return redis.smembers(`typing:${channelId}`);
}

export async function setDmTyping(dmId: string, userId: string) {
  const key = `typing:dm:${dmId}`;
  await redis.sadd(key, userId);
  await redis.expire(key, 8);
}

export async function clearDmTyping(dmId: string, userId: string) {
  await redis.srem(`typing:dm:${dmId}`, userId);
}

export async function getDmTyping(dmId: string): Promise<string[]> {
  return redis.smembers(`typing:dm:${dmId}`);
}

export async function setPresence(
  userId: string,
  data: { status: string; denId?: string; channelId?: string }
) {
  await redis.set(`presence:${userId}`, JSON.stringify(data), "EX", 86400);
}

export async function getPresence(userId: string) {
  const raw = await redis.get(`presence:${userId}`);
  return raw ? JSON.parse(raw) : null;
}
