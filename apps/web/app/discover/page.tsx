"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { resolveDenAssetUrl } from "@/lib/den-assets";
import { Button, Input } from "@/components/ui/primitives";
import { LionLoader, LionLogo } from "@/components/ui/lion";
import type { DenDTO } from "@cubino/shared";

type DiscoverDen = {
  id: string;
  name: string;
  iconUrl: string | null;
  description: string | null;
  memberCount?: number;
};

export default function DiscoverPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const dens = useAppStore((s) => s.dens);
  const setDens = useAppStore((s) => s.setDens);
  const setActiveDenId = useAppStore((s) => s.setActiveDenId);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["discover", debouncedQ],
    queryFn: () =>
      api<{ dens: DiscoverDen[] }>(
        `/api/v1/dens/discover/search${debouncedQ ? `?q=${encodeURIComponent(debouncedQ)}` : ""}`
      ),
  });

  const join = useMutation({
    mutationFn: (denId: string) =>
      api<{ den: DenDTO }>(`/api/v1/dens/${denId}/join`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: (res) => {
      setJoinError(null);
      const exists = dens.some((d) => d.id === res.den.id);
      setDens(exists ? dens : [...dens, res.den]);
      setActiveDenId(res.den.id);
      qc.invalidateQueries({ queryKey: ["channels", res.den.id] });
      router.push("/app");
    },
    onError: (err) => setJoinError((err as Error).message),
  });

  const discoverDens = data?.dens ?? [];

  return (
    <div className="min-h-screen bg-den-darker p-4 sm:p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <LionLogo size={48} />
          <div>
            <h1 className="text-2xl font-bold text-den-cream">Discover Dens</h1>
            <p className="text-sm text-den-muted">Browse and join public communities</p>
            <p className="mt-1 text-xs text-den-muted">
              Join a den to earn the <span className="text-den-gold">Pride Member</span> achievement
              — join five for <span className="text-den-gold">Pride Explorer</span>.
            </p>
          </div>
        </div>

        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or description..."
          aria-label="Search public dens by name or description"
        />

        {joinError && (
          <p className="mt-3 rounded-den border border-den-berry/30 bg-den-berry/10 px-3 py-2 text-sm text-den-berry">
            {joinError}
          </p>
        )}

        <div className="mt-6 space-y-3">
          {isLoading && (
            <div className="flex flex-col items-center gap-2 py-12">
              <LionLoader />
              <p className="text-xs text-den-muted">Searching dens...</p>
            </div>
          )}

          {isError && (
            <div className="py-10 text-center">
              <p className="text-sm text-den-cream">Could not load dens</p>
              <p className="mt-1 text-xs text-den-muted">{(error as Error).message}</p>
              <Button variant="ghost" className="mt-3 text-xs" onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          )}

          {!isLoading && !isError && discoverDens.length === 0 && (
            <p className="py-12 text-center text-sm text-den-muted">
              {debouncedQ
                ? `No new public dens match "${debouncedQ}"`
                : "No new public dens to discover — you may have joined them all"}
            </p>
          )}

          {!isLoading &&
            !isError &&
            discoverDens.map((d) => {
              const iconSrc = resolveDenAssetUrl(d.iconUrl);
              return (
                <div
                  key={d.id}
                  className="flex gap-3 rounded-cubino border border-white/5 bg-den-surface p-4"
                >
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-den-elevated text-sm font-bold text-den-cream"
                    aria-hidden="true"
                  >
                    {iconSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={iconSrc} alt="" className="h-full w-full object-cover" />
                    ) : (
                      d.name.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate font-semibold text-den-cream">{d.name}</h2>
                      <span className="shrink-0 rounded bg-den-honey/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-den-honey">
                        Public
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-den-muted">
                      {d.description?.trim() || "No description"}
                    </p>
                    {typeof d.memberCount === "number" && (
                      <p className="mt-1 text-xs text-den-muted">
                        {d.memberCount} {d.memberCount === 1 ? "member" : "members"}
                      </p>
                    )}
                    <div className="mt-3">
                      <Button
                        className="text-xs"
                        disabled={join.isPending}
                        onClick={() => {
                          setJoinError(null);
                          join.mutate(d.id);
                        }}
                      >
                        {join.isPending ? "Joining..." : "Join Den"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        <Button className="mt-6" variant="ghost" onClick={() => router.push("/app")}>
          Back to app
        </Button>
      </div>
    </div>
  );
}
