"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { useUnreadStore } from "@/stores/unread-store";
import { IconHash, IconSearch, IconPin, IconBell, IconBellOff } from "@/components/ui/icons";
import { PinnedMessagesPanel } from "@/components/chat/PinnedMessagesPanel";
import { EditChannelTopicModal } from "@/components/chat/EditChannelTopicModal";
import { useCanManageChannels } from "@/hooks/use-den-permissions";
import { api } from "@/lib/api";

function openSearch() {
  window.dispatchEvent(new Event("cubino:open-search"));
}

export function ChannelHeader() {
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const activeDenId = useAppStore((s) => s.activeDenId);
  const channels = useAppStore((s) => s.channels);
  const channel = channels.find((c) => c.id === activeChannelId);
  const canManageChannels = useCanManageChannels(activeDenId);
  const clearChannel = useUnreadStore((s) => s.clearChannel);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [topicOpen, setTopicOpen] = useState(false);
  const qc = useQueryClient();

  const { data: pinsData } = useQuery({
    queryKey: ["channel-pins", activeChannelId],
    enabled: !!activeChannelId,
    queryFn: () =>
      api<{ pins: { id: string }[] }>(`/api/v1/channels/${activeChannelId}/pins`),
  });

  const { data: muteData } = useQuery({
    queryKey: ["channel-mute", activeChannelId],
    enabled: !!activeChannelId,
    queryFn: () => api<{ muted: boolean }>(`/api/v1/channels/${activeChannelId}/mute`),
  });

  const toggleMute = useMutation({
    mutationFn: (muted: boolean) =>
      api<{ muted: boolean }>(`/api/v1/channels/${activeChannelId}/mute`, {
        method: "PUT",
        body: JSON.stringify({ muted }),
      }),
    onSuccess: (res) => {
      qc.setQueryData(["channel-mute", activeChannelId], res);
      qc.invalidateQueries({ queryKey: ["muted-channels", activeDenId] });
      qc.invalidateQueries({ queryKey: ["unread-summary"] });
      if (res.muted && activeChannelId) {
        clearChannel(activeChannelId);
      }
    },
  });

  const pinCount = pinsData?.pins.length ?? 0;
  const isMuted = muteData?.muted ?? false;

  useEffect(() => {
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ["channel-pins", activeChannelId] });
    };
    const onOpenPins = () => setPinsOpen(true);
    window.addEventListener("cubino:pins-changed", refresh);
    window.addEventListener("cubino:open-pins", onOpenPins);
    return () => {
      window.removeEventListener("cubino:pins-changed", refresh);
      window.removeEventListener("cubino:open-pins", onOpenPins);
    };
  }, [activeChannelId, qc]);

  if (!channel) return null;

  return (
    <>
      <header className="hidden h-12 shrink-0 items-center gap-2 border-b border-black/20 bg-den-surface px-4 shadow-sm lg:flex">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <IconHash className="h-5 w-5 shrink-0 text-den-muted" aria-hidden="true" />
          <h2 className="truncate text-[15px] font-semibold text-den-cream">{channel.name}</h2>
          {isMuted && (
            <span className="shrink-0 rounded bg-den-elevated px-1.5 py-0.5 text-[10px] font-semibold text-den-muted">
              Muted
            </span>
          )}
          {channel.topic ? (
            <>
              <span className="hidden text-den-muted sm:inline" aria-hidden="true">
                |
              </span>
              <button
                type="button"
                onClick={() => canManageChannels && setTopicOpen(true)}
                title={channel.topic}
                className={`hidden min-w-0 truncate text-sm text-den-muted sm:block ${
                  canManageChannels ? "hover:text-den-cream" : "cursor-default"
                }`}
              >
                {channel.topic}
              </button>
            </>
          ) : (
            canManageChannels && (
              <button
                type="button"
                onClick={() => setTopicOpen(true)}
                className="hidden text-xs text-den-muted hover:text-den-link sm:inline"
              >
                Set a topic
              </button>
            )
          )}
        </div>

        <button
          type="button"
          onClick={() => toggleMute.mutate(!isMuted)}
          disabled={toggleMute.isPending}
          title={isMuted ? "Unmute channel" : "Mute channel"}
          aria-label={isMuted ? "Unmute notifications for this channel" : "Mute notifications for this channel"}
          aria-pressed={isMuted}
          className={`relative shrink-0 rounded-den p-2 transition-colors hover:bg-den-elevated ${
            isMuted ? "text-den-berry" : "text-den-muted hover:text-den-cream"
          }`}
        >
          {isMuted ? <IconBellOff /> : <IconBell />}
        </button>

        <button
          type="button"
          onClick={() => setPinsOpen(true)}
          title={pinCount > 0 ? `Pinned messages (${pinCount})` : "Pinned messages"}
          aria-label={
            pinCount > 0 ? `Pinned messages, ${pinCount} pinned` : "View pinned messages"
          }
          className="relative shrink-0 rounded-den p-2 text-den-muted transition-colors hover:bg-den-elevated hover:text-den-cream"
        >
          <IconPin />
          {pinCount > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-den-honey px-1 text-[9px] font-bold text-white"
              aria-hidden="true"
            >
              {pinCount > 9 ? "9+" : pinCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={openSearch}
          title="Search messages (Ctrl+K)"
          aria-label="Search messages in this channel"
          className="shrink-0 rounded-den p-2 text-den-muted transition-colors hover:bg-den-elevated hover:text-den-cream"
        >
          <IconSearch />
        </button>
      </header>

      {pinsOpen && (
        <PinnedMessagesPanel
          onClose={() => {
            setPinsOpen(false);
            qc.invalidateQueries({ queryKey: ["channel-pins", activeChannelId] });
          }}
        />
      )}

      {topicOpen && activeChannelId && (
        <EditChannelTopicModal
          channelId={activeChannelId}
          initialTopic={channel.topic}
          onClose={() => setTopicOpen(false)}
        />
      )}
    </>
  );
}
