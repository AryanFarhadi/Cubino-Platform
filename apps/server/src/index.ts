import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import { authRoutes } from "./routes/auth.js";
import { denRoutes } from "./routes/dens.js";
import { messageRoutes } from "./routes/messages.js";
import { roleRoutes } from "./routes/roles.js";
import { dmRoutes } from "./routes/dms.js";
import { userRoutes } from "./routes/users.js";
import { uploadRoutes } from "./routes/uploads.js";
import { friendRoutes } from "./routes/friends.js";
import { notificationRoutes } from "./routes/notifications.js";
import { moderationRoutes } from "./routes/moderation.js";
import { searchRoutes } from "./routes/search.js";
import { livekitRoutes } from "./routes/livekit.js";
import { oauthRoutes } from "./routes/oauth.js";
import { achievementRoutes } from "./routes/achievements.js";
import { unreadRoutes } from "./routes/unread.js";
import { registerChatHandlers, registerSignalHandlers } from "./ws/handlers.js";
import { setIo } from "./ws/io.js";
import { registerRateLimit } from "./middleware/rate-limit.js";
import { runMigrations } from "./db/run-migrations.js";

const PORT = Number(process.env.PORT ?? 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3000";
const corsOrigins = CORS_ORIGIN.split(",").map((o) => o.trim());

const app = Fastify({ logger: true });

try {
  await runMigrations();
  app.log.info("Database migrations applied");
} catch (err) {
  app.log.error({ err }, "Database migration failed");
  process.exit(1);
}

await app.register(cors, {
  origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
  credentials: true,
});
await app.register(cookie);

app.get("/health", async () => ({ ok: true, service: "cubino-server" }));

await registerRateLimit(app);
await authRoutes(app);
await userRoutes(app);
await denRoutes(app);
await messageRoutes(app);
await roleRoutes(app);
await dmRoutes(app);
await uploadRoutes(app);
await friendRoutes(app);
await notificationRoutes(app);
await moderationRoutes(app);
await searchRoutes(app);
await livekitRoutes(app);
await oauthRoutes(app);
await achievementRoutes(app);
await unreadRoutes(app);

const server = await app.listen({ port: PORT, host: "0.0.0.0" });

const io = new Server(app.server, {
  cors: {
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
    credentials: true,
  },
  path: "/socket.io",
});

try {
  const pub = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const sub = pub.duplicate();
  io.adapter(createAdapter(pub, sub));
} catch (e) {
  app.log.warn("Redis adapter unavailable, using in-memory adapter");
}

setIo(io);
registerChatHandlers(io);
registerSignalHandlers(io);

console.log(`Cubino server listening on ${server}`);
