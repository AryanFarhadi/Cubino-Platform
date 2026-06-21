"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { Button, Input } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import type { CategoryDTO, ChannelDTO } from "@cubino/shared";

const SLOW_MODE_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "5 seconds", value: 5 },
  { label: "10 seconds", value: 10 },
  { label: "30 seconds", value: 30 },
  { label: "1 minute", value: 60 },
  { label: "5 minutes", value: 300 },
  { label: "10 minutes", value: 600 },
  { label: "1 hour", value: 3600 },
  { label: "6 hours", value: 21600 },
] as const;

export function EditChannelSettingsModal({
  channel,
  categories,
  denId,
  onClose,
}: {
  channel: ChannelDTO;
  categories: CategoryDTO[];
  denId: string;
  onClose: () => void;
}) {
  const channels = useAppStore((s) => s.channels);
  const setChannels = useAppStore((s) => s.setChannels);
  const qc = useQueryClient();
  const [name, setName] = useState(channel.name);
  const [categoryId, setCategoryId] = useState(channel.categoryId ?? "");
  const [slowModeSeconds, setSlowModeSeconds] = useState(channel.slowModeSeconds ?? 0);

  const save = useMutation({
    mutationFn: () =>
      api<{
        channel: {
          name: string;
          slowModeSeconds: number;
          categoryId: string | null;
        };
      }>(`/api/v1/channels/${channel.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          categoryId: categoryId || null,
          slowModeSeconds: channel.type === "TEXT" ? slowModeSeconds : undefined,
        }),
      }),
    onSuccess: (res) => {
      setChannels(
        channels.map((c) =>
          c.id === channel.id
            ? {
                ...c,
                name: res.channel.name,
                categoryId: res.channel.categoryId,
                slowModeSeconds: res.channel.slowModeSeconds,
              }
            : c
        )
      );
      qc.invalidateQueries({ queryKey: ["channels", denId] });
      onClose();
    },
  });

  const nameValid = name.trim().length >= 1 && name.trim().length <= 100;

  return (
    <Modal onClose={onClose} className="max-w-md" labelledById="channel-settings-title">
      <div className="p-6">
        <h3 id="channel-settings-title" className="text-lg font-bold text-den-cream">
          Channel settings
        </h3>

        <div className="mt-4">
          <label htmlFor="channel-name" className="text-xs text-den-muted">
            Channel name
          </label>
          <Input
            id="channel-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Channel name"
            maxLength={100}
            className="mt-1"
            autoFocus
          />
          <p className="mt-1 text-[10px] text-den-muted">
            Lowercase letters, numbers, and dashes work best
          </p>
        </div>

        {categories.length > 0 && (
          <div className="mt-4">
            <label htmlFor="channel-category" className="text-xs text-den-muted">
              Category
            </label>
            <select
              id="channel-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1 w-full rounded-den border border-white/10 bg-den-elevated px-3 py-2 text-sm text-den-cream"
            >
              <option value="">No category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {channel.type === "TEXT" && (
          <div className="mt-4">
            <label htmlFor="slow-mode" className="text-xs text-den-muted">
              Slow mode
            </label>
            <p className="mt-0.5 text-[11px] text-den-muted">
              Members must wait between messages. Moderators bypass slow mode.
            </p>
            <select
              id="slow-mode"
              value={slowModeSeconds}
              onChange={(e) => setSlowModeSeconds(Number(e.target.value))}
              className="mt-2 w-full rounded-den border border-white/10 bg-den-elevated px-3 py-2 text-sm text-den-cream"
            >
              {SLOW_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {channel.type === "VOICE" && (
          <p className="mt-4 text-sm text-den-muted">
            Voice channels do not support slow mode.
          </p>
        )}

        {save.isError && (
          <p className="mt-2 text-sm text-den-berry">{(save.error as Error).message}</p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-sm text-den-muted">
            Cancel
          </button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !nameValid}
          >
            {save.isPending ? "Saving..." : "Save settings"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
