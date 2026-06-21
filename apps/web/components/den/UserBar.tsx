"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { usePresenceStore } from "@/stores/presence-store";
import { Avatar } from "@/components/ui/primitives";
import { IconBell } from "@/components/ui/icons";
import { UserSettingsModal } from "@/components/settings/UserSettingsModal";
import { NotificationPanel } from "@/components/notifications/NotificationDrawer";
import { api } from "@/lib/api";
import {
  getSocketStatusClassName,
  getSocketStatusLabel,
  useSocketStatus,
} from "@/hooks/use-socket-status";

export function UserBar() {
  const user = useAppStore((s) => s.user);
  const socketStatus = useSocketStatus(!!user);
  const connectionLabel = getSocketStatusLabel(socketStatus);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const rawStatus = user ? usePresenceStore((s) => s.onlineUsers[user.id] ?? user.status) : "online";
  const presenceStatus =
    rawStatus === "invisible"
      ? "offline"
      : rawStatus === "online" || rawStatus === "idle" || rawStatus === "dnd"
        ? rawStatus
        : "offline";

  const { data: unreadData } = useQuery({
    queryKey: ["notifications-unread-count"],
    enabled: !!user,
    queryFn: () => api<{ count: number }>("/api/v1/notifications/unread-count"),
    refetchInterval: 60_000,
  });

  const unreadNotifCount = unreadData?.count ?? 0;

  if (!user) return null;

  return (
    <>
      <div className="flex items-center gap-1 border-t border-black/30 bg-[#232428] px-2 py-1.5">
        <button onClick={() => setSettingsOpen(true)} className="flex min-w-0 flex-1 items-center gap-2">
          <Avatar
            name={user.displayName}
            src={user.avatarUrl}
            size={32}
            status={presenceStatus}
          />
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-semibold leading-tight text-den-cream">
              {user.displayName}
            </p>
            <p className="truncate text-xs text-den-muted">
              @{user.username}
              {connectionLabel && socketStatus !== "connected" && (
                <>
                  <span aria-hidden="true"> · </span>
                  <span
                    role="status"
                    aria-live="polite"
                    className={getSocketStatusClassName(socketStatus)}
                  >
                    {connectionLabel}
                  </span>
                </>
              )}
            </p>
          </div>
        </button>
        <button
          onClick={() => setNotifOpen(!notifOpen)}
          title={
            unreadNotifCount > 0
              ? `Notifications (${unreadNotifCount} unread)`
              : "Notifications"
          }
          aria-label={
            unreadNotifCount > 0
              ? `Notifications, ${unreadNotifCount} unread`
              : "Notifications"
          }
          className={`relative rounded-den p-2 transition-colors ${
            notifOpen ? "bg-den-elevated text-den-cream" : "text-den-muted hover:bg-den-elevated hover:text-den-cream"
          }`}
        >
          <IconBell />
          {unreadNotifCount > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full bg-den-berry px-1 text-[10px] font-bold leading-none text-white"
              aria-hidden="true"
            >
              {unreadNotifCount > 99 ? "99+" : unreadNotifCount}
            </span>
          )}
        </button>
      </div>
      {settingsOpen && <UserSettingsModal onClose={() => setSettingsOpen(false)} />}
      {notifOpen && <NotificationPanel onClose={() => setNotifOpen(false)} />}
    </>
  );
}
