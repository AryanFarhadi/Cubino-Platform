"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { parseInviteCode } from "@/lib/invite-code";
import { useAppStore } from "@/stores/app-store";
import { Button, Input } from "@/components/ui/primitives";
import { LionLogo } from "@/components/ui/lion";
import type { DenDTO } from "@cubino/shared";

export default function JoinPageWrapper() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-den-darker"><LionLogo size={48} /></div>}>
      <JoinPage />
    </Suspense>
  );
}

function JoinPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState(params.get("code") ?? "");
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
      router.push("/app");
    },
  });

  useEffect(() => {
    const c = params.get("code");
    if (c) setCode(c);
  }, [params]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-den-darker p-4">
      <div className="w-full max-w-sm rounded-cubino border border-white/[0.06] bg-den-surface p-8 shadow-den">
        <div className="mb-6 flex flex-col items-center gap-3">
          <LionLogo size={64} />
          <h1 className="text-xl font-bold text-den-cream">Join a Den</h1>
        </div>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Paste invite code or link"
          className="font-mono tracking-wider"
        />
        {join.isError && (
          <p className="mt-2 text-sm text-den-berry">{(join.error as Error).message}</p>
        )}
        <Button
          className="mt-4 w-full"
          onClick={() => join.mutate()}
          disabled={!code.trim() || join.isPending}
        >
          {join.isPending ? "Joining..." : "Join server"}
        </Button>
      </div>
    </div>
  );
}
