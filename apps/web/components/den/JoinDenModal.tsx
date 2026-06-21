"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { parseInviteCode } from "@/lib/invite-code";
import { useAppStore } from "@/stores/app-store";
import { Button, Input } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { LionLogo } from "@/components/ui/lion";
import type { DenDTO } from "@cubino/shared";

export function JoinDenModal({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState("");
  const setDens = useAppStore((s) => s.setDens);
  const dens = useAppStore((s) => s.dens);
  const setActiveDenId = useAppStore((s) => s.setActiveDenId);

  const join = useMutation({
    mutationFn: () =>
      api<{ den: DenDTO }>("/api/v1/dens/join-by-code", {
        method: "POST",
        body: JSON.stringify({ code: parseInviteCode(code) }),
      }),
    onSuccess: (data) => {
      const exists = dens.some((d) => d.id === data.den.id);
      if (!exists) setDens([...dens, data.den]);
      setActiveDenId(data.den.id);
      onClose();
    },
  });

  return (
    <Modal onClose={onClose} className="max-w-sm" labelledById="join-den-title">
      <div className="p-6">
        <div className="mb-4 flex items-center gap-3">
          <LionLogo size={32} />
          <h3 id="join-den-title" className="text-lg font-bold text-den-cream">
            Join a Den
          </h3>
        </div>
        <p className="mb-4 text-sm text-den-muted">
          Enter an invite code from a friend to join their server.
        </p>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Paste invite code or link"
          className="font-mono tracking-wider"
          autoFocus
        />
        {join.isError && (
          <p className="mt-2 text-sm text-den-berry">{(join.error as Error).message}</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-den px-4 py-2 text-sm text-den-muted">
            Cancel
          </button>
          <Button onClick={() => join.mutate()} disabled={!code.trim() || join.isPending}>
            {join.isPending ? "Joining..." : "Join"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
