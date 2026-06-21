"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { useVoiceStore } from "@/stores/voice-store";
import { useUnreadStore } from "@/stores/unread-store";
import type { CategoryDTO, ChannelDTO } from "@cubino/shared";
import { useVoice } from "@/hooks/use-voice";
import {
  useCanManageChannels,
  useCanManageRoles,
  useCanManageDen,
  useCanManageMessages,
  useHasDenPermission,
} from "@/hooks/use-den-permissions";
import { Permission } from "@cubino/shared";
import { DenModerationModal } from "@/components/den/DenModerationModal";
import { InviteModal } from "@/components/den/InviteModal";
import { DenSettingsModal } from "@/components/den/DenSettingsModal";
import { CreateChannelModal } from "@/components/den/CreateChannelModal";
import { CategoryManageModal } from "@/components/den/CategoryManageModal";
import { RoleEditorModal } from "@/components/den/RoleEditorModal";
import { memberDisplayName } from "@/lib/member-utils";
import { resolveDenAssetUrl } from "@/lib/den-assets";
import { EditChannelSettingsModal } from "@/components/chat/EditChannelSettingsModal";
import { Avatar, Button } from "@/components/ui/primitives";
import { LionLoader } from "@/components/ui/lion";
import { IconHash, IconVolume, IconPlus, IconLink, IconTrash, IconMicOff, IconBellOff } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";

