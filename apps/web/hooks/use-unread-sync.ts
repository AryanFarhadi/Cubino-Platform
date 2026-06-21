"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getChatSocket } from "@/hooks/use-socket";
import { useAppStore } from "@/stores/app-store";
import { useUnreadStore } from "@/stores/unread-store";
import { isPersonallyMentioned } from "@/lib/mention-utils";
import { areDesktopNotificationsEnabled, playNotificationSound } from "@/lib/notification-prefs";
import { isUserMentioned } from "@/lib/mention-utils";
import { subscribeToPushNotifications } from "@/lib/push-notifications";
import {
  buildAppDeepLink,
  navigateToNotificationTarget,
  parseDeepLinkFromAppUrl,
} from "@/lib/notification-nav";
import { api } from "@/lib/api";
import type { MessageDTO, DmMessageDTO } from "@cubino/shared";

type NotificationLevel = "all" | "mentions" | "none";

export function useUnreadSync() {
  const user = useAppStore((s) => s.user);
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const activeDmId = useAppStore((s) => s.activeDmId);
  const dmOpen = useAppStore((s) => s.dmOpen);
  const setSummary = useUnreadStore((s) => s.setSummary);
  const incrementChannel = useUnreadStore((s) => s.incrementChannel);
  const incrementDm = useUnreadStore((s) => s.incrementDm);
  const qc = useQueryClient();

  useQuery({
    queryKey: ["unread-summary"],
    enabled: !!user,
    queryFn: async () => {
      const res = await api<{
        channels: Record<string, number>;
        dms: Record<string, number>;
        dens: Record<string, number>;
        channelDens: Record<string, string>;
      }>("/api/v1/unread/summary");
      setSummary(res.channels, res.dms, res.dens, res.channelDens);
      return res;
    },
    refetchInterval: 60_000,
  });

  useQuery({
    queryKey: ["notification-settings-all"],
    enabled: !!user,
    queryFn: async () => {
      const res = await api<{ levels: Record<string, NotificationLevel> }>(
        "/api/v1/notification-settings"
      );
      for (const [denId, level] of Object.entries(res.levels)) {
        qc.setQueryData(["den-notification-settings", denId], { level });
      }
      return res;
    },
    staleTime: 60_000,
  });

  useQuery({
    queryKey: ["dm-muted"],
    enabled: !!user,
    queryFn: () => api<{ dmIds: string[] }>("/api/v1/dms/muted"),
    staleTime: 60_000,
  });

  useQuery({
    queryKey: ["role-mention-keys"],
    enabled: !!user,
    queryFn: () => api<{ byDen: Record<string, string[]> }>("/api/v1/users/me/role-mention-keys"),
    staleTime: 120_000,
  });

  useEffect(() => {
    if (!user) return;
    if (!areDesktopNotificationsEnabled()) return;
    void subscribeToPushNotifications().catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const socket = getChatSocket();

    const getDenNotificationLevel = (denId?: string): NotificationLevel => {
      if (!denId) return "all";
      const cached = qc.getQueryData<{ level: NotificationLevel }>([
        "den-notification-settings",
        denId,
      ]);
      if (cached?.level) return cached.level;
      const all = qc.getQueryData<{ levels: Record<string, NotificationLevel> }>([
        "notification-settings-all",
      ]);
      return all?.levels[denId] ?? "all";
    };

    const shouldNotify = () => {
      if (!areDesktopNotificationsEnabled()) return false;
      if (user.status === "dnd" || user.status === "invisible") return false;
      if (typeof Notification === "undefined") return false;
      if (Notification.permission === "granted") return true;
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
      return false;
    };

    const showDesktopNotification = (title: string, body: string, deepLinkUrl: string, denId?: string) => {
      if (denId && getDenNotificationLevel(denId) === "none") return;
      if (!shouldNotify()) return;
      const notification = new Notification(title, { body, icon: "/icon.svg" });
      notification.onclick = () => {
        window.focus();
        notification.close();
        const target = parseDeepLinkFromAppUrl(deepLinkUrl);
        if (!target) {
          window.location.href = deepLinkUrl;
          return;
        }
        const app = useAppStore.getState();
        const unread = useUnreadStore.getState();
        void navigateToNotificationTarget(target, {
          activeDenId: app.activeDenId,
          setActiveDenId: app.setActiveDenId,
          setActiveChannelId: app.setActiveChannelId,
          setActiveDmId: app.setActiveDmId,
          setDmOpen: app.setDmOpen,
          setChannels: app.setChannels,
          clearDm: unread.clearDm,
          clearChannel: unread.clearChannel,
        });
      };
    };

    const onChannelNotify = (payload: {
      channelId: string;
      denId?: string;
      message: MessageDTO;
    }) => {
      const { channelId, denId, message } = payload;
      if (message.authorId === user.id) return;
      if (channelId === activeChannelId && !dmOpen) return;
      incrementChannel(channelId, denId);

      const roleKeys =
        denId
          ? qc.getQueryData<{ byDen: Record<string, string[]> }>(["role-mention-keys"])?.byDen[
              denId
            ] ?? []
          : [];
      const mentioned = isPersonallyMentioned(message.content, user.username, roleKeys);
      if (!mentioned && denId) {
        playNotificationSound("message");
        showDesktopNotification(
          message.author?.displayName ?? "New message",
          message.content.slice(0, 120),
          buildAppDeepLink({
            kind: "channel",
            denId,
            channelId,
            messageId: message.id,
          }),
          denId
        );
      }
    };

    const onDmNotify = (payload: { dmId: string; message: DmMessageDTO }) => {
      const { dmId, message } = payload;
      if (message.authorId === user.id) return;
      if (dmId === activeDmId && dmOpen) return;
      const mutedDms = qc.getQueryData<{ dmIds: string[] }>(["dm-muted"]);
      if (mutedDms?.dmIds.includes(dmId)) return;
      socket.emit("join:dm", { dmId });
      incrementDm(dmId);
      qc.invalidateQueries({ queryKey: ["dms"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      const mentioned = isUserMentioned(message.content, user.username);
      playNotificationSound(mentioned ? "mention" : "dm");
      showDesktopNotification(
        mentioned
          ? `${message.author?.displayName ?? "Someone"} mentioned you`
          : message.author?.displayName ?? "New DM",
        message.content.slice(0, 120),
        buildAppDeepLink({ kind: "dm", dmId, messageId: message.id })
      );
    };

    const onMentionNotify = (payload: {
      channelId?: string;
      denId?: string;
      messageId?: string;
      authorDisplayName?: string;
      preview?: string;
      kind?: "mention" | "everyone";
    }) => {
      if (payload.channelId && payload.denId) {
        incrementChannel(payload.channelId, payload.denId);
      }
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });

      const title =
        payload.kind === "everyone"
          ? payload.authorDisplayName
            ? `${payload.authorDisplayName} mentioned @everyone`
            : "New @everyone mention"
          : payload.authorDisplayName
            ? `${payload.authorDisplayName} mentioned you`
            : "You were mentioned";
      playNotificationSound("mention");
      const mentionUrl =
        payload.channelId && payload.denId
          ? buildAppDeepLink({
              kind: "channel",
              denId: payload.denId,
              channelId: payload.channelId,
              messageId: payload.messageId,
            })
          : "/app";
      showDesktopNotification(title, payload.preview ?? "", mentionUrl, payload.denId);
    };

    const onFriendRequest = (payload: { fromUser?: { displayName?: string; username?: string } }) => {
      qc.invalidateQueries({ queryKey: ["friends"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      playNotificationSound("mention");
      const name = payload.fromUser?.displayName ?? "Someone";
      showDesktopNotification(
        "Friend request",
        `${name} sent you a friend request`,
        "/app?friends=1"
      );
    };

    const onFriendAccepted = (payload: {
      user?: { displayName?: string; username?: string };
    }) => {
      qc.invalidateQueries({ queryKey: ["friends"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      playNotificationSound("mention");
      const name = payload.user?.displayName ?? "Someone";
      showDesktopNotification(
        "Friend request accepted",
        `${name} accepted your friend request`,
        "/app?friends=1"
      );
    };

    const onDmAdded = ({ dmId }: { dmId: string }) => {
      qc.invalidateQueries({ queryKey: ["dms"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      playNotificationSound("dm");
      showDesktopNotification(
        "Added to group chat",
        "You were added to a group conversation",
        buildAppDeepLink({ kind: "dm", dmId })
      );
    };

    socket.on("channel:notify", onChannelNotify);
    socket.on("dm:notify", onDmNotify);
    socket.on("mention:notify", onMentionNotify);
    socket.on("friend:request", onFriendRequest);
    socket.on("friend:accepted", onFriendAccepted);
    socket.on("dm:added", onDmAdded);

    return () => {
      socket.off("channel:notify", onChannelNotify);
      socket.off("dm:notify", onDmNotify);
      socket.off("mention:notify", onMentionNotify);
      socket.off("friend:request", onFriendRequest);
      socket.off("friend:accepted", onFriendAccepted);
      socket.off("dm:added", onDmAdded);
    };
  }, [user, activeChannelId, activeDmId, dmOpen, incrementChannel, incrementDm, qc]);
}
