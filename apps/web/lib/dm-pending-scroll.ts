/** Queues a scroll-to-message when navigating across DM conversations. */
let pending: { dmId: string; messageId: string } | null = null;

export function queueDmMessageScroll(dmId: string, messageId: string) {
  pending = { dmId, messageId };
}

export function takePendingDmMessageScroll(activeDmId: string): string | null {
  if (!pending || pending.dmId !== activeDmId) return null;
  const messageId = pending.messageId;
  pending = null;
  return messageId;
}
