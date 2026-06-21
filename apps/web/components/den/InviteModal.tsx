"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getApiUrl } from "@/lib/api";
import { Button, Input } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";

interface InviteRow {
  code: string;
  uses: number;
  maxUses: number | null;
  expiresAt: string | null;
}

export function InviteModal({
  denId,
  denName,
  onClose,
}: {
  denId: string;
  denName: string;
  onClose: () => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [maxUses, setMaxUses] = useState("");
  const [expiresInHours, setExpiresInHours] = useState("");
  const qc = useQueryClient();

  const { data: listData } = useQuery({
    queryKey: ["invites", denId],
    queryFn: () => api<{ invites: InviteRow[] }>(`/api/v1/dens/${denId}/invites`),
  });

  const createInvite = useMutation({
    mutationFn: () =>
      api<{ code: string }>(`/api/v1/dens/${denId}/invites`, {
        method: "POST",
        body: JSON.stringify({
          maxUses: maxUses ? Number(maxUses) : undefined,
          expiresInHours: expiresInHours ? Number(expiresInHours) : undefined,
        }),
      }),
    onSuccess: (data) => {
      setCode(data.code);
      qc.invalidateQueries({ queryKey: ["invites", denId] });
    },
  });

  const revokeInvite = useMutation({
    mutationFn: (inviteCode: string) =>
      api(`/api/v1/dens/${denId}/invites/${inviteCode}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invites", denId] }),
  });

  const inviteText = code
    ? `Join "${denName}" on Cubino!\nCode: ${code}\n${typeof window !== "undefined" ? window.location.origin : getApiUrl()}/join?code=${code}`
    : "";

  const copyInvite = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(inviteText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal onClose={onClose} labelledById="invite-modal-title">
      <div className="p-6">
        <h3 id="invite-modal-title" className="text-xl font-bold text-den-cream">
          Invite people to {denName}
        </h3>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Input value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="Max uses" type="number" />
          <Input value={expiresInHours} onChange={(e) => setExpiresInHours(e.target.value)} placeholder="Expires (hours)" type="number" />
        </div>

        {code ? (
          <div className="mt-5 space-y-3">
            <div className="rounded-den border border-black/30 bg-[#1e1f22] p-4">
              <p className="font-mono text-2xl font-bold tracking-widest text-den-gold">{code}</p>
            </div>
            <Button className="w-full" onClick={copyInvite}>{copied ? "Copied!" : "Copy invite link"}</Button>
          </div>
        ) : (
          <Button className="mt-5 w-full" onClick={() => createInvite.mutate()} disabled={createInvite.isPending}>
            {createInvite.isPending ? "Creating..." : "Create invite"}
          </Button>
        )}

        {listData?.invites && listData.invites.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase text-den-muted">Active invites</p>
            <div className="max-h-32 space-y-1 overflow-y-auto">
              {listData.invites.map((inv) => (
                <div key={inv.code} className="flex items-center justify-between rounded bg-den-elevated px-2 py-1 text-sm">
                  <span className="font-mono text-den-cream">{inv.code}</span>
                  <span className="text-xs text-den-muted">{inv.uses}{inv.maxUses ? `/${inv.maxUses}` : ""}</span>
                  <button onClick={() => revokeInvite.mutate(inv.code)} className="text-xs text-den-berry">Revoke</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={onClose} className="mt-4 w-full rounded-den py-2 text-sm text-den-muted hover:text-den-cream">
          Close
        </button>
      </div>
    </Modal>
  );
}
