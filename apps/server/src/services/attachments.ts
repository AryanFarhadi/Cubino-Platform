import { inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { attachments } from "../db/schema.js";

export interface AttachmentInput {
  url: string;
  mime: string;
  size: number;
  filename: string;
}

export interface AttachmentDTO {
  id: string;
  url: string;
  mime: string;
  size: number;
  filename: string;
}

const MAX_ATTACHMENTS = 5;

function toDto(row: typeof attachments.$inferSelect): AttachmentDTO {
  return {
    id: row.id,
    url: row.url,
    mime: row.mime,
    size: row.size,
    filename: row.filename,
  };
}

/** Reject attachment URLs that do not belong to this user's upload namespace. */
export function validateAttachmentInputs(items: AttachmentInput[], userId: string): boolean {
  if (items.length === 0 || items.length > MAX_ATTACHMENTS) return false;
  return items.every((item) => {
    if (!item.url || item.size < 1 || item.size > 25 * 1024 * 1024) return false;
    if (item.url.startsWith(`/uploads/${userId}/`)) return true;
    if (/^https?:\/\/.+\/uploads\//.test(item.url)) return true;
    return false;
  });
}

export async function insertChannelAttachments(
  messageId: string,
  items: AttachmentInput[]
): Promise<AttachmentDTO[]> {
  if (items.length === 0) return [];
  const rows = await db
    .insert(attachments)
    .values(items.map((item) => ({ messageId, ...item })))
    .returning();
  return rows.map(toDto);
}

export async function insertDmAttachments(
  dmMessageId: string,
  items: AttachmentInput[]
): Promise<AttachmentDTO[]> {
  if (items.length === 0) return [];
  const rows = await db
    .insert(attachments)
    .values(items.map((item) => ({ dmMessageId, ...item })))
    .returning();
  return rows.map(toDto);
}

export async function fetchChannelAttachments(
  messageIds: string[]
): Promise<Map<string, AttachmentDTO[]>> {
  const map = new Map<string, AttachmentDTO[]>();
  if (messageIds.length === 0) return map;

  const rows = await db
    .select()
    .from(attachments)
    .where(inArray(attachments.messageId, messageIds));

  for (const row of rows) {
    if (!row.messageId) continue;
    const list = map.get(row.messageId) ?? [];
    list.push(toDto(row));
    map.set(row.messageId, list);
  }
  return map;
}

export async function fetchDmAttachments(
  dmMessageIds: string[]
): Promise<Map<string, AttachmentDTO[]>> {
  const map = new Map<string, AttachmentDTO[]>();
  if (dmMessageIds.length === 0) return map;

  const rows = await db
    .select()
    .from(attachments)
    .where(inArray(attachments.dmMessageId, dmMessageIds));

  for (const row of rows) {
    if (!row.dmMessageId) continue;
    const list = map.get(row.dmMessageId) ?? [];
    list.push(toDto(row));
    map.set(row.dmMessageId, list);
  }
  return map;
}

export { MAX_ATTACHMENTS };
