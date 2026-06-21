import type { FastifyInstance, FastifyRequest } from "fastify";
import { createReadStream } from "fs";
import { buffer } from "node:stream/consumers";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { channels, dmParticipants } from "../db/schema.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { can, isChannelMember, Permission } from "../services/permissions.js";
import { presignUpload, uploadKey, isStorageConfigured } from "../services/storage.js";
import {
  assertKeyOwnedByUser,
  localPathForKey,
  localUploadExists,
  saveLocalUpload,
} from "../services/storage-local.js";

const MAX_BYTES = 25 * 1024 * 1024;
const AVATAR_MAX_BYTES = 512 * 1024;

async function readBinaryBody(req: FastifyRequest): Promise<Buffer> {
  const data = await buffer(req.raw);
  if (data.length > MAX_BYTES) {
    throw new Error("File too large");
  }
  return data;
}

export async function uploadRoutes(app: FastifyInstance) {
  app.post("/api/v1/uploads/presign", { preHandler: requireAuth }, async (req, reply) => {
    const { userId } = req as AuthedRequest;
    const body = z
      .object({
        filename: z.string().min(1).max(256),
        mime: z.string().min(1).max(128),
        size: z.number().max(MAX_BYTES),
        channelId: z.string().uuid().optional(),
        dmId: z.string().uuid().optional(),
        denId: z.string().uuid().optional(),
        purpose: z.enum(["message", "den-asset", "avatar"]).default("message"),
      })
      .parse(req.body);

    if (body.purpose === "avatar") {
      if (!body.mime.startsWith("image/")) {
        return reply.status(400).send({ error: "Avatar must be an image" });
      }
      if (body.size > AVATAR_MAX_BYTES) {
        return reply.status(400).send({ error: "Avatar must be 512 KB or smaller" });
      }
    } else if (body.purpose === "den-asset") {
      if (!body.denId) {
        return reply.status(400).send({ error: "denId required for den-asset uploads" });
      }
      if (!(await can(userId, body.denId, Permission.MANAGE_DEN))) {
        return reply.status(403).send({ error: "Forbidden" });
      }
    } else {
      if (!body.channelId && !body.dmId) {
        return reply.status(400).send({ error: "channelId or dmId required" });
      }

      if (body.channelId) {
        const [ch] = await db
          .select()
          .from(channels)
          .where(eq(channels.id, body.channelId))
          .limit(1);
        if (!ch || !(await isChannelMember(userId, body.channelId))) {
          return reply.status(403).send({ error: "Forbidden" });
        }
        if (!(await can(userId, ch.denId, Permission.SEND_MESSAGES))) {
          return reply.status(403).send({ error: "Forbidden" });
        }
      }

      if (body.dmId) {
        const member = await db
          .select()
          .from(dmParticipants)
          .where(and(eq(dmParticipants.dmChannelId, body.dmId), eq(dmParticipants.userId, userId)))
          .limit(1);
        if (member.length === 0) {
          return reply.status(403).send({ error: "Forbidden" });
        }
      }
    }

    if (!isStorageConfigured()) {
      const key = uploadKey(userId, body.filename);
      return {
        uploadUrl: `/api/v1/uploads/local/${key}`,
        publicUrl: `/uploads/${key.split("/").slice(-2).join("/")}`,
        key,
        local: true,
      };
    }

    const key = uploadKey(userId, body.filename);
    const { url, publicUrl } = await presignUpload(key, body.mime);
    return { uploadUrl: url, publicUrl, key };
  });

  app.put(
    "/api/v1/uploads/local/*",
    { preHandler: requireAuth, bodyLimit: MAX_BYTES },
    async (req, reply) => {
      const { userId } = req as AuthedRequest;
      const key = (req.params as { "*": string })["*"];

      try {
        assertKeyOwnedByUser(key, userId);
      } catch {
        return reply.status(403).send({ error: "Forbidden" });
      }

      let data: Buffer;
      try {
        data = await readBinaryBody(req);
      } catch {
        return reply.status(413).send({ error: "File too large" });
      }
      if (data.length === 0) {
        return reply.status(400).send({ error: "Empty upload body" });
      }

      await saveLocalUpload(key, data);
      return { ok: true, key };
    }
  );

  app.get("/uploads/*", async (req, reply) => {
    const suffix = (req.params as { "*": string })["*"];
    const key = `uploads/${suffix}`;
    if (suffix.includes("..")) {
      return reply.status(400).send({ error: "Invalid path" });
    }
    if (!(await localUploadExists(key))) {
      return reply.status(404).send({ error: "Not found" });
    }

    const path = localPathForKey(key);
    const ext = suffix.split(".").pop()?.toLowerCase() ?? "";
    const mime =
      ext === "png"
        ? "image/png"
        : ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : ext === "gif"
            ? "image/gif"
            : ext === "webp"
              ? "image/webp"
              : ext === "pdf"
                ? "application/pdf"
                : "application/octet-stream";

    return reply.type(mime).send(createReadStream(path));
  });
}
