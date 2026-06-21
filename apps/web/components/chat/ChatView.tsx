"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { getChatSocket } from "@/hooks/use-socket";
import { usePendingSendTimeouts, useReconnectCallback } from "@/hooks/use-pending-send";
import { useAppStore } from "@/stores/app-store";
import { useUnreadStore } from "@/stores/unread-store";
import { Avatar, Button } from "@/components/ui/primitives";
import { LionLogo, LionLoader } from "@/components/ui/lion";
import { ChannelHeader } from "@/components/chat/ChannelHeader";
import { ChatMessageInput } from "@/components/chat/ChatMessageInput";
import { MessageAttachments } from "@/components/chat/MessageAttachments";
import { MessageContent, formatMessageContent } from "@/components/chat/MessageContent";
import type { MessageAttachmentInput } from "@/lib/upload-file";
import {
  createOptimisticChannelMessage,
  isPendingMessage,
  mergeIncomingMessage,
  preservePendingMessages,
  toOptimisticAttachments,
  attachmentInputsFromMessage,
} from "@/lib/optimistic-message";
import { QUICK_EMOJIS } from "@/lib/emoji-data";
import { useCanManageMessages, useCanMentionEveryone } from "@/hooks/use-den-permissions";
import type { MessageDTO, MemberDTO, RoleDTO } from "@cubino/shared";
import { memberDisplayName } from "@/lib/member-utils";
import { roleMentionKey, type RoleHighlight } from "@/lib/mention-utils";

