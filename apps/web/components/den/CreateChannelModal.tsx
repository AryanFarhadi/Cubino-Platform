"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Input } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import type { CategoryDTO } from "@cubino/shared";

export function CreateChannelModal({
  denId,
  categories,
  onClose,
}: {
  denId: string;
  categories: CategoryDTO[];
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"TEXT" | "VOICE">("TEXT");
  const [categoryId, setCategoryId] = useState<string>("");

  const create = useMutation({
    mutationFn: () =>
      api(`/api/v1/dens/${denId}/channels`, {
        method: "POST",
        body: JSON.stringify({
          name,
          type,
          categoryId: categoryId || undefined,
        }),
      }),
    onSuccess: onClose,
  });

  return (
    <Modal onClose={onClose} labelledById="create-channel-title">
      <div className="p-6">
        <h3 id="create-channel-title" className="text-lg font-bold text-den-cream">
          Create Channel
        </h3>
        <div className="mt-4 space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Channel name" />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "TEXT" | "VOICE")}
            className="w-full rounded-den bg-den-elevated px-3 py-2 text-den-cream"
          >
            <option value="TEXT">Text</option>
            <option value="VOICE">Voice</option>
          </select>
          {categories.length > 0 && (
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-den bg-den-elevated px-3 py-2 text-den-cream"
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-den-muted">Cancel</button>
          <Button onClick={() => create.mutate()} disabled={!name || create.isPending}>Create</Button>
        </div>
      </div>
    </Modal>
  );
}
