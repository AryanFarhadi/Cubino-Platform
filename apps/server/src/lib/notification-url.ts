/** Build a client-side deep link for push notifications and in-app navigation. */
export function buildNotificationPushUrl(metadata?: string | null): string {
  if (!metadata) return "/app";
  try {
    const parsed = JSON.parse(metadata) as {
      dmId?: string;
      denId?: string;
      channelId?: string;
      messageId?: string;
      panel?: string;
    };
    if (parsed.panel === "friends") {
      return "/app?friends=1";
    }
    if (typeof parsed.dmId === "string") {
      const q = new URLSearchParams({ dm: parsed.dmId });
      if (typeof parsed.messageId === "string") q.set("message", parsed.messageId);
      return `/app?${q.toString()}`;
    }
    if (typeof parsed.denId === "string" && typeof parsed.channelId === "string") {
      const q = new URLSearchParams({ den: parsed.denId, channel: parsed.channelId });
      if (typeof parsed.messageId === "string") q.set("message", parsed.messageId);
      return `/app?${q.toString()}`;
    }
  } catch {
    /* ignore malformed metadata */
  }
  return "/app";
}
