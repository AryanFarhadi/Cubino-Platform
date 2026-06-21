import { api } from "@/lib/api";
import { queueDmMessageScroll } from "@/lib/dm-pending-scroll";
import type { ChannelDTO } from "@cubino/shared";

export type NotificationTarget =
  | { kind: "dm"; dmId: string; messageId?: string }
  | { kind: "channel"; denId: string; channelId: string; messageId?: string }
  | { kind: "friends" };

export function parseNotificationMetadata(metadata: string | null): NotificationTarget | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata) as {
      dmId?: string;
      denId?: string;
      channelId?: string;
      messageId?: string;
      panel?: string;
    };
    if (parsed.panel === "friends") {
      return { kind: "friends" };
    }
    if (typeof parsed.dmId === "string") {
      return {
        kind: "dm",
        dmId: parsed.dmId,
        messageId: typeof parsed.messageId === "string" ? parsed.messageId : undefined,
      };
    }
    if (typeof parsed.denId === "string" && typeof parsed.channelId === "string") {
      return {
        kind: "channel",
        denId: parsed.denId,
        channelId: parsed.channelId,
        messageId: typeof parsed.messageId === "string" ? parsed.messageId : undefined,
      };
    }
  } catch {
    /* ignore malformed metadata */
  }
  return null;
}

export function parseDeepLinkSearchParams(params: URLSearchParams): NotificationTarget | null {
  if (params.get("friends") === "1") {
    return { kind: "friends" };
  }

  const message = params.get("message") ?? undefined;
  const dm = params.get("dm");
  if (dm) return { kind: "dm", dmId: dm, messageId: message };

  const den = params.get("den");
  const channel = params.get("channel");
  if (den && channel) {
    return { kind: "channel", denId: den, channelId: channel, messageId: message };
  }
  return null;
}

/** Build a relative /app URL for deep-link navigation. */
export function buildAppDeepLink(target: NotificationTarget): string {
  if (target.kind === "friends") {
    return "/app?friends=1";
  }
  if (target.kind === "dm") {
    const q = new URLSearchParams({ dm: target.dmId });
    if (target.messageId) q.set("message", target.messageId);
    return `/app?${q.toString()}`;
  }
  const q = new URLSearchParams({ den: target.denId, channel: target.channelId });
  if (target.messageId) q.set("message", target.messageId);
  return `/app?${q.toString()}`;
}

export function parseDeepLinkFromAppUrl(url: string): NotificationTarget | null {
  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    if (parsed.pathname !== "/app") return null;
    return parseDeepLinkSearchParams(parsed.searchParams);
  } catch {
    return null;
  }
}

export type NotificationNavDeps = {
  activeDenId: string | null;
  setActiveDenId: (id: string | null) => void;
  setActiveChannelId: (id: string | null) => void;
  setActiveDmId: (id: string | null) => void;
  setDmOpen: (open: boolean) => void;
  setChannels: (channels: ChannelDTO[]) => void;
  clearDm: (dmId: string) => void;
  clearChannel: (channelId: string) => void;
};

const SCROLL_DELAY_MS = 300;

function dispatchScrollToMessage(target: NotificationTarget) {
  if (target.kind !== "dm" && target.kind !== "channel") return;
  if (!target.messageId) return;
  if (target.kind === "dm") {
    queueDmMessageScroll(target.dmId, target.messageId);
    window.dispatchEvent(
      new CustomEvent("cubino:scroll-to-dm-message", {
        detail: { messageId: target.messageId, dmId: target.dmId },
      })
    );
    return;
  }
  window.setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent("cubino:scroll-to-message", {
        detail: { messageId: target.messageId, channelId: target.channelId },
      })
    );
  }, SCROLL_DELAY_MS);
}

export async function navigateToNotificationTarget(
  target: NotificationTarget,
  deps: NotificationNavDeps
): Promise<void> {
  if (target.kind === "friends") {
    deps.setDmOpen(true);
    return;
  }

  if (target.kind === "dm") {
    try {
      const res = await api<{ dms: { id: string }[] }>("/api/v1/dms");
      if (!res.dms.some((d) => d.id === target.dmId)) {
        return;
      }
    } catch {
      return;
    }
    deps.clearDm(target.dmId);
    deps.setActiveDmId(target.dmId);
    api(`/api/v1/dms/${target.dmId}/read`, { method: "POST" }).catch(() => {});
    dispatchScrollToMessage(target);
    return;
  }

  if (target.kind === "channel") {
    try {
      const densRes = await api<{ dens: { id: string }[] }>("/api/v1/dens");
      if (!densRes.dens.some((d) => d.id === target.denId)) {
        return;
      }

      const chRes = await api<{ channels: ChannelDTO[] }>(
        `/api/v1/dens/${target.denId}/channels`
      );
      if (!chRes.channels.some((c) => c.id === target.channelId)) {
        return;
      }

      if (deps.activeDenId !== target.denId) {
        deps.setActiveDenId(target.denId);
      }
      deps.setChannels(chRes.channels);
    } catch {
      return;
    }

    deps.setActiveChannelId(target.channelId);
    deps.clearChannel(target.channelId);
    api(`/api/v1/channels/${target.channelId}/read`, { method: "POST" }).catch(() => {});
    dispatchScrollToMessage(target);
    return;
  }
}