function formatTypingLabel(userIds: string[], nameFor: (id: string) => string | undefined): string {
  const names = userIds.map(nameFor).filter((name): name is string => Boolean(name));
  if (names.length === 0 && userIds.length > 0) return "Someone is typing...";
  if (names.length === 1) return `${names[0]} is typing...`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
  if (names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]} are typing...`;
  return "Several people are typing...";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function ChatView() {
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const activeDenId = useAppStore((s) => s.activeDenId);
  const channels = useAppStore((s) => s.channels);
  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const user = useAppStore((s) => s.user);
  const canManageMessages = useCanManageMessages(activeDenId);
  const canMentionEveryone = useCanMentionEveryone(activeDenId);
  const slowModeSeconds = activeChannel?.slowModeSeconds ?? 0;
  const clearChannel = useUnreadStore((s) => s.clearChannel);
  const { trackPending, markConfirmed, isFailed, hasFailed, resetAll } = usePendingSendTimeouts();
  const [slowModeBlockedUntil, setSlowModeBlockedUntil] = useState<number | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const scrollRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef(0);
  const isNearBottomRef = useRef(true);
  const initialLoadRef = useRef(true);

  const { data: membersData } = useQuery({
    queryKey: ["members", activeDenId],
    enabled: !!activeDenId,
    queryFn: () => api<{ members: MemberDTO[] }>(`/api/v1/dens/${activeDenId}/members`),
  });

  const { data: rolesData } = useQuery({
    queryKey: ["roles", activeDenId],
    enabled: !!activeDenId,
    queryFn: () => api<{ roles: RoleDTO[] }>(`/api/v1/dens/${activeDenId}/roles`),
  });

  const memberName = useCallback(
    (userId: string) => {
      const m = membersData?.members.find((member) => member.id === userId);
      return m ? memberDisplayName(m) : undefined;
    },
    [membersData]
  );

  const typingLabel =
    typingUsers.length > 0 ? formatTypingLabel(typingUsers, memberName) : null;

  const mentionMembers =
    membersData?.members.map((m) => ({
      id: m.id,
      username: m.username,
      displayName: memberDisplayName(m),
      nickname: m.nickname,
      kind: "member" as const,
    })) ?? [];

  const mentionRoles =
    rolesData?.roles.map((r) => ({
      id: r.id,
      username: roleMentionKey(r.name),
      displayName: r.name,
      kind: "role" as const,
      color: r.color,
    })) ?? [];

  const roleHighlights: RoleHighlight[] =
    rolesData?.roles.map((r) => ({
      mentionKey: roleMentionKey(r.name),
      name: r.name,
      color: r.color,
    })) ?? [];

  const {
    data,
    fetchPreviousPage,
    hasPreviousPage,
    isFetchingPreviousPage,
    isLoading,
    isError,
    error,
    refetch,
  } = useInfiniteQuery({
      queryKey: ["messages", activeChannelId],
      enabled: !!activeChannelId,
      initialPageParam: undefined as string | undefined,
      queryFn: async ({ pageParam }) => {
        const qs = new URLSearchParams({ limit: "50" });
        if (pageParam) qs.set("before", pageParam);
        const res = await api<{ messages: MessageDTO[] }>(
          `/api/v1/channels/${activeChannelId}/messages?${qs}`
        );
        return res.messages;
      },
      getPreviousPageParam: (firstPage) => firstPage[0]?.id,
      getNextPageParam: () => undefined,
    });

  useEffect(() => {
    setMessages([]);
    resetAll();
    setSlowModeBlockedUntil(null);
  }, [activeChannelId, resetAll]);

  useEffect(() => {
    if (!data) return;
    setMessages((prev) => preservePendingMessages(data.pages.flat(), prev));
  }, [data]);

  useEffect(() => {
    initialLoadRef.current = true;
    isNearBottomRef.current = true;
    setTypingUsers([]);
  }, [activeChannelId]);

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
  }, [messages.length, activeChannelId]);

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
  }, [hasPreviousPage, isFetchingPreviousPage, fetchPreviousPage, activeChannelId]);

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
    const onScrollToMessage = (event: Event) => {
      const detail = (event as CustomEvent<{ messageId: string; channelId: string }>).detail;
      if (!detail?.messageId || detail.channelId !== activeChannelId) return;
      void scrollToMessage(detail.messageId);
    };
    window.addEventListener("cubino:scroll-to-message", onScrollToMessage);
    return () => window.removeEventListener("cubino:scroll-to-message", onScrollToMessage);
  }, [activeChannelId, scrollToMessage]);

  useEffect(() => {
    if (!activeChannelId) return;
    clearChannel(activeChannelId);
    api(`/api/v1/channels/${activeChannelId}/read`, { method: "POST" }).catch(() => {});
    const socket = getChatSocket();
    socket.emit("join:channel", { channelId: activeChannelId });

    const onCreate = (msg: MessageDTO) => {
      if (msg.channelId !== activeChannelId) return;
      setMessages((prev) => {
        if (msg.authorId === user?.id) {
          const pending = prev.find((m) => isPendingMessage(m.id) && m.content === msg.content);
          if (pending) markConfirmed(pending.id);
        }
        return mergeIncomingMessage(prev, msg, user?.id);
      });
    };
    const onUpdate = (partial: { id: string; channelId: string; content: string; editedAt: string }) => {
      if (partial.channelId !== activeChannelId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === partial.id ? { ...m, content: partial.content, editedAt: partial.editedAt } : m
        )
      );
    };
    const onDelete = ({ id, channelId }: { id: string; channelId: string }) => {
      if (channelId !== activeChannelId) return;
      setMessages((prev) => prev.filter((m) => m.id !== id));
    };
    const onTyping = ({ channelId, userIds }: { channelId: string; userIds: string[] }) => {
      if (channelId === activeChannelId) setTypingUsers(userIds.filter((id) => id !== user?.id));
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

    const onMessageError = (payload: {
      channelId: string;
      code: string;
      retryAfterMs?: number;
    }) => {
      if (payload.channelId !== activeChannelId || payload.code !== "SLOW_MODE") return;
      setSlowModeBlockedUntil(Date.now() + (payload.retryAfterMs ?? 0));
      setMessages((prev) => {
        const pending = [...prev]
          .reverse()
          .find((m) => isPendingMessage(m.id) && m.authorId === user?.id);
        if (!pending) return prev;
        markConfirmed(pending.id);
        return prev.filter((m) => m.id !== pending.id);
      });
    };

    socket.on("message:create", onCreate);
    socket.on("message:update", onUpdate);
    socket.on("message:delete", onDelete);
    socket.on("typing:update", onTyping);
    socket.on("reaction:update", onReaction);
    socket.on("message:error", onMessageError);

    return () => {
      socket.emit("leave:channel", { channelId: activeChannelId });
      socket.off("message:create", onCreate);
      socket.off("message:update", onUpdate);
      socket.off("message:delete", onDelete);
      socket.off("typing:update", onTyping);
      socket.off("reaction:update", onReaction);
      socket.off("message:error", onMessageError);
    };
  }, [activeChannelId, user?.id, clearChannel, markConfirmed]);

  const sendMessage = useCallback(
    (content: string, attachmentInputs?: MessageAttachmentInput[]) => {
      if (!activeChannelId || !user) return;
      const formatted = formatMessageContent(content);
      if (!formatted && !attachmentInputs?.length) return;
      const optimistic = createOptimisticChannelMessage(
        activeChannelId,
        user,
        formatted,
        toOptimisticAttachments(attachmentInputs)
      );
      setMessages((prev) => [...prev, optimistic]);
      trackPending(optimistic.id);
      isNearBottomRef.current = true;
      getChatSocket().emit("message:send", {
        channelId: activeChannelId,
        content: formatted,
        attachments: attachmentInputs,
      });
      if (slowModeSeconds > 0 && !canManageMessages) {
        setSlowModeBlockedUntil(Date.now() + slowModeSeconds * 1000);
      }
    },
    [activeChannelId, user, trackPending, slowModeSeconds, canManageMessages]
  );

  const retryMessage = useCallback(
    (msg: MessageDTO) => {
      if (!activeChannelId || !user || !isPendingMessage(msg.id)) return;
      const attachmentInputs = attachmentInputsFromMessage(msg.attachments);
      markConfirmed(msg.id);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      const optimistic = createOptimisticChannelMessage(
        activeChannelId,
        user,
        msg.content,
        msg.attachments
      );
      setMessages((prev) => [...prev, optimistic]);
      trackPending(optimistic.id);
      getChatSocket().emit("message:send", {
        channelId: activeChannelId,
        content: msg.content,
        attachments: attachmentInputs,
      });
    },
    [activeChannelId, user, markConfirmed, trackPending]
  );

  const retryAllFailedOnReconnect = useCallback(() => {
    if (!activeChannelId || !user) return;
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
        createOptimisticChannelMessage(
          activeChannelId,
          user,
          msg.content,
          msg.attachments
        )
      );
      for (let i = 0; i < optimistic.length; i++) {
        const opt = optimistic[i];
        const source = toRetry[i];
        trackPending(opt.id);
        socket.emit("message:send", {
          channelId: activeChannelId,
          content: opt.content,
          attachments: attachmentInputsFromMessage(source.attachments),
        });
      }
      return [...kept, ...optimistic];
    });
  }, [activeChannelId, user, markConfirmed, trackPending, hasFailed]);

  useReconnectCallback(retryAllFailedOnReconnect);

  if (!activeChannelId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-den-muted">
        <LionLogo size={88} />
        <p className="text-lg font-medium text-den-cream">Welcome to the pride</p>
        <p className="text-sm">Pick a channel and send your first message</p>
      </div>
    );
  }

  let lastDate = "";

  const showInitialLoading = isLoading && messages.length === 0;
  const showInitialError = isError && messages.length === 0;
  const showEmptyChannel = !isLoading && !isError && messages.length === 0;

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-den-chat">
      <ChannelHeader />
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
              {(error as Error)?.message ?? "Something went wrong. Check your connection and try again."}
            </p>
            <Button variant="ghost" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        )}

        {!showInitialLoading && !showInitialError && (
          <div className="space-y-1">
            <div ref={topSentinelRef} className="h-1" />
            {isFetchingPreviousPage && (
              <p className="py-2 text-center text-xs text-den-muted animate-pulse">
                Loading older messages...
              </p>
            )}
            {showEmptyChannel && (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <LionLogo size={56} />
                <p className="text-sm font-medium text-den-cream">
                  No messages in #{activeChannel?.name ?? "this channel"} yet
                </p>
                <p className="text-sm text-den-muted">Be the first to say hello!</p>
              </div>
            )}
            {messages.map((msg) => {
              const date = formatDate(msg.createdAt);
              const showDate = date !== lastDate;
              lastDate = date;
              return (
                <div key={msg.id}>
                  {showDate && (
                    <div className="sticky top-0 z-10 my-3 flex justify-center">
                      <span className="rounded-full bg-den-surface px-3 py-1 text-xs font-medium text-den-muted shadow-sm">
                        {date}
                      </span>
                    </div>
                  )}
                  <MessageRow
                msg={msg}
                authorName={memberName(msg.authorId) ?? msg.author?.displayName ?? "Unknown"}
                currentUserId={user?.id}
                canPin={canManageMessages}
                failed={isFailed(msg.id)}
                highlighted={highlightMessageId === msg.id}
                onRetry={() => retryMessage(msg)}
                roleHighlights={roleHighlights}
              />
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {typingLabel && (
        <p className="px-4 text-xs text-den-muted animate-pulse" aria-live="polite">
          {typingLabel}
        </p>
      )}

      <ChatMessageInput
        onSend={sendMessage}
        channelId={activeChannelId}
        mentionMembers={mentionMembers}
        mentionRoles={mentionRoles}
        canMentionEveryone={canMentionEveryone}
        slowModeSeconds={slowModeSeconds}
        slowModeBlockedUntil={slowModeBlockedUntil}
        placeholder={
          activeChannel?.name
            ? `Message #${activeChannel.name} (try @member or /me waves)`
            : "Message #channel (try @member or /me waves)"
        }
      />
    </div>
  );
}

