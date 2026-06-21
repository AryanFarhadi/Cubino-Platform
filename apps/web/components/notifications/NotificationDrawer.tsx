"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { useAppStore } from "@/stores/app-store";
import { useUnreadStore } from "@/stores/unread-store";
import {
  navigateToNotificationTarget,
  parseNotificationMetadata,
} from "@/lib/notification-nav";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  metadata: string | null;
  createdAt: string;
};

export function NotificationPanel({ onClose }: { onClose: () => void }) {
  const setActiveDmId = useAppStore((s) => s.setActiveDmId);
  const setDmOpen = useAppStore((s) => s.setDmOpen);
  const setActiveDenId = useAppStore((s) => s.setActiveDenId);
  const setActiveChannelId = useAppStore((s) => s.setActiveChannelId);
  const setChannels = useAppStore((s) => s.setChannels);
  const activeDenId = useAppStore((s) => s.activeDenId);
  const clearDm = useUnreadStore((s) => s.clearDm);
  const clearChannel = useUnreadStore((s) => s.clearChannel);
  const qc = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["notifications"],
    queryFn: () =>
      api<{ notifications: NotificationItem[] }>("/api/v1/notifications"),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/api/v1/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => {
      refetch();
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => api("/api/v1/notifications/read-all", { method: "POST" }),
    onSuccess: () => {
      refetch();
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });

  const handleNotificationClick = async (notification: NotificationItem) => {
    if (!notification.read) {
      markRead.mutate(notification.id);
    }

    const target =
      parseNotificationMetadata(notification.metadata) ??
      (notification.type === "friend_request" ? { kind: "friends" as const } : null);
    if (!target) return;

    await navigateToNotificationTarget(target, {
      activeDenId,
      setActiveDenId,
      setActiveChannelId,
      setActiveDmId,
      setDmOpen,
      setChannels,
      clearDm,
      clearChannel,
    });
    onClose();
  };

  const notifications = data?.notifications ?? [];
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <Modal onClose={onClose} className="max-w-md" labelledById="notifications-title">
      <div className="p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 id="notifications-title" className="text-lg font-bold text-den-cream">
            Notifications
          </h3>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  className="text-xs font-medium text-den-link hover:underline disabled:opacity-50"
                >
                  Mark all read
                </button>
                <span className="rounded-full bg-den-berry px-2 py-0.5 text-xs font-semibold text-white">
                  {unreadCount} new
                </span>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto">
          {isLoading && (
            <p className="py-8 text-center text-sm text-den-muted">Loading notifications...</p>
          )}
          {isError && (
            <div className="py-8 text-center">
              <p className="text-sm font-medium text-den-cream">Could not load notifications</p>
              <p className="mt-1 text-xs text-den-muted">
                {(error as Error)?.message ?? "Check your connection and try again."}
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-3 text-sm text-den-link hover:underline"
              >
                Try again
              </button>
            </div>
          )}
          {!isLoading && !isError && notifications.length === 0 && (
            <p className="py-8 text-center text-sm text-den-muted">No notifications yet</p>
          )}
          {notifications.map((n) => {
            const target = parseNotificationMetadata(n.metadata);
            const isDm = target?.kind === "dm";
            const isMention =
              (n.type === "mention" || n.type === "everyone") && target?.kind === "channel";
            const isFriendRequest =
              n.type === "friend_request" || target?.kind === "friends";
            const isClickable = isDm || isMention || isFriendRequest;
            return (
              <button
                key={n.id}
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && void handleNotificationClick(n)}
                aria-label={
                  isDm
                    ? `Open direct message: ${n.title}${n.read ? "" : ", unread"}`
                    : isMention
                      ? `View mention from ${n.title}${n.read ? "" : ", unread"}`
                      : isFriendRequest
                        ? `View friend request from ${n.title}${n.read ? "" : ", unread"}`
                        : `${n.title}${n.read ? "" : ", unread"}`
                }
                className={`block w-full rounded-den p-3 text-left transition-colors ${
                  n.read ? "bg-den-elevated/50" : "bg-den-elevated"
                } ${isClickable ? "cursor-pointer hover:bg-den-elevated/90" : "cursor-default"}`}
              >
                <p className="text-sm font-medium text-den-cream">{n.title}</p>
                {n.body && <p className="mt-0.5 text-xs text-den-muted">{n.body}</p>}
                {isDm && (
                  <p className="mt-1 text-[10px] font-medium text-den-link">
                    {n.type === "dm_group_add"
                      ? "Open group chat"
                      : n.type === "dm_mention"
                        ? "Jump to mention"
                        : "Open conversation"}
                  </p>
                )}
                {isMention && (
                  <p className="mt-1 text-[10px] font-medium text-den-link">Jump to message</p>
                )}
                {isFriendRequest && (
                  <p className="mt-1 text-[10px] font-medium text-den-link">View friend requests</p>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-den py-2 text-sm text-den-muted hover:text-den-cream"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}

/** @deprecated use NotificationPanel from UserBar */
export function NotificationDrawer() {
  return null;
}
