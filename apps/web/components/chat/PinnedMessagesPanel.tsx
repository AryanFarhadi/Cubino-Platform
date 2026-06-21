"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/primitives";
import { LionLoader } from "@/components/ui/lion";
import { MessageContent } from "@/components/chat/MessageContent";
import { roleMentionKey, type RoleHighlight } from "@/lib/mention-utils";
import type { MemberDTO, RoleDTO, UserPublic } from "@cubino/shared";
import { memberDisplayName } from "@/lib/member-utils";

type PinItem = {
  id: string;
  messageId: string;
  content: string;
  pinnedAt: string;
  authorId: string;
  author: UserPublic;
};

export function PinnedMessagesPanel({ onClose }: { onClose: () => void }) {
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const activeDenId = useAppStore((s) => s.activeDenId);
  const qc = useQueryClient();

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

  const roleHighlights: RoleHighlight[] =
    rolesData?.roles.map((r) => ({
      mentionKey: roleMentionKey(r.name),
      name: r.name,
      color: r.color,
    })) ?? [];

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["channel-pins", activeChannelId],
    enabled: !!activeChannelId,
    queryFn: () =>
      api<{ pins: PinItem[] }>(`/api/v1/channels/${activeChannelId}/pins`),
  });

  const unpin = useMutation({
    mutationFn: (messageId: string) =>
      api(`/api/v1/channels/${activeChannelId}/pins/${messageId}`, { method: "DELETE" }),
    onSuccess: () => {
      refetch();
      qc.invalidateQueries({ queryKey: ["channel-pins", activeChannelId] });
      window.dispatchEvent(new Event("cubino:pins-changed"));
    },
  });

  const pins = data?.pins ?? [];

  const authorLabel = (pin: PinItem) => {
    const member = membersData?.members.find((m) => m.id === pin.authorId);
    return member ? memberDisplayName(member) : pin.author.displayName;
  };

  const jumpToMessage = (messageId: string) => {
    if (!activeChannelId) return;
    window.dispatchEvent(
      new CustomEvent("cubino:scroll-to-message", {
        detail: { messageId, channelId: activeChannelId },
      })
    );
    onClose();
  };

  return (
    <Modal onClose={onClose} className="max-w-md" labelledById="pinned-messages-title">
      <div className="p-5">
        <h3 id="pinned-messages-title" className="text-lg font-bold text-den-cream">
          Pinned Messages
        </h3>
        <p className="mt-1 text-xs text-den-muted">
          Important messages saved in this channel
        </p>

        <div className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto" aria-live="polite">
          {isLoading && (
            <div className="flex flex-col items-center gap-2 py-8">
              <LionLoader />
              <p className="text-xs text-den-muted">Loading pins...</p>
            </div>
          )}

          {isError && (
            <div className="py-8 text-center">
              <p className="text-sm font-medium text-den-cream">Could not load pins</p>
              <p className="mt-1 text-xs text-den-muted">
                {(error as Error)?.message ?? "Check your connection and try again."}
              </p>
              <Button variant="ghost" className="mt-3" onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          )}

          {!isLoading && !isError && pins.length === 0 && (
            <p className="py-8 text-center text-sm text-den-muted">
              No pinned messages in this channel yet
            </p>
          )}

          {!isLoading &&
            !isError &&
            pins.map((pin) => {
              const name = authorLabel(pin);
              return (
                <div
                  key={pin.id}
                  className="rounded-den border border-white/[0.06] bg-den-elevated p-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-den-cream">{name}</p>
                    <p className="shrink-0 text-[10px] text-den-muted">
                      {new Date(pin.pinnedAt).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="mt-1 text-sm">
                    <MessageContent
                      content={pin.content.slice(0, 500)}
                      roleHighlights={roleHighlights}
                    />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => jumpToMessage(pin.messageId)}
                      className="text-xs font-medium text-den-link hover:underline"
                    >
                      Jump to message
                    </button>
                    <button
                      type="button"
                      onClick={() => unpin.mutate(pin.messageId)}
                      disabled={unpin.isPending}
                      className="text-xs text-den-muted hover:text-den-berry disabled:opacity-50"
                    >
                      Unpin
                    </button>
                  </div>
                </div>
              );
            })}
        </div>

        <Button variant="ghost" className="mt-4 w-full" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