function MessageRow({
  msg,
  authorName,
  currentUserId,
  canPin = false,
  failed = false,
  highlighted = false,
  onRetry,
  roleHighlights = [],
}: {
  msg: MessageDTO;
  authorName: string;
  currentUserId?: string;
  canPin?: boolean;
  failed?: boolean;
  highlighted?: boolean;
  onRetry?: () => void;
  roleHighlights?: RoleHighlight[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(msg.content);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const isOwn = msg.authorId === currentUserId;
  const pending = isPendingMessage(msg.id);

  const saveEdit = () => {
    getChatSocket().emit("message:edit", { messageId: msg.id, content: editValue.trim() });
    setEditing(false);
    setMenuOpen(false);
  };

  const deleteMsg = () => {
    getChatSocket().emit("message:delete", { messageId: msg.id });
    setMenuOpen(false);
  };

  const pinMessage = async () => {
    try {
      await api(`/api/v1/channels/${msg.channelId}/pins`, {
        method: "POST",
        body: JSON.stringify({ messageId: msg.id }),
      });
      window.dispatchEvent(new Event("cubino:pins-changed"));
    } catch {
      /* permission denied or already pinned — silently close */
    }
    setMenuOpen(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      data-message-id={msg.id}
      className={`group relative flex gap-3 rounded-den px-2 py-0.5 hover:bg-[#2e3035]/60${
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
      <Avatar name={authorName} src={msg.author?.avatarUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-den-cream">{authorName}</span>
          <span className="text-xs text-den-muted">
            {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {msg.editedAt && <span className="text-xs text-den-muted">(edited)</span>}
          {failed && (
            <>
              <span className="text-xs text-den-berry">Failed to send</span>
              <button
                type="button"
                onClick={onRetry}
                className="text-xs font-medium text-den-link hover:underline"
              >
                Retry
              </button>
            </>
          )}
          {pending && !failed && <span className="text-xs text-den-muted">Sending...</span>}
        </div>
        {editing && !pending ? (
          <div className="mt-1 flex gap-2">
            <input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="flex-1 rounded bg-den-elevated px-2 py-1 text-sm text-den-cream"
              onKeyDown={(e) => e.key === "Enter" && saveEdit()}
            />
            <button onClick={saveEdit} className="text-xs text-den-link">
              Save
            </button>
            <button onClick={() => setEditing(false)} className="text-xs text-den-muted">
              Cancel
            </button>
          </div>
        ) : (
          <>
            {msg.content ? (
              <MessageContent content={msg.content} roleHighlights={roleHighlights} />
            ) : null}
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
              onClick={() =>
                getChatSocket().emit("reaction:toggle", { messageId: msg.id, emoji: r.emoji })
              }
              className={`rounded-full px-2 py-0.5 text-xs border ${
                r.me ? "border-den-honey bg-den-honey/20" : "border-white/10 bg-den-elevated"
              }`}
            >
              {r.emoji} {r.count}
            </button>
          ))}
          {!pending && (
          <button
            onClick={() => setEmojiOpen(!emojiOpen)}
            className="opacity-0 group-hover:opacity-100 text-xs text-den-muted px-1"
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
                onClick={() => {
                  getChatSocket().emit("reaction:toggle", { messageId: msg.id, emoji: e });
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
                  onClick={() => {
                    setEditing(true);
                    setMenuOpen(false);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-den-cream hover:bg-den-elevated"
                >
                  Edit
                </button>
                <button
                  onClick={deleteMsg}
                  className="block w-full px-3 py-1.5 text-left text-sm text-den-berry hover:bg-den-elevated"
                >
                  Delete
                </button>
              </>
            )}
            {canPin && (
            <button
              onClick={() => void pinMessage()}
              className="block w-full px-3 py-1.5 text-left text-sm text-den-cream hover:bg-den-elevated"
            >
              Pin message
            </button>
            )}
            <button
              onClick={() => {
                api(`/api/v1/messages/${msg.id}/report`, {
                  method: "POST",
                  body: JSON.stringify({ reason: "Reported from context menu" }),
                }).catch(() => {});
                setMenuOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-den-muted hover:bg-den-elevated"
            >
              Report
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}
