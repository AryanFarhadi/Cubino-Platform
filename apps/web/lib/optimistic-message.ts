import type { DmMessageDTO, MessageDTO, UserPublic, AttachmentDTO } from "@cubino/shared";

export const PENDING_PREFIX = "pending:";

export function isPendingMessage(id: string): boolean {
  return id.startsWith(PENDING_PREFIX);
}

export function createOptimisticChannelMessage(
  channelId: string,
  author: UserPublic,
  content: string,
  attachments?: AttachmentDTO[]
): MessageDTO {
  return {
    id: `${PENDING_PREFIX}${crypto.randomUUID()}`,
    channelId,
    authorId: author.id,
    content,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    author,
    reactions: [],
    attachments,
  };
}

export function createOptimisticDmMessage(
  dmChannelId: string,
  author: UserPublic,
  content: string,
  attachments?: AttachmentDTO[]
): DmMessageDTO {
  return {
    id: `${PENDING_PREFIX}${crypto.randomUUID()}`,
    dmChannelId,
    authorId: author.id,
    content,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    author,
    attachments,
  };
}

function attachmentFingerprint(message: { attachments?: AttachmentDTO[] }): string {
  return (message.attachments ?? []).map((a) => a.filename).join("|");
}

export function toOptimisticAttachments(
  attachments?: Pick<AttachmentDTO, "url" | "mime" | "size" | "filename">[]
): AttachmentDTO[] | undefined {
  if (!attachments?.length) return undefined;
  return attachments.map((item, index) => ({
    id: `${PENDING_PREFIX}attach-${index}`,
    ...item,
  }));
}

export function attachmentInputsFromMessage(
  attachments?: AttachmentDTO[]
): Pick<AttachmentDTO, "url" | "mime" | "size" | "filename">[] | undefined {
  if (!attachments?.length) return undefined;
  return attachments.map(({ url, mime, size, filename }) => ({ url, mime, size, filename }));
}

/** Replace a matching optimistic row or append the server message without duplicates. */
export function mergeIncomingMessage<
  T extends { id: string; authorId: string; content: string; attachments?: AttachmentDTO[] },
>(prev: T[], msg: T, currentUserId?: string): T[] {
  if (prev.some((m) => m.id === msg.id)) return prev;
  if (msg.authorId !== currentUserId) return [...prev, msg];

  const pendingIdx = prev.findIndex(
    (m) =>
      isPendingMessage(m.id) &&
      m.content === msg.content &&
      attachmentFingerprint(m) === attachmentFingerprint(msg)
  );
  if (pendingIdx >= 0) {
    const next = [...prev];
    next[pendingIdx] = msg;
    return next;
  }
  return [...prev, msg];
}

export function preservePendingMessages<T extends { id: string }>(
  serverMessages: T[],
  prev: T[]
): T[] {
  const pending = prev.filter((m) => isPendingMessage(m.id));
  return [...serverMessages, ...pending];
}