export function ChannelSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const dens = useAppStore((s) => s.dens);
  const activeDenId = useAppStore((s) => s.activeDenId);
  const activeDen = dens.find((d) => d.id === activeDenId);
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const setActiveChannelId = useAppStore((s) => s.setActiveChannelId);
  const setChannels = useAppStore((s) => s.setChannels);
  const user = useAppStore((s) => s.user);
  const { joinVoice, leaveVoice } = useVoice();
  const connectedChannelId = useVoiceStore((s) => s.connectedChannelId);
  const peers = useVoiceStore((s) => s.peers);
  const channelUnread = useUnreadStore((s) => s.channelUnread);
  const clearChannel = useUnreadStore((s) => s.clearChannel);
  const registerChannelDenMap = useUnreadStore((s) => s.registerChannelDenMap);
  const [showInvite, setShowInvite] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showRoles, setShowRoles] = useState(false);
  const [showModeration, setShowModeration] = useState(false);
  const clearChannel = useUnreadStore((s) => s.clearChannel);
  const [channelMenu, setChannelMenu] = useState<ChannelDTO | null>(null);
  const [channelSettings, setChannelSettings] = useState<ChannelDTO | null>(null);
  const [categoryMenu, setCategoryMenu] = useState<CategoryDTO | null>(null);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [categoryEdit, setCategoryEdit] = useState<CategoryDTO | null>(null);
  const [dragChannelId, setDragChannelId] = useState<string | null>(null);
  const [dragOverChannelId, setDragOverChannelId] = useState<string | null>(null);
  const [dragCategoryId, setDragCategoryId] = useState<string | null>(null);
  const [dragOverCategoryKey, setDragOverCategoryKey] = useState<string | null>(null);
  const qc = useQueryClient();

  const categoryDropKey = (categoryId: string | null) => categoryId ?? "__uncategorized__";

  const clearDragState = () => {
    setDragChannelId(null);
    setDragOverChannelId(null);
    setDragCategoryId(null);
    setDragOverCategoryKey(null);
  };

  useEffect(() => {
    const openModeration = () => setShowModeration(true);
    window.addEventListener("cubino:open-moderation", openModeration);
    return () => window.removeEventListener("cubino:open-moderation", openModeration);
  }, []);

  const canManageDen = useCanManageDen(activeDenId);
  const canManageChannels = useCanManageChannels(activeDenId);
  const canManageRoles = useCanManageRoles(activeDenId);
  const canBan = useHasDenPermission(activeDenId, Permission.BAN_MEMBERS);
  const canManageMessages = useCanManageMessages(activeDenId);
  const showModerationButton = canBan || canManageMessages || canManageDen;

  const { data: openReportCountData } = useQuery({
    queryKey: ["den-reports-count", activeDenId],
    enabled: !!activeDenId && canManageMessages,
    queryFn: () => api<{ count: number }>(`/api/v1/dens/${activeDenId}/reports/count`),
    refetchInterval: 120_000,
  });

  const openReportCount = openReportCountData?.count ?? 0;

  const reorderChannel = useMutation({
    mutationFn: async ({ channel, swapWith }: { channel: ChannelDTO; swapWith: ChannelDTO }) => {
      await Promise.all([
        api(`/api/v1/channels/${channel.id}`, {
          method: "PATCH",
          body: JSON.stringify({ position: swapWith.position }),
        }),
        api(`/api/v1/channels/${swapWith.id}`, {
          method: "PATCH",
          body: JSON.stringify({ position: channel.position }),
        }),
      ]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channels", activeDenId] });
    },
  });

  const reorderCategory = useMutation({
    mutationFn: async ({ category, swapWith }: { category: CategoryDTO; swapWith: CategoryDTO }) => {
      await Promise.all([
        api(`/api/v1/categories/${category.id}`, {
          method: "PATCH",
          body: JSON.stringify({ position: swapWith.position }),
        }),
        api(`/api/v1/categories/${swapWith.id}`, {
          method: "PATCH",
          body: JSON.stringify({ position: category.position }),
        }),
      ]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channels", activeDenId] });
    },
  });

  const moveChannelToCategory = useMutation({
    mutationFn: ({ channelId, categoryId }: { channelId: string; categoryId: string | null }) =>
      api(`/api/v1/channels/${channelId}`, {
        method: "PATCH",
        body: JSON.stringify({ categoryId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channels", activeDenId] });
    },
  });

  const { data: membersData } = useQuery({
    queryKey: ["members", activeDenId],
    enabled: !!activeDenId,
    queryFn: () =>
      api<{ members: { id: string; displayName: string; nickname?: string | null }[] }>(
        `/api/v1/dens/${activeDenId}/members`
      ),
  });

  const { data: denDetails } = useQuery({
    queryKey: ["den-details", activeDenId],
    enabled: !!activeDenId,
    queryFn: () =>
      api<{ den: { bannerUrl?: string | null } }>(`/api/v1/dens/${activeDenId}`),
  });

  const { data: notificationSettings } = useQuery({
    queryKey: ["den-notification-settings", activeDenId],
    enabled: !!activeDenId,
    queryFn: () =>
      api<{ level: "all" | "mentions" | "none" }>(
        `/api/v1/dens/${activeDenId}/notification-settings`
      ),
  });

  const { data: mutedChannelsData } = useQuery({
    queryKey: ["muted-channels", activeDenId],
    enabled: !!activeDenId,
    queryFn: () =>
      api<{ channelIds: string[] }>(`/api/v1/dens/${activeDenId}/muted-channels`),
  });

  const mutedChannelIds = new Set(mutedChannelsData?.channelIds ?? []);

  const { data: channelMenuMuteData } = useQuery({
    queryKey: ["channel-mute", channelMenu?.id],
    enabled: !!channelMenu?.id && channelMenu.type === "TEXT",
    queryFn: () => api<{ muted: boolean }>(`/api/v1/channels/${channelMenu!.id}/mute`),
  });

  const toggleChannelMute = useMutation({
    mutationFn: ({ channelId, muted }: { channelId: string; muted: boolean }) =>
      api<{ muted: boolean }>(`/api/v1/channels/${channelId}/mute`, {
        method: "PUT",
        body: JSON.stringify({ muted }),
      }),
    onSuccess: (res, { channelId }) => {
      qc.setQueryData(["channel-mute", channelId], res);
      qc.invalidateQueries({ queryKey: ["muted-channels", activeDenId] });
      qc.invalidateQueries({ queryKey: ["unread-summary"] });
      if (res.muted) clearChannel(channelId);
    },
  });

  const {
    data,
    isLoading: isChannelsLoading,
    isError: isChannelsError,
    error: channelsError,
    refetch: refetchChannels,
  } = useQuery({
    queryKey: ["channels", activeDenId],
    enabled: !!activeDenId,
    queryFn: async () => {
      const res = await api<{ categories: CategoryDTO[]; channels: ChannelDTO[] }>(
        `/api/v1/dens/${activeDenId}/channels`
      );
      setChannels(res.channels);
      registerChannelDenMap(res.channels.map((c) => ({ id: c.id, denId: c.denId })));
      if (!activeChannelId && res.channels.length > 0) {
        const text = res.channels.find((c) => c.type === "TEXT");
        if (text) setActiveChannelId(text.id);
      }
      return res;
    },
  });

  const deleteChannel = useMutation({
    mutationFn: (channelId: string) =>
      api(`/api/v1/channels/${channelId}`, { method: "DELETE" }),
    onSuccess: (_data, channelId) => {
      if (activeChannelId === channelId) setActiveChannelId(null);
      if (connectedChannelId === channelId) leaveVoice();
      setChannelMenu(null);
      qc.invalidateQueries({ queryKey: ["channels", activeDenId] });
    },
  });

  const deleteCategory = useMutation({
    mutationFn: (categoryId: string) =>
      api(`/api/v1/categories/${categoryId}`, { method: "DELETE" }),
    onSuccess: () => {
      setCategoryMenu(null);
      qc.invalidateQueries({ queryKey: ["channels", activeDenId] });
    },
  });

  const memberName = (userId: string) => {
    const m = membersData?.members.find((member) => member.id === userId);
    if (!m) return "User";
    return memberDisplayName(m);
  };

  if (!activeDenId) {
    return (
      <aside className="flex h-full w-full flex-col bg-den-surface p-4 text-sm text-den-muted">
        Select or create a Den to join the pride.
      </aside>
    );
  }

  const channels = data?.channels ?? [];
  const categories = data?.categories ?? [];
  const showEmptyChannels =
    !isChannelsLoading && !isChannelsError && channels.length === 0;

  const byCategory = new Map<string | null, ChannelDTO[]>();
  for (const ch of channels) {
    const key = ch.categoryId;
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(ch);
  }

  const channelMenuReorder =
    channelMenu && canManageChannels
      ? (() => {
          const siblings = [...(byCategory.get(channelMenu.categoryId) ?? [])].sort(
            (a, b) => a.position - b.position
          );
          const idx = siblings.findIndex((c) => c.id === channelMenu.id);
          return {
            swapUp: idx > 0 ? siblings[idx - 1] : null,
            swapDown: idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null,
          };
        })()
      : null;

  const categoryMenuReorder =
    categoryMenu && canManageChannels
      ? (() => {
          const siblings = [...categories].sort((a, b) => a.position - b.position);
          const idx = siblings.findIndex((c) => c.id === categoryMenu.id);
          return {
            swapUp: idx > 0 ? siblings[idx - 1] : null,
            swapDown: idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null,
          };
        })()
      : null;

  const categorySections =
    categories.length > 0
      ? [
          ...categories,
          ...(byCategory.get(null)?.length
            ? [
                {
                  id: null as string | null,
                  name: "Channels",
                  position: Number.MAX_SAFE_INTEGER,
                  denId: activeDenId ?? "",
                },
              ]
            : []),
        ]
      : [
          {
            id: null as string | null,
            name: "Channels",
            position: 0,
            denId: activeDenId ?? "",
          },
        ];

  const voiceUserIds = connectedChannelId
    ? ([user?.id, ...Object.keys(peers)].filter(Boolean) as string[])
    : [];

  const bannerSrc = resolveDenAssetUrl(denDetails?.den.bannerUrl);
  const notificationLevel = notificationSettings?.level ?? "all";
  const notificationHint =
    notificationLevel === "none"
      ? "Notifications muted for this Den"
      : notificationLevel === "mentions"
        ? "Only @mentions notify you in this Den"
        : null;

  return (
    <>
      <aside className="flex h-full w-full flex-col bg-den-surface">
        {bannerSrc && (
          <div className="relative h-20 shrink-0 overflow-hidden border-b border-black/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bannerSrc} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-den-surface/90 to-transparent" />
          </div>
        )}
        <div className="group flex h-12 shrink-0 items-center justify-between border-b border-black/20 px-4 shadow-sm">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {resolveDenAssetUrl(activeDen?.iconUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolveDenAssetUrl(activeDen?.iconUrl)!}
                alt=""
                className="h-7 w-7 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-den-elevated text-[10px] font-bold text-den-cream"
                aria-hidden="true"
              >
                {(activeDen?.name ?? "DN").slice(0, 2).toUpperCase()}
              </span>
            )}
            {canManageDen ? (
              <button
                onClick={() => setShowSettings(true)}
                className="truncate font-semibold text-den-cream hover:underline"
              >
                {activeDen?.name ?? "Den"}
              </button>
            ) : (
              <span className="truncate font-semibold text-den-cream">{activeDen?.name ?? "Den"}</span>
            )}
            {notificationHint && (
              <span
                title={notificationHint}
                aria-label={notificationHint}
                className="shrink-0 rounded bg-den-elevated px-1.5 py-0.5 text-[10px] font-semibold text-den-muted"
              >
                {notificationLevel === "none" ? "Muted" : "@only"}
              </span>
            )}
          </div>
          <div className="flex gap-1">
            {canManageChannels && (
              <button
                onClick={() => setShowCreateChannel(true)}
                title="Create channel"
                aria-label="Create channel"
                className="rounded p-1.5 text-den-muted hover:bg-den-elevated hover:text-den-cream"
              >
                <IconPlus className="h-4 w-4" />
              </button>
            )}
            {canManageDen && (
            <button
              onClick={() => setShowInvite(true)}
              title="Invite people"
              aria-label="Invite people"
              className="rounded p-1.5 text-den-muted hover:bg-den-elevated hover:text-den-cream"
            >
              <IconLink className="h-4 w-4" />
            </button>
            )}
          </div>
        </div>

        {canManageDen && (
          <button
            onClick={() => setShowInvite(true)}
            className="mx-2 mt-2 flex items-center justify-center gap-2 rounded-den bg-den-honey/10 py-2 text-xs font-semibold text-den-honey hover:bg-den-honey/20"
          >
            <IconLink className="h-3.5 w-3.5" />
            Invite People
          </button>
        )}

        <div
          className="flex-1 space-y-4 overflow-y-auto p-2 pt-3"
          aria-busy={isChannelsLoading}
          aria-live="polite"
        >
          {isChannelsLoading && (
            <div className="flex flex-col items-center justify-center gap-2 px-2 py-8">
              <LionLoader />
              <p className="text-xs text-den-muted">Loading channels...</p>
            </div>
          )}

          {isChannelsError && (
            <div className="flex flex-col items-center gap-2 px-2 py-8 text-center">
              <p className="text-sm font-medium text-den-cream">Could not load channels</p>
              <p className="text-xs text-den-muted">
                {(channelsError as Error)?.message ?? "Check your connection and try again."}
              </p>
              <Button
                variant="ghost"
                className="mt-1 px-3 py-1.5 text-xs"
                onClick={() => refetchChannels()}
              >
                Try again
              </Button>
            </div>
          )}

          {showEmptyChannels && (
            <div className="px-2 py-8 text-center">
              <p className="text-sm text-den-muted">No channels in this Den yet</p>
              {canManageChannels && (
                <button
                  onClick={() => setShowCreateChannel(true)}
                  className="mt-2 text-sm text-den-link hover:underline"
                >
                  Create a channel
                </button>
              )}
            </div>
          )}

          {!isChannelsLoading &&
            !isChannelsError &&
            channels.length > 0 &&
            (categorySections).map((cat) => (
            <div key={cat.id ?? "none"}>
              <div
                className={clsx(
                  "group/cat mb-1 flex items-center rounded-den px-2 py-0.5 transition-colors",
                  canManageChannels &&
                    dragOverCategoryKey === categoryDropKey(cat.id) &&
                    "bg-den-honey/10 ring-1 ring-den-honey",
                  dragCategoryId === cat.id && "opacity-50"
                )}
                draggable={canManageChannels && !!cat.id}
                onDragStart={(e) => {
                  if (!canManageChannels || !cat.id) return;
                  setDragChannelId(null);
                  setDragCategoryId(cat.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", `category:${cat.id}`);
                }}
                onDragOver={(e) => {
                  if (!canManageChannels) return;
                  if (!dragChannelId && !dragCategoryId) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverCategoryKey(categoryDropKey(cat.id));
                  setDragOverChannelId(null);
                }}
                onDragLeave={() => {
                  if (dragOverCategoryKey === categoryDropKey(cat.id)) {
                    setDragOverCategoryKey(null);
                  }
                }}
                onDrop={(e) => {
                  if (!canManageChannels) return;
                  e.preventDefault();
                  e.stopPropagation();

                  if (dragCategoryId && cat.id && dragCategoryId !== cat.id) {
                    const dragged = categories.find((c) => c.id === dragCategoryId);
                    if (dragged) {
                      reorderCategory.mutate({ category: dragged, swapWith: cat });
                    }
                  } else if (dragChannelId) {
                    const dragged = channels.find((c) => c.id === dragChannelId);
                    if (dragged && dragged.categoryId !== cat.id) {
                      moveChannelToCategory.mutate({
                        channelId: dragged.id,
                        categoryId: cat.id,
                      });
                    }
                  }
                  clearDragState();
                }}
                onDragEnd={clearDragState}
              >
                <p className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-den-muted">
                  {cat.name}
                </p>
                {canManageChannels && cat.id && (
                  <button
                    type="button"
                    onClick={() => setCategoryMenu(cat)}
                    title={`${cat.name} options`}
                    aria-label={`Options for ${cat.name} category`}
                    className="rounded p-0.5 text-den-muted opacity-0 transition-opacity hover:bg-den-surface hover:text-den-cream group-hover/cat:opacity-100"
                  >
                    ⋯
                  </button>
                )}
              </div>
              {(byCategory.get(cat.id) ?? [])
                .sort((a, b) => a.position - b.position)
                .map((ch) => {
                const unread = channelUnread[ch.id] ?? 0;
                return (
                <div
                  key={ch.id}
                  className={clsx(
                    "group/ch relative",
                    dragOverChannelId === ch.id && "rounded-den ring-1 ring-den-honey",
                    dragChannelId === ch.id && "opacity-50"
                  )}
                  draggable={canManageChannels}
                  onDragStart={(e) => {
                    if (!canManageChannels) return;
                    setDragCategoryId(null);
                    setDragChannelId(ch.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", ch.id);
                  }}
                  onDragOver={(e) => {
                    if (!canManageChannels || !dragChannelId || dragChannelId === ch.id) return;
                    e.preventDefault();
                    setDragOverChannelId(ch.id);
                    setDragOverCategoryKey(null);
                  }}
                  onDragLeave={() => {
                    if (dragOverChannelId === ch.id) setDragOverChannelId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const draggedId = dragChannelId ?? e.dataTransfer.getData("text/plain");
                    const dragged = channels.find((c) => c.id === draggedId);
                    if (!dragged || dragged.id === ch.id) {
                      clearDragState();
                      return;
                    }
                    if (dragged.categoryId !== ch.categoryId) {
                      moveChannelToCategory.mutate({
                        channelId: dragged.id,
                        categoryId: ch.categoryId,
                      });
                    } else {
                      reorderChannel.mutate({ channel: dragged, swapWith: ch });
                    }
                    clearDragState();
                  }}
                  onDragEnd={clearDragState}
                >
                  <button
                    onClick={() => {
                      if (ch.type === "VOICE") joinVoice(ch.id);
                      else {
                        setActiveChannelId(ch.id);
                        clearChannel(ch.id);
                        onNavigate?.();
                      }
                    }}
                    onContextMenu={(e) => {
                      if (ch.type !== "TEXT") return;
                      e.preventDefault();
                      setChannelMenu(ch);
                    }}
                    className={clsx(
                      "flex w-full items-center gap-1.5 rounded-den px-2 py-[6px] pr-7 text-[15px] text-den-muted transition-colors",
                      "hover:bg-den-elevated hover:text-den-cream",
                      activeChannelId === ch.id && ch.type === "TEXT" && "bg-den-elevated/80 text-den-cream",
                      connectedChannelId === ch.id && ch.type === "VOICE" && "bg-den-forest/20 text-den-cream",
                      unread > 0 && activeChannelId !== ch.id && "font-semibold text-den-cream"
                    )}
                  >
                    <span className="opacity-70">
                      {ch.type === "TEXT" ? <IconHash className="h-4 w-4" /> : <IconVolume className="h-4 w-4" />}
                    </span>
                    <span className="truncate">{ch.name}</span>
                    {mutedChannelIds.has(ch.id) && (
                      <span title="Channel muted" aria-label="Channel muted">
                        <IconBellOff className="h-3 w-3 shrink-0 text-den-muted" />
                      </span>
                    )}
                    {unread > 0 && (
                      <span className="ml-auto shrink-0 rounded-full bg-den-berry px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setChannelMenu(ch);
                    }}
                    title="Channel options"
                    aria-label={`Options for ${ch.name}`}
                    className={`absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-den-muted transition-opacity hover:bg-den-surface hover:text-den-cream ${
                      ch.type === "TEXT" || canManageChannels
                        ? "opacity-0 group-hover/ch:opacity-100"
                        : "hidden"
                    }`}
                  >
                    ⋯
                  </button>
                  {ch.type === "VOICE" && connectedChannelId === ch.id && voiceUserIds.length > 0 && (
                    <div className="ml-6 space-y-0.5 border-l border-white/10 pl-2">
                      {voiceUserIds.map((uid) => (
                        <div key={uid} className="flex items-center gap-2 py-0.5 text-xs text-den-muted">
                          <Avatar
                            name={memberName(uid)}
                            size={20}
                            speaking={
                              uid === user?.id
                                ? useVoiceStore.getState().localSpeaking
                                : peers[uid]?.speaking
                            }
                          />
                          <span className="truncate">
                            {memberName(uid)}
                            {uid === user?.id ? " (you)" : ""}
                          </span>
                          {peers[uid]?.muted && (
                            <IconMicOff className="h-3 w-3 shrink-0 text-den-berry" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
              })}
            </div>
          ))}
        </div>

        {canManageChannels && (
          <button
            onClick={() => setShowCreateCategory(true)}
            className="mx-2 mb-1 rounded-den py-2 text-xs text-den-muted hover:bg-den-elevated hover:text-den-cream"
          >
            Create category
          </button>
        )}
        {canManageRoles && (
          <button
            onClick={() => setShowRoles(true)}
            className="mx-2 mb-2 rounded-den py-2 text-xs text-den-muted hover:bg-den-elevated hover:text-den-cream"
          >
            Manage roles
          </button>
        )}
        {showModerationButton && (
          <button
            onClick={() => setShowModeration(true)}
            className="relative mx-2 mb-2 rounded-den py-2 text-xs text-den-muted hover:bg-den-elevated hover:text-den-cream"
          >
            Moderation
            {openReportCount > 0 && (
              <span
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-den-berry px-1 text-[10px] font-bold text-white"
                aria-label={`${openReportCount} open reports`}
              >
                {openReportCount > 99 ? "99+" : openReportCount}
              </span>
            )}
          </button>
        )}
      </aside>

      {channelMenu && (
        <Modal
          onClose={() => setChannelMenu(null)}
          className="max-w-sm"
          ariaLabel={`Options for ${channelMenu.name}`}
        >
          <div className="p-5">
            <h3 className="font-bold text-den-cream">{channelMenu.name}</h3>
            <p className="mt-1 text-sm text-den-muted">
              {channelMenu.type === "TEXT" ? "Text channel" : "Voice channel"}
            </p>
            <div className="mt-4 space-y-2">
              {channelMenu.type === "TEXT" && (
                <Button
                  variant="ghost"
                  className="w-full"
                  disabled={toggleChannelMute.isPending || channelMenuMuteData === undefined}
                  onClick={() => {
                    const nextMuted = !(channelMenuMuteData?.muted ?? false);
                    toggleChannelMute.mutate(
                      { channelId: channelMenu.id, muted: nextMuted },
                      {
                        onSuccess: () => {
                          if (nextMuted) {
                            setChannelMenu(null);
                          }
                        },
                      }
                    );
                  }}
                >
                  {channelMenuMuteData?.muted ? "Unmute channel" : "Mute channel"}
                </Button>
              )}
              {canManageChannels && channelMenuReorder && (channelMenuReorder.swapUp || channelMenuReorder.swapDown) && (
                <div className="flex gap-2">
                  {channelMenuReorder.swapUp && (
                    <Button
                      variant="ghost"
                      className="flex-1 text-xs"
                      disabled={reorderChannel.isPending}
                      onClick={() =>
                        reorderChannel.mutate({
                          channel: channelMenu,
                          swapWith: channelMenuReorder.swapUp!,
                        })
                      }
                    >
                      Move up
                    </Button>
                  )}
                  {channelMenuReorder.swapDown && (
                    <Button
                      variant="ghost"
                      className="flex-1 text-xs"
                      disabled={reorderChannel.isPending}
                      onClick={() =>
                        reorderChannel.mutate({
                          channel: channelMenu,
                          swapWith: channelMenuReorder.swapDown!,
                        })
                      }
                    >
                      Move down
                    </Button>
                  )}
                </div>
              )}
              {canManageChannels && (
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setChannelSettings(channelMenu);
                  setChannelMenu(null);
                }}
              >
                Channel settings
              </Button>
              )}
              {canManageChannels && (
              <Button
                variant="danger"
                className="flex w-full items-center justify-center gap-2"
                onClick={() => {
                  if (confirm(`Delete #${channelMenu.name}? This cannot be undone.`)) {
                    deleteChannel.mutate(channelMenu.id);
                  }
                }}
                disabled={deleteChannel.isPending}
              >
                <IconTrash className="h-4 w-4" />
                Delete channel
              </Button>
              )}
              <button
                onClick={() => setChannelMenu(null)}
                className="w-full rounded-den py-2 text-sm text-den-muted hover:text-den-cream"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {channelSettings && activeDenId && (
        <EditChannelSettingsModal
          channel={channelSettings}
          categories={data?.categories ?? []}
          denId={activeDenId}
          onClose={() => setChannelSettings(null)}
        />
      )}

      {showInvite && activeDenId && activeDen && (
        <InviteModal denId={activeDenId} denName={activeDen.name} onClose={() => setShowInvite(false)} />
      )}
      {showSettings && activeDenId && activeDen && (
        <DenSettingsModal
          denId={activeDenId}
          den={activeDen}
          canManageDen={canManageDen}
          showInviteLink={canManageDen}
          showModerationLink={showModerationButton}
          showRolesLink={canManageRoles}
          onOpenInvite={() => setShowInvite(true)}
          onOpenModeration={() => setShowModeration(true)}
          onOpenRoles={() => setShowRoles(true)}
          onClose={() => {
            setShowSettings(false);
            qc.invalidateQueries({ queryKey: ["channels", activeDenId] });
          }}
        />
      )}
      {showCreateChannel && activeDenId && (
        <CreateChannelModal
          denId={activeDenId}
          categories={data?.categories ?? []}
          onClose={() => {
            setShowCreateChannel(false);
            qc.invalidateQueries({ queryKey: ["channels", activeDenId] });
          }}
        />
      )}
      {showRoles && activeDenId && (
        <RoleEditorModal denId={activeDenId} onClose={() => setShowRoles(false)} />
      )}
      {showModeration && activeDenId && (
        <DenModerationModal
          denId={activeDenId}
          onClose={() => {
            setShowModeration(false);
            qc.invalidateQueries({ queryKey: ["den-reports-count", activeDenId] });
          }}
        />
      )}

      {categoryMenu && (
        <Modal
          onClose={() => setCategoryMenu(null)}
          className="max-w-sm"
          ariaLabel={`Options for ${categoryMenu.name} category`}
        >
          <div className="p-5">
            <h3 className="font-bold text-den-cream">{categoryMenu.name}</h3>
            <p className="mt-1 text-sm text-den-muted">Category</p>
            <div className="mt-4 space-y-2">
              {categoryMenuReorder &&
                (categoryMenuReorder.swapUp || categoryMenuReorder.swapDown) && (
                  <div className="flex gap-2">
                    {categoryMenuReorder.swapUp && (
                      <Button
                        variant="ghost"
                        className="flex-1 text-xs"
                        disabled={reorderCategory.isPending}
                        onClick={() =>
                          reorderCategory.mutate({
                            category: categoryMenu,
                            swapWith: categoryMenuReorder.swapUp!,
                          })
                        }
                      >
                        Move up
                      </Button>
                    )}
                    {categoryMenuReorder.swapDown && (
                      <Button
                        variant="ghost"
                        className="flex-1 text-xs"
                        disabled={reorderCategory.isPending}
                        onClick={() =>
                          reorderCategory.mutate({
                            category: categoryMenu,
                            swapWith: categoryMenuReorder.swapDown!,
                          })
                        }
                      >
                        Move down
                      </Button>
                    )}
                  </div>
                )}
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setCategoryEdit(categoryMenu);
                  setCategoryMenu(null);
                }}
              >
                Rename category
              </Button>
              <Button
                variant="danger"
                className="flex w-full items-center justify-center gap-2"
                disabled={deleteCategory.isPending}
                onClick={() => {
                  if (
                    confirm(
                      `Delete "${categoryMenu.name}"? Channels in this category will become uncategorized.`
                    )
                  ) {
                    deleteCategory.mutate(categoryMenu.id);
                  }
                }}
              >
                <IconTrash className="h-4 w-4" />
                Delete category
              </Button>
              <button
                type="button"
                onClick={() => setCategoryMenu(null)}
                className="w-full rounded-den py-2 text-sm text-den-muted hover:text-den-cream"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showCreateCategory && activeDenId && (
        <CategoryManageModal
          denId={activeDenId}
          onClose={() => setShowCreateCategory(false)}
        />
      )}

      {categoryEdit && activeDenId && (
        <CategoryManageModal
          denId={activeDenId}
          category={categoryEdit}
          onClose={() => setCategoryEdit(null)}
        />
      )}
    </>
  );
}
