"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { Button, Input } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";

export function EditChannelTopicModal({
  channelId,
  initialTopic,
  onClose,
}: {
  channelId: string;
  initialTopic: string | null;
  onClose: () => void;
}) {
  const channels = useAppStore((s) => s.channels);
  const setChannels = useAppStore((s) => s.setChannels);
  const [topic, setTopic] = useState(initialTopic ?? "");

  const save = useMutation({
    mutationFn: () =>
      api<{ channel: { topic: string | null } }>(`/api/v1/channels/${channelId}`, {
        method: "PATCH",
        body: JSON.stringify({ topic: topic.trim() || null }),
      }),
    onSuccess: (res) => {
      setChannels(
        channels.map((c) =>
          c.id === channelId ? { ...c, topic: res.channel.topic } : c
        )
      );
      onClose();
    },
  });

  return (
    <Modal onClose={onClose} className="max-w-md" labelledById="channel-topic-title">
      <div className="p-6">
        <h3 id="channel-topic-title" className="text-lg font-bold text-den-cream">
          Edit channel topic
        </h3>
        <p className="mt-1 text-xs text-den-muted">
          Let members know what this channel is about
        </p>
        <div className="mt-4">
          <label htmlFor="channel-topic" className="text-xs text-den-muted">
            Topic
          </label>
          <Input
            id="channel-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What's this channel for?"
            maxLength={256}
            className="mt-1"
            autoFocus
          />
          <p className="mt-1 text-[10px] text-den-muted">{topic.length}/256</p>
        </div>
        {save.isError && (
          <p className="mt-2 text-sm text-den-berry">{(save.error as Error).message}</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-sm text-den-muted">
            Cancel
          </button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving..." : "Save topic"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
