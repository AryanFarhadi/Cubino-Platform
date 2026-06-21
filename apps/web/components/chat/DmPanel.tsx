"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getChatSocket } from "@/hooks/use-socket";
import { usePendingSendTimeouts, useReconnectCallback } from "@/hooks/use-pending-send";
import { useAppStore } from "@/stores/app-store";
import { useUnreadStore } from "@/stores/unread-store";
import { Avatar, Button, Input } from "@/components/ui/primitives";
import { LionLogo, LionLoader } from "@/components/ui/lion";
import { MessageContent, formatMessageContent } from "@/components/chat/MessageContent";
import { ChatMessageInput } from "@/components/chat/ChatMessageInput";
import { MessageAttachments } from "@/components/chat/MessageAttachments";
import type { MessageAttachmentInput } from "@/lib/upload-file";
import {
  createOptimisticDmMessage,
  isPendingMessage,
  mergeIncomingMessage,
  preservePendingMessages,
  toOptimisticAttachments,
  attachmentInputsFromMessage,
} from "@/lib/optimistic-message";
import { FriendsPanel } from "@/components/social/FriendsPanel";
import { IconBell, IconBellOff, IconPin } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";
import { QUICK_EMOJIS } from "@/lib/emoji-data";
import type { DmMessageDTO, DmChannelDTO } from "@cubino/shared";
import { getDmTitle, getDmAvatarName, getDmAvatarUrl, formatDmTypingLabel } from "@/lib/dm-utils";
import type { MentionCandidate } from "@/lib/mention-utils";
import { notifyDmAccessLost, DM_ACCESS_LOST_EVENT } from "@/lib/dm-access-events";
import { queueDmMessageScroll, takePendingDmMessageScroll } from "@/lib/dm-pending-scroll";

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function DmListAvatar({
  dm,
  userId,
  unread,
  isMuted,
}: {
  dm: DmChannelDTO;
  userId?: string;
  unread: number;
  isMuted: boolean;
}) {
  const name = getDmAvatarName(dm, userId);
  const src = getDmAvatarUrl(dm, userId);
  return (
    <div className="relative shrink-0">
      <Avatar
        name={name}
        src={src}
        size={36}
        unread={isMuted ? 0 : unread}
      />
      {dm.isGroup && (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-den-honey text-[9px] font-bold text-white"
          aria-hidden="true"
        >
          G
        </span>
      )}
    </div>
  );
}

function NewDmModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [username, setUsername] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const setActiveDmId = useAppStore((s) => s.setActiveDmId);
  const qc = useQueryClient();

  const { data: friendsData, isLoading: friendsLoading } = useQuery({
    queryKey: ["friends"],
    queryFn: () =>
      api<{
        friends: { status: string; user: { id: string; displayName: string; username: string } }[];
      }>("/api/v1/friends"),
    enabled: mode === "group",
  });
  const acceptedFriends =
    friendsData?.friends.filter((f) => f.status === "accepted").map((f) => f.user) ?? [];

  const startDm = useMutation({
    mutationFn: () =>
      api<{ dm: { id: string } }>("/api/v1/dms", {
        method: "POST",
        body: JSON.stringify({ username: username.trim().replace(/^@/, "") }),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["dms"] });
      setActiveDmId(data.dm.id);
      onClose();
    },
  });

  const createGroup = useMutation({
    mutationFn: () =>
      api<{ dmChannelId: string }>("/api/v1/dms/group", {
        method: "POST",
        body: JSON.stringify({
          name: groupName.trim() || undefined,
          userIds: [...selectedIds],
        }),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["dms"] });
      setActiveDmId(data.dmChannelId);
      onClose();
    },
  });

  const toggleMember = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 9) next.add(id);
      return next;
    });
  };

  return (
    <Modal onClose={onClose} className="max-w-lg" labelledById="new-dm-title">
      <div className="overflow-hidden">
        <div className="border-b border-black/20 px-4 py-3">
          <h3 id="new-dm-title" className="font-bold text-den-cream">
            Start a conversation
          </h3>
          <p className="text-xs text-den-muted">
            {mode === "direct"
              ? "Enter the exact username of who you want to message"
              : "Select friends to start a group chat (2–10 members including you)"}
          </p>
        </div>

        <div className="flex border-b border-black/20 px-4 pt-2" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "direct"}
            onClick={() => setMode("direct")}
            className={`mr-4 border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
              mode === "direct"
                ? "border-den-honey text-den-cream"
                : "border-transparent text-den-muted hover:text-den-cream"
            }`}
          >
            Direct
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "group"}
            onClick={() => setMode("group")}
            className={`border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
              mode === "group"
                ? "border-den-honey text-den-cream"
                : "border-transparent text-den-muted hover:text-den-cream"
            }`}
          >
            Group
          </button>
        </div>

        <div className="p-4">
          {mode === "direct" ? (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-den-muted" aria-hidden="true">
                @
              </span>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
                className="pl-7"
                autoFocus
                aria-label="Username"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && username.trim()) startDm.mutate();
                }}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group name (optional)"
                aria-label="Group name"
                maxLength={100}
              />
              {friendsLoading && (
                <div className="flex items-center justify-center py-6">
                  <LionLoader />
                </div>
              )}
              {!friendsLoading && acceptedFriends.length === 0 && (
                <p className="text-sm text-den-muted">Add friends first to create a group chat.</p>
              )}
              {!friendsLoading && acceptedFriends.length > 0 && (
                <div
                  className="max-h-48 space-y-1 overflow-y-auto rounded-den border border-white/10 p-2"
                  role="listbox"
                  aria-label="Select group members"
                  aria-multiselectable="true"
                >
                  {acceptedFriends.map((f) => {
                    const selected = selectedIds.has(f.id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => toggleMember(f.id)}
                        className={`flex w-full items-center gap-2 rounded-den px-2 py-1.5 text-left text-sm transition-colors ${
                          selected
                            ? "bg-den-honey/20 text-den-cream"
                            : "text-den-muted hover:bg-den-elevated hover:text-den-cream"
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                            selected ? "border-den-honey bg-den-honey text-white" : "border-white/20"
                          }`}
                          aria-hidden="true"
                        >
                          {selected ? "✓" : ""}
                        </span>
                        <span className="truncate">{f.displayName}</span>
                        <span className="truncate text-xs opacity-70">@{f.username}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedIds.size > 0 && (
                <p className="text-xs text-den-muted">
                  {selectedIds.size} selected · {selectedIds.size + 1} total with you
                </p>
              )}
            </div>
          )}

          {(startDm.isError || createGroup.isError) && (
            <p className="mt-2 text-sm text-den-berry" role="alert">
              {((startDm.error ?? createGroup.error) as Error).message}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-black/20 bg-[#2b2d31] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-den px-4 py-2 text-sm text-den-muted hover:text-den-cream"
          >
            Cancel
          </button>
          {mode === "direct" ? (
            <Button
              onClick={() => startDm.mutate()}
              disabled={!username.trim() || startDm.isPending}
            >
              {startDm.isPending ? "Opening..." : "Start chat"}
            </Button>
          ) : (
            <Button
              onClick={() => createGroup.mutate()}
              disabled={selectedIds.size < 1 || createGroup.isPending}
            >
              {createGroup.isPending ? "Creating..." : "Create group"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function GroupInfoModal({
  dm,
  onClose,
  onLeft,
}: {
  dm: DmChannelDTO;
  onClose: () => void;
  onLeft: () => void;
}) {
  const user = useAppStore((s) => s.user);
  const qc = useQueryClient();
  const [name, setName] = useState(dm.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAddMembers, setShowAddMembers] = useState(false);
  const memberIds = new Set(dm.participants.map((p) => p.id));
  const atCapacity = dm.participants.length >= 10;

  const { data: friendsData } = useQuery({
    queryKey: ["friends"],
    queryFn: () =>
      api<{
        friends: { status: string; user: { id: string; displayName: string; username: string } }[];
      }>("/api/v1/friends"),
    enabled: showAddMembers,
  });
  const addableFriends =
    friendsData?.friends
      .filter((f) => f.status === "accepted" && !memberIds.has(f.user.id))
      .map((f) => f.user) ?? [];

  const rename = useMutation({
    mutationFn: () =>
      api<{ name: string | null }>(`/api/v1/dms/${dm.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim() || null }),
      }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["dms"] });
    },
    onError: (err) => setError((err as Error).message),
  });

  const addMembers = useMutation({
    mutationFn: () =>
      api<{ added: number }>(`/api/v1/dms/${dm.id}/members`, {
        method: "POST",
        body: JSON.stringify({ userIds: [...selectedIds] }),
      }),
    onSuccess: () => {
      setError(null);
      setSelectedIds(new Set());
      setShowAddMembers(false);
      qc.invalidateQueries({ queryKey: ["dms"] });
    },
    onError: (err) => setError((err as Error).message),
  });

  const leave = useMutation({
    mutationFn: () => api(`/api/v1/dms/${dm.id}/leave`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dms"] });
      onLeft();
      onClose();
    },
    onError: (err) => setError((err as Error).message),
  });

  const removeMember = useMutation({
    mutationFn: (memberId: string) =>
      api(`/api/v1/dms/${dm.id}/members/${memberId}`, { method: "DELETE" }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["dms"] });
    },
    onError: (err) => setError((err as Error).message),
  });

  const title = getDmTitle(dm, user?.id);
  const isOwner = !dm.creatorId || dm.creatorId === user?.id;

  return (
    <Modal onClose={onClose} className="max-w-md" labelledById="group-info-title">
      <div className="overflow-hidden">
        <div className="border-b border-black/20 px-4 py-3">
          <h3 id="group-info-title" className="font-bold text-den-cream">
            Group info
          </h3>
          <p className="text-xs text-den-muted">{title}</p>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4">
          <label htmlFor="group-name" className="text-xs font-semibold uppercase text-den-muted">
            Group name
          </label>
          <div className="mt-1 flex gap-2">
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Group name"
              maxLength={100}
              disabled={!isOwner}
              className="min-w-0 flex-1"
            />
            <Button
              onClick={() => rename.mutate()}
              disabled={rename.isPending || !isOwner}
              className="shrink-0 px-3"
            >
              {rename.isPending ? "..." : "Save"}
            </Button>
          </div>
          {!isOwner && (
            <p className="mt-1 text-xs text-den-muted">Only the group owner can rename this chat.</p>
          )}

          <p className="mb-2 mt-4 text-xs font-semibold uppercase text-den-muted">
            Members ({dm.participants.length})
          </p>
          <ul className="space-y-2" aria-label="Group members">
            {dm.participants.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <Avatar name={p.displayName} src={p.avatarUrl} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-den-cream">
                    {p.displayName}
                    {p.id === user?.id ? " (you)" : ""}
                    {p.id === dm.creatorId && (
                      <span className="ml-1 rounded bg-den-honey/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-den-honey">
                        Owner
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-den-muted">@{p.username}</p>
                </div>
                {isOwner && p.id !== user?.id && (
                  <Button
                    variant="ghost"
                    className="shrink-0 px-2 py-1 text-xs text-den-muted hover:text-den-berry"
                    disabled={removeMember.isPending}
                    onClick={() => {
                      if (
                        confirm(
                          `Remove ${p.displayName} from this group? They will no longer see new messages.`
                        )
                      ) {
                        removeMember.mutate(p.id);
                      }
                    }}
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>

          {!atCapacity && isOwner && (
            <div className="mt-4">
              {!showAddMembers ? (
                <Button
                  variant="ghost"
                  className="w-full text-sm"
                  onClick={() => setShowAddMembers(true)}
                >
                  Add members
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-den-muted">Add friends</p>
                  {addableFriends.length === 0 ? (
                    <p className="text-sm text-den-muted">No friends available to add.</p>
                  ) : (
                    <div
                      className="max-h-36 space-y-1 overflow-y-auto rounded-den border border-white/10 p-2"
                      role="listbox"
                      aria-label="Select members to add"
                      aria-multiselectable="true"
                    >
                      {addableFriends.map((f) => {
                        const selected = selectedIds.has(f.id);
                        return (
                          <button
                            key={f.id}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => {
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(f.id)) next.delete(f.id);
                                else if (dm.participants.length + next.size < 10) next.add(f.id);
                                return next;
                              });
                            }}
                            className={`flex w-full items-center gap-2 rounded-den px-2 py-1.5 text-left text-sm transition-colors ${
                              selected
                                ? "bg-den-honey/20 text-den-cream"
                                : "text-den-muted hover:bg-den-elevated hover:text-den-cream"
                            }`}
                          >
                            <span
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                                selected ? "border-den-honey bg-den-honey text-white" : "border-white/20"
                              }`}
                              aria-hidden="true"
                            >
                              {selected ? "✓" : ""}
                            </span>
                            <span className="truncate">{f.displayName}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      onClick={() => addMembers.mutate()}
                      disabled={selectedIds.size < 1 || addMembers.isPending}
                      className="flex-1"
                    >
                      {addMembers.isPending ? "Adding..." : `Add (${selectedIds.size})`}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setShowAddMembers(false);
                        setSelectedIds(new Set());
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="mt-3 text-sm text-den-berry" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-between gap-2 border-t border-black/20 bg-[#2b2d31] px-4 py-3">
          <Button
            variant="danger"
            onClick={() => {
              if (confirm("Leave this group? You will no longer receive messages from it.")) {
                leave.mutate();
              }
            }}
            disabled={leave.isPending}
          >
            {leave.isPending ? "Leaving..." : "Leave group"}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-den px-4 py-2 text-sm text-den-muted hover:text-den-cream"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DmSidebar({ onNewDm }: { onNewDm: () => void }) {
  const user = useAppStore((s) => s.user);
  const activeDmId = useAppStore((s) => s.activeDmId);
  const setActiveDmId = useAppStore((s) => s.setActiveDmId);
  const dmUnread = useUnreadStore((s) => s.dmUnread);
  const clearDm = useUnreadStore((s) => s.clearDm);
  const qc = useQueryClient();
  const [pinError, setPinError] = useState<string | null>(null);
  const [accessNotice, setAccessNotice] = useState<string | null>(null);
  const [conversationFilter, setConversationFilter] = useState("");

  useEffect(() => {
    const onAccessLost = () => {
      setAccessNotice("You no longer have access to that conversation.");
      window.setTimeout(() => setAccessNotice(null), 5000);
    };
    window.addEventListener(DM_ACCESS_LOST_EVENT, onAccessLost);
    return () => window.removeEventListener(DM_ACCESS_LOST_EVENT, onAccessLost);
  }, []);

  const togglePin = useMutation({
    mutationFn: ({ dmId, pinned }: { dmId: string; pinned: boolean }) =>
      api<{ pinned: boolean }>(`/api/v1/dms/${dmId}/pin`, {
        method: "PUT",
        body: JSON.stringify({ pinned }),
      }),
    onSuccess: () => {
      setPinError(null);
      qc.invalidateQueries({ queryKey: ["dms"] });
    },
    onError: (err) => {
      setPinError((err as Error).message || "Could not pin conversation");
      window.setTimeout(() => setPinError(null), 4000);
    },
  });

  const { data: mutedData } = useQuery({
    queryKey: ["dm-muted"],
    queryFn: () => api<{ dmIds: string[] }>("/api/v1/dms/muted"),
  });
  const mutedDmIds = new Set(mutedData?.dmIds ?? []);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["dms"],
    queryFn: () => api<{ dms: DmChannelDTO[] }>("/api/v1/dms"),
  });

  const dms = data?.dms ?? [];
  const sortedDms = [...dms].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const at = a.lastMessage?.createdAt ?? "";
    const bt = b.lastMessage?.createdAt ?? "";
    return bt.localeCompare(at);
  });
  const filteredDms = useMemo(() => {
    const q = conversationFilter.trim().toLowerCase();
    if (!q) return sortedDms;
    return sortedDms.filter((dm) => {
      const title = getDmTitle(dm, user?.id).toLowerCase();
      if (title.includes(q)) return true;
      return dm.participants.some(
        (p) =>
          p.displayName.toLowerCase().includes(q) ||
          (p.username?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [sortedDms, conversationFilter, user?.id]);
  const showEmptyList = !isLoading && !isError && dms.length === 0;
  const showNoFilterMatches =
    !isLoading && !isError && dms.length > 0 && filteredDms.length === 0;

  return (
    <aside className="flex w-full flex-col bg-den-surface md:w-60">
      <div className="flex h-12 items-center justify-between border-b border-black/20 px-4 shadow-sm">
        <span className="font-semibold text-den-cream">Direct Messages</span>
        <button
          onClick={onNewDm}
          title="New DM"
          aria-label="Start new direct message"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-den-elevated text-lg leading-none text-den-muted hover:bg-den-honey hover:text-white"
        >
          +
        </button>
      </div>

      <FriendsPanel />

      {dms.length > 0 && (
        <div className="border-b border-black/20 px-2 py-2">
          <Input
            type="search"
            value={conversationFilter}
            onChange={(e) => setConversationFilter(e.target.value)}
            placeholder="Filter conversations..."
            aria-label="Filter conversations"
            className="h-8 text-xs"
          />
        </div>
      )}

      {pinError && (
        <p className="border-b border-black/20 px-3 py-2 text-xs text-den-berry" role="alert">
          {pinError}
        </p>
      )}
      {accessNotice && (
        <p className="border-b border-black/20 px-3 py-2 text-xs text-den-muted" role="status">
          {accessNotice}
        </p>
      )}

      <div className="flex-1 overflow-y-auto p-2" aria-busy={isLoading} aria-live="polite">
        {isLoading && (
          <div className="flex flex-col items-center justify-center gap-2 px-2 py-8">
            <LionLoader />
            <p className="text-xs text-den-muted">Loading conversations...</p>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-2 px-2 py-8 text-center">
            <p className="text-sm font-medium text-den-cream">Could not load DMs</p>
            <p className="text-xs text-den-muted">
              {(error as Error)?.message ?? "Check your connection and try again."}
            </p>
            <Button variant="ghost" className="mt-1 px-3 py-1.5 text-xs" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        )}

        {showEmptyList && (
          <div className="px-2 py-6 text-center">
            <p className="text-sm text-den-muted">No messages yet</p>
            <button onClick={onNewDm} className="mt-2 text-sm text-den-link hover:underline">
              Send a message
            </button>
          </div>
        )}

        {showNoFilterMatches && (
          <div className="px-2 py-6 text-center">
            <p className="text-sm text-den-muted">No conversations match your filter</p>
          </div>
        )}

        {!isLoading &&
          !isError &&
          filteredDms.map((dm) => {
          const title = getDmTitle(dm, user?.id);
          const active = activeDmId === dm.id;
          const unread = dmUnread[dm.id] ?? 0;
          const isMuted = mutedDmIds.has(dm.id);
          const isPinned = dm.pinned ?? false;
          const subtitle =
            dm.lastMessage?.content ??
            (dm.isGroup
              ? `${dm.participants.length} members`
              : `@${dm.participants.find((p) => p.id !== user?.id)?.username ?? "user"}`);
          return (
            <div
              key={dm.id}
              className={`group/dm relative mb-0.5 rounded-den ${
                active ? "bg-den-elevated" : "hover:bg-den-elevated/60"
              }`}
            >
              <button
              onClick={() => {
                setActiveDmId(dm.id);
                clearDm(dm.id);
                api(`/api/v1/dms/${dm.id}/read`, { method: "POST" }).catch(() => {});
              }}
              className={`flex w-full items-center gap-3 rounded-den px-2 py-2 pr-8 text-left transition-colors ${
                active
                  ? "text-den-cream"
                  : "text-den-muted hover:text-den-cream"
              } ${unread > 0 && !active && !isMuted ? "font-semibold" : ""}`}
            >
              <DmListAvatar
                dm={dm}
                userId={user?.id}
                unread={unread}
                isMuted={isMuted}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-1">
                  <span className="truncate text-sm font-semibold">
                    {isPinned && (
                      <IconPin className="mr-1 inline h-3 w-3 text-den-honey" aria-hidden="true" />
                    )}
                    {title}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {isMuted && (
                      <IconBellOff className="h-3 w-3 text-den-muted" aria-label="Muted" />
                    )}
                    {dm.lastMessage && (
                      <span className="text-[10px] text-den-muted">
                        {formatTime(dm.lastMessage.createdAt)}
                      </span>
                    )}
                  </span>
                </div>
                <p className="truncate text-xs opacity-75">{subtitle}</p>
              </div>
            </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePin.mutate({ dmId: dm.id, pinned: !isPinned });
                }}
                disabled={togglePin.isPending}
                className={`absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 transition-opacity ${
                  isPinned
                    ? "text-den-honey opacity-100"
                    : "text-den-muted opacity-0 group-hover/dm:opacity-100 hover:text-den-cream"
                }`}
                aria-label={isPinned ? "Unpin conversation" : "Pin conversation"}
                title={isPinned ? "Unpin" : "Pin"}
              >
                <IconPin className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function DmChatArea() {
  const activeDmId = useAppStore((s) => s.activeDmId);
  const setActiveDmId = useAppStore((s) => s.setActiveDmId);
  const user = useAppStore((s) => s.user);
  const clearDm = useUnreadStore((s) => s.clearDm);
  const { trackPending, markConfirmed, isFailed, hasFailed, resetAll } = usePendingSendTimeouts();
  const [messages, setMessages] = useState<DmMessageDTO[]>([]);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const scrollRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef(0);
  const isNearBottomRef = useRef(true);
  const initialLoadRef = useRef(true);
  const qc = useQueryClient();

  const { data: dmMuteData } = useQuery({
    queryKey: ["dm-mute", activeDmId],
    enabled: !!activeDmId,
    queryFn: () => api<{ muted: boolean }>(`/api/v1/dms/${activeDmId}/mute`),
  });

  const toggleDmMute = useMutation({
    mutationFn: (muted: boolean) =>
      api<{ muted: boolean }>(`/api/v1/dms/${activeDmId}/mute`, {
        method: "PUT",
        body: JSON.stringify({ muted }),
      }),
    onSuccess: (res) => {
      qc.setQueryData(["dm-mute", activeDmId], res);
      qc.invalidateQueries({ queryKey: ["dm-muted"] });
      qc.invalidateQueries({ queryKey: ["unread-summary"] });
      if (res.muted && activeDmId) clearDm(activeDmId);
    },
  });

  const isDmMuted = dmMuteData?.muted ?? false;

  const { data: dms, isLoading: dmsListLoading } = useQuery({
    queryKey: ["dms"],
    queryFn: () => api<{ dms: DmChannelDTO[] }>("/api/v1/dms"),
  });

  const activeDm = dms?.dms.find((d) => d.id === activeDmId);
  const dmTitle = activeDm ? getDmTitle(activeDm, user?.id) : "Direct Message";
  const dmAvatarName = activeDm ? getDmAvatarName(activeDm, user?.id) : "?";
  const dmAvatarUrl = activeDm ? getDmAvatarUrl(activeDm, user?.id) : null;
  const other = activeDm?.isGroup
    ? undefined
    : activeDm?.participants.find((p) => p.id !== user?.id);

  const dmMentionMembers = useMemo((): MentionCandidate[] => {
    if (!activeDm) return [];
    return activeDm.participants
      .filter((p) => p.id !== user?.id)
      .map((p) => ({
        id: p.id,
        username: p.username,
        displayName: p.displayName,
        kind: "member" as const,
      }));
  }, [activeDm, user?.id]);

  const typingLabel = formatDmTypingLabel(
    typingUserIds,
    activeDm?.participants ?? [],
    user?.id
  );

  const {
    data: dmMessagesData,
    fetchPreviousPage,
    hasPreviousPage,
    isFetchingPreviousPage,
    isLoading: isMessagesLoading,
    isError: isMessagesError,
    error: messagesError,
    refetch: refetchMessages,
  } = useInfiniteQuery({
    queryKey: ["dm-messages", activeDmId],
    enabled: !!activeDmId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams({ limit: "50" });
      if (pageParam) qs.set("before", pageParam);
      const res = await api<{ messages: DmMessageDTO[] }>(
        `/api/v1/dms/${activeDmId}/messages?${qs}`
      );
      return res.messages;
    },
    getPreviousPageParam: (firstPage) => firstPage[0]?.id,
    getNextPageParam: () => undefined,
  });

  useEffect(() => {
    setGroupInfoOpen(false);
  }, [activeDmId]);

  useEffect(() => {
    const socket = getChatSocket();
    const refreshDms = () => qc.invalidateQueries({ queryKey: ["dms"] });
    const onLeft = ({ dmId }: { dmId: string }) => {
      refreshDms();
      if (dmId === activeDmId) {
        notifyDmAccessLost();
        setActiveDmId(null);
      }
    };
    const onAdded = ({ dmId }: { dmId: string }) => {
      refreshDms();
      setActiveDmId(dmId);
    };
    socket.on("dm:updated", refreshDms);
    socket.on("dm:participant:left", refreshDms);
    socket.on("dm:participant:removed", refreshDms);
    socket.on("dm:participants:added", refreshDms);
    socket.on("dm:added", onAdded);
    socket.on("dm:left", onLeft);
    return () => {
      socket.off("dm:updated", refreshDms);
      socket.off("dm:participant:left", refreshDms);
      socket.off("dm:participant:removed", refreshDms);
      socket.off("dm:participants:added", refreshDms);
      socket.off("dm:added", onAdded);
      socket.off("dm:left", onLeft);
    };
  }, [qc, activeDmId, setActiveDmId]);

  useEffect(() => {
    if (!activeDmId || dmsListLoading || !dms) return;
    const stillMember = dms.dms.some((d) => d.id === activeDmId);
    if (!stillMember) {
      notifyDmAccessLost();
      setActiveDmId(null);
    }
  }, [activeDmId, dms, dmsListLoading, setActiveDmId]);

  useEffect(() => {
    if (!isMessagesError || !activeDmId) return;
    const msg = (messagesError as Error)?.message?.toLowerCase() ?? "";
    if (msg.includes("forbidden") || msg.includes("not found")) {
      notifyDmAccessLost();
      setActiveDmId(null);
    }
  }, [isMessagesError, messagesError, activeDmId, setActiveDmId]);

  useEffect(() => {
    setMessages([]);
    resetAll();
    setTypingUserIds([]);
  }, [activeDmId, resetAll]);

  useEffect(() => {
    if (!dmMessagesData) return;
    setMessages((prev) => preservePendingMessages(dmMessagesData.pages.flat(), prev));
  }, [dmMessagesData]);

  useEffect(() => {
    initialLoadRef.current = true;
    isNearBottomRef.current = true;
  }, [activeDmId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (initialLoadRef.current) {
      bottomRef.current?.scrollIntoView();
      initialLoadRef.current = false;
      return;
    }
    if (prevScrollHeightRef.current > 0) {
      el.scrollTop += el.scrollHeight - prevScrollHeightRef.current;
      prevScrollHeightRef.current = 0;
    } else if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, activeDmId]);

  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = topSentinelRef.current;
    if (!root || !sentinel || !hasPreviousPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingPreviousPage && hasPreviousPage) {
          prevScrollHeightRef.current = root.scrollHeight;
          fetchPreviousPage();
        }
      },
      { root, threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasPreviousPage, isFetchingPreviousPage, fetchPreviousPage, activeDmId]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  const scrollToMessage = useCallback(
    async (messageId: string) => {
      const reveal = () => {
        isNearBottomRef.current = false;
        setHighlightMessageId(messageId);
        requestAnimationFrame(() => {
          const node = scrollRef.current?.querySelector(`[data-message-id="${messageId}"]`);
          node?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        window.setTimeout(() => setHighlightMessageId(null), 2500);
      };

      const waitForSync = () =>
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, 50);
        });

      if (messagesRef.current.some((m) => m.id === messageId)) {
        reveal();
        return;
      }

      isNearBottomRef.current = false;
      let attempts = 0;
      while (attempts < 20) {
        const result = await fetchPreviousPage();
        await waitForSync();
        if (messagesRef.current.some((m) => m.id === messageId)) {
          reveal();
          return;
        }
        if (!result.hasPreviousPage) break;
        attempts++;
      }
    },
    [fetchPreviousPage]
  );

  useEffect(() => {
    const onScrollToDmMessage = (event: Event) => {
      const detail = (event as CustomEvent<{ messageId: string; dmId: string }>).detail;
      if (!detail?.messageId || !detail.dmId) return;
      if (detail.dmId !== activeDmId) {
        queueDmMessageScroll(detail.dmId, detail.messageId);
        setActiveDmId(detail.dmId);
        return;
      }
      void scrollToMessage(detail.messageId);
    };
    window.addEventListener("cubino:scroll-to-dm-message", onScrollToDmMessage);
    return () => window.removeEventListener("cubino:scroll-to-dm-message", onScrollToDmMessage);
  }, [activeDmId, scrollToMessage, setActiveDmId]);

  useEffect(() => {
    if (!activeDmId || isMessagesLoading) return;
    const pendingId = takePendingDmMessageScroll(activeDmId);
    if (pendingId) void scrollToMessage(pendingId);
  }, [activeDmId, isMessagesLoading, scrollToMessage]);

  useEffect(() => {
    if (!activeDmId) return;
    clearDm(activeDmId);
    api(`/api/v1/dms/${activeDmId}/read`, { method: "POST" }).catch(() => {});
    const socket = getChatSocket();
    socket.emit("join:dm", { dmId: activeDmId });
    const onDm = (msg: DmMessageDTO) => {
      if (msg.dmChannelId !== activeDmId) return;
      setMessages((prev) => {
        if (msg.authorId === user?.id) {
          const pending = prev.find((m) => isPendingMessage(m.id) && m.content === msg.content);
          if (pending) markConfirmed(pending.id);
        }
        return mergeIncomingMessage(prev, msg, user?.id);
      });
      qc.invalidateQueries({ queryKey: ["dms"] });
    };
    const onTyping = ({ dmId, userIds }: { dmId: string; userIds: string[] }) => {
      if (dmId === activeDmId) {
        setTypingUserIds(userIds.filter((id) => id !== user?.id));
      }
    };
    const onUpdate = (partial: {
      id: string;
      dmChannelId: string;
      content: string;
      editedAt: string;
    }) => {
      if (partial.dmChannelId !== activeDmId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === partial.id
            ? { ...m, content: partial.content, editedAt: partial.editedAt }
            : m
        )
      );
      qc.invalidateQueries({ queryKey: ["dms"] });
    };
    const onDelete = ({ id, dmChannelId }: { id: string; dmChannelId: string }) => {
      if (dmChannelId !== activeDmId) return;
      setMessages((prev) => prev.filter((m) => m.id !== id));
      qc.invalidateQueries({ queryKey: ["dms"] });
    };
    const onReaction = ({
      messageId,
      reactions,
    }: {
      messageId: string;
      reactions: { emoji: string; count: number; userIds: string[] }[];
    }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                reactions: reactions.map((r) => ({
                  ...r,
                  me: r.userIds.includes(user?.id ?? ""),
                })),
              }
            : m
        )
      );
    };
    socket.on("dm:create", onDm);
    socket.on("dm:typing:update", onTyping);
    socket.on("dm:update", onUpdate);
    socket.on("dm:delete", onDelete);
    socket.on("dm:reaction:update", onReaction);
    return () => {
      socket.off("dm:create", onDm);
      socket.off("dm:typing:update", onTyping);
      socket.off("dm:update", onUpdate);
      socket.off("dm:delete", onDelete);
      socket.off("dm:reaction:update", onReaction);
    };
  }, [activeDmId, qc, clearDm, user?.id, markConfirmed]);

  const sendDm = (raw: string, attachmentInputs?: MessageAttachmentInput[]) => {
    if (!activeDmId || !user) return;
    const formatted = formatMessageContent(raw);
    if (!formatted && !attachmentInputs?.length) return;
    const optimistic = createOptimisticDmMessage(
      activeDmId,
      user,
      formatted,
      toOptimisticAttachments(attachmentInputs)
    );
    setMessages((prev) => [...prev, optimistic]);
    trackPending(optimistic.id);
    isNearBottomRef.current = true;
    getChatSocket().emit("dm:send", {
      dmId: activeDmId,
      content: formatted,
      attachments: attachmentInputs,
    });
  };

  const retryDm = (msg: DmMessageDTO) => {
    if (!activeDmId || !user || !isPendingMessage(msg.id)) return;
    const attachmentInputs = attachmentInputsFromMessage(msg.attachments);
    markConfirmed(msg.id);
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    const optimistic = createOptimisticDmMessage(
      activeDmId,
      user,
      msg.content,
      msg.attachments
    );
    setMessages((prev) => [...prev, optimistic]);
    trackPending(optimistic.id);
    getChatSocket().emit("dm:send", {
      dmId: activeDmId,
      content: msg.content,
      attachments: attachmentInputs,
    });
  };

  const retryAllFailedOnReconnect = useCallback(() => {
    if (!activeDmId || !user) return;
    const toRetry = messagesRef.current.filter(
      (m) => isPendingMessage(m.id) && hasFailed(m.id)
    );
    if (toRetry.length === 0) return;

    for (const msg of toRetry) markConfirmed(msg.id);

    const socket = getChatSocket();
    setMessages((prev) => {
      const retryIds = new Set(toRetry.map((m) => m.id));
      const kept = prev.filter((m) => !retryIds.has(m.id));
      const optimistic = toRetry.map((msg) =>
        createOptimisticDmMessage(activeDmId, user, msg.content, msg.attachments)
      );
      for (let i = 0; i < optimistic.length; i++) {
        const opt = optimistic[i];
        const source = toRetry[i];
        trackPending(opt.id);
        socket.emit("dm:send", {
          dmId: activeDmId,
          content: opt.content,
          attachments: attachmentInputsFromMessage(source.attachments),
        });
      }
      return [...kept, ...optimistic];
    });
  }, [activeDmId, user, markConfirmed, trackPending, hasFailed]);

  useReconnectCallback(retryAllFailedOnReconnect);

  if (!activeDmId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-den-chat text-den-muted">
        <LionLogo size={72} />
        <div className="text-center">
          <p className="text-lg font-semibold text-den-cream">Your DMs</p>
          <p className="mt-1 text-sm">Select a conversation or start a new one</p>
        </div>
      </div>
    );
  }

  const showInitialLoading = isMessagesLoading && messages.length === 0;
  const showInitialError = isMessagesError && messages.length === 0;
  const showEmptyThread = !isMessagesLoading && !isMessagesError && messages.length === 0;

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-den-chat">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-black/20 px-2 shadow-sm sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={() => setActiveDmId(null)}
          className="shrink-0 rounded p-2 text-den-muted hover:bg-den-elevated hover:text-den-cream md:hidden"
          aria-label="Back to conversations"
        >
          ←
        </button>
        <Avatar name={dmAvatarName} src={dmAvatarUrl} size={32} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight text-den-cream">{dmTitle}</p>
          <p className="text-xs text-den-muted">
            {activeDm?.isGroup
              ? `${activeDm.participants.length} members`
              : `@${other?.username ?? "user"}`}
          </p>
        </div>
        {activeDm?.isGroup && (
          <button
            type="button"
            onClick={() => setGroupInfoOpen(true)}
            className="shrink-0 rounded p-2 text-den-muted transition-colors hover:bg-den-elevated hover:text-den-cream"
            aria-label="Open group info"
            title="Group info"
          >
            <span className="text-lg leading-none" aria-hidden="true">
              ℹ
            </span>
          </button>
        )}
        {activeDmId && (
          <button
            type="button"
            onClick={() => toggleDmMute.mutate(!isDmMuted)}
            disabled={toggleDmMute.isPending}
            className="shrink-0 rounded p-2 text-den-muted transition-colors hover:bg-den-elevated hover:text-den-cream disabled:opacity-50"
            aria-label={
              isDmMuted ? "Unmute notifications for this conversation" : "Mute notifications for this conversation"
            }
            title={isDmMuted ? "Unmute conversation" : "Mute conversation"}
          >
            {isDmMuted ? <IconBellOff className="h-5 w-5" /> : <IconBell className="h-5 w-5" />}
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3"
        aria-busy={showInitialLoading}
        aria-live="polite"
      >
        {showInitialLoading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
            <LionLoader />
            <p className="text-sm text-den-muted">Loading messages...</p>
          </div>
        )}

        {showInitialError && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center">
            <p className="text-sm font-medium text-den-cream">Could not load messages</p>
            <p className="max-w-sm text-sm text-den-muted">
              {(messagesError as Error)?.message ??
                "Something went wrong. Check your connection and try again."}
            </p>
            <Button variant="ghost" onClick={() => refetchMessages()}>
              Try again
            </Button>
          </div>
        )}

        {!showInitialLoading && !showInitialError && (
          <>
            <div ref={topSentinelRef} className="h-1" />
            {isFetchingPreviousPage && (
              <p className="py-2 text-center text-xs text-den-muted animate-pulse">
                Loading older messages...
              </p>
            )}
            {showEmptyThread && (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <LionLogo size={56} />
                <p className="text-sm font-medium text-den-cream">
                  This is the beginning of your history with{" "}
                  <span className="text-den-honey">{dmTitle}</span>
                </p>
                <p className="text-sm text-den-muted">Say hi to get the conversation started.</p>
              </div>
            )}
            {messages.map((m) => (
              <DmMessageRow
                key={m.id}
                msg={m}
                currentUserId={user?.id}
                failed={isFailed(m.id)}
                highlighted={highlightMessageId === m.id}
                onRetry={() => retryDm(m)}
              />
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {typingLabel && (
        <p className="px-4 text-xs text-den-muted animate-pulse" aria-live="polite">
          {typingLabel}
        </p>
      )}

      <ChatMessageInput
        onSend={sendDm}
        dmId={activeDmId}
        showSendButton
        mentionMembers={dmMentionMembers}
        placeholder={
          activeDm?.isGroup
            ? `Message ${dmTitle}${dmMentionMembers.length > 0 ? " · @ to mention" : ""}`
            : `Message @${other?.username ?? "user"}`
        }
      />
      {groupInfoOpen && activeDm?.isGroup && (
        <GroupInfoModal
          dm={activeDm}
          onClose={() => setGroupInfoOpen(false)}
          onLeft={() => setActiveDmId(null)}
        />
      )}
    </div>
  );
}

function DmMessageRow({
  msg,
  currentUserId,
  failed = false,
  highlighted = false,
  onRetry,
}: {
  msg: DmMessageDTO;
  currentUserId?: string;
  failed?: boolean;
  highlighted?: boolean;
  onRetry?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [editValue, setEditValue] = useState(msg.content);
  const isOwn = msg.authorId === currentUserId;
  const pending = isPendingMessage(msg.id);

  const saveEdit = () => {
    getChatSocket().emit("dm:edit", { messageId: msg.id, content: editValue.trim() });
    setEditing(false);
    setMenuOpen(false);
  };

  const deleteMsg = () => {
    getChatSocket().emit("dm:delete", { messageId: msg.id });
    setMenuOpen(false);
  };

  return (
    <div
      data-message-id={msg.id}
      className={`group relative mb-3 flex gap-3 rounded-den px-1 py-0.5 hover:bg-[#2e3035]/50${
        pending ? " opacity-70" : ""
      }${failed ? " ring-1 ring-den-berry/40" : ""}${
        highlighted ? " ring-2 ring-den-honey/70 bg-den-honey/10" : ""
      }`}
      onContextMenu={(e) => {
        if (pending) return;
        e.preventDefault();
        setMenuOpen(true);
      }}
    >
      <Avatar name={msg.author?.displayName ?? "?"} src={msg.author?.avatarUrl} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-semibold text-den-cream">{msg.author?.displayName}</span>
          <span className="text-[10px] text-den-muted">
            {new Date(msg.createdAt).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {msg.editedAt && <span className="text-[10px] text-den-muted">(edited)</span>}
          {failed && (
            <>
              <span className="text-[10px] text-den-berry">Failed to send</span>
              <button
                type="button"
                onClick={onRetry}
                className="text-[10px] font-medium text-den-link hover:underline"
              >
                Retry
              </button>
            </>
          )}
          {pending && !failed && (
            <span className="text-[10px] text-den-muted">Sending...</span>
          )}
        </div>
        {editing && !pending ? (
          <div className="mt-1 flex gap-2">
            <input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="flex-1 rounded bg-den-elevated px-2 py-1 text-sm text-den-cream"
              onKeyDown={(e) => e.key === "Enter" && saveEdit()}
              aria-label="Edit message"
            />
            <button type="button" onClick={saveEdit} className="text-xs text-den-link">
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs text-den-muted"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            {msg.content ? <MessageContent content={msg.content} /> : null}
            {msg.attachments && msg.attachments.length > 0 && (
              <MessageAttachments attachments={msg.attachments} />
            )}
          </>
        )}
        <div className="mt-1 flex flex-wrap gap-1">
          {!pending &&
            (msg.reactions ?? []).map((r) => (
              <button
                key={r.emoji}
                type="button"
                aria-label={`React with ${r.emoji}, ${r.count} reactions`}
                onClick={() =>
                  getChatSocket().emit("dm:reaction:toggle", { messageId: msg.id, emoji: r.emoji })
                }
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  r.me ? "border-den-honey bg-den-honey/20" : "border-white/10 bg-den-elevated"
                }`}
              >
                {r.emoji} {r.count}
              </button>
            ))}
          {!pending && (
            <button
              type="button"
              onClick={() => setEmojiOpen(!emojiOpen)}
              className="px-1 text-xs text-den-muted opacity-0 group-hover:opacity-100"
            >
              + react
            </button>
          )}
        </div>
        {!pending && emojiOpen && (
          <div className="mt-1 flex gap-1 rounded bg-den-surface p-1 shadow-lg">
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                aria-label={`Add ${e} reaction`}
                onClick={() => {
                  getChatSocket().emit("dm:reaction:toggle", { messageId: msg.id, emoji: e });
                  setEmojiOpen(false);
                }}
                className="rounded p-1 hover:bg-den-elevated"
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
      {menuOpen && !pending && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-2 top-0 z-50 min-w-[140px] rounded bg-den-surface py-1 shadow-lg border border-white/10">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(msg.content);
                setMenuOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-den-cream hover:bg-den-elevated"
            >
              Copy
            </button>
            {isOwn && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(true);
                    setMenuOpen(false);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-den-cream hover:bg-den-elevated"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={deleteMsg}
                  className="block w-full px-3 py-1.5 text-left text-sm text-den-berry hover:bg-den-elevated"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function DmPanel() {
  const [showNew, setShowNew] = useState(false);
  const activeDmId = useAppStore((s) => s.activeDmId);

  return (
    <div className="flex min-w-0 flex-1">
      <div className={`${activeDmId ? "hidden md:flex" : "flex"} min-h-0 min-w-0 shrink-0`}>
        <DmSidebar onNewDm={() => setShowNew(true)} />
      </div>
      <div
        className={`${!activeDmId ? "hidden md:flex" : "flex"} min-h-0 min-w-0 flex-1 flex-col`}
      >
        <DmChatArea />
      </div>
      {showNew && <NewDmModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
