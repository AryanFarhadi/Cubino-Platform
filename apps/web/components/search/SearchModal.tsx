"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { Input, Button } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { LionLoader } from "@/components/ui/lion";
import type { MemberDTO, DmChannelDTO } from "@cubino/shared";
import { memberDisplayName } from "@/lib/member-utils";
import { getDmTitle } from "@/lib/dm-utils";
import { queueDmMessageScroll } from "@/lib/dm-pending-scroll";

type SearchAuthor = {
  id: string;
  displayName: string;
};

type ChannelSearchResult = {
  id: string;
  channelId: string;
  content: string;
  createdAt: string;
  author?: SearchAuthor;
};

type DmSearchResult = {
  id: string;
  dmChannelId: string;
  content: string;
  createdAt: string;
  author?: SearchAuthor;
};

type SearchScope = "channel" | "den";

export function SearchModal() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<SearchScope>("channel");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [channelResults, setChannelResults] = useState<ChannelSearchResult[]>([]);
  const [dmResults, setDmResults] = useState<DmSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const activeDenId = useAppStore((s) => s.activeDenId);
  const channels = useAppStore((s) => s.channels);
  const setActiveChannelId = useAppStore((s) => s.setActiveChannelId);
  const setActiveDmId = useAppStore((s) => s.setActiveDmId);
  const user = useAppStore((s) => s.user);
  const activeDmId = useAppStore((s) => s.activeDmId);
  const dmOpen = useAppStore((s) => s.dmOpen);
  const inDmContext = dmOpen || !!activeDmId;
  const searchAllDms = inDmContext && !activeDmId;

  const { data: dmsData } = useQuery({
    queryKey: ["dms"],
    enabled: open && searchAllDms,
    queryFn: () => api<{ dms: DmChannelDTO[] }>("/api/v1/dms"),
  });

  const dmTitle = useCallback(
    (dmId: string) => {
      const dm = dmsData?.dms.find((d) => d.id === dmId);
      return dm ? getDmTitle(dm, user?.id) : "Direct Message";
    },
    [dmsData, user?.id]
  );

  const { data: membersData } = useQuery({
    queryKey: ["members", activeDenId],
    enabled: !!activeDenId && !inDmContext,
    queryFn: () => api<{ members: MemberDTO[] }>(`/api/v1/dens/${activeDenId}/members`),
  });

  const authorLabel = useCallback(
    (author?: SearchAuthor) => {
      if (!author) return "Unknown";
      const member = membersData?.members.find((m) => m.id === author.id);
      return member ? memberDisplayName(member) : author.displayName;
    },
    [membersData]
  );

  useEffect(() => {
    if (activeChannelId) localStorage.setItem("cubino_search_channel", activeChannelId);
  }, [activeChannelId]);

  useEffect(() => {
    setChannelFilter("all");
  }, [scope, open, activeDenId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("cubino:open-search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cubino:open-search", onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setChannelResults([]);
      setDmResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    if (q.length < 2) {
      setChannelResults([]);
      setDmResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    if (inDmContext) {
      // Single conversation or all DMs — both supported
    } else if (scope === "channel" && !activeChannelId) {
      setChannelResults([]);
      setError("Select a channel to search messages");
      setLoading(false);
      return;
    } else if (scope === "den" && !activeDenId) {
      setChannelResults([]);
      setError("Select a Den to search across channels");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const t = setTimeout(() => {
      const request = inDmContext
        ? api<{ results: DmSearchResult[] }>(
            activeDmId
              ? `/api/v1/search/dm-messages?q=${encodeURIComponent(q)}&dmId=${activeDmId}`
              : `/api/v1/search/dm-messages?q=${encodeURIComponent(q)}`
          )
        : scope === "den"
          ? api<{ results: ChannelSearchResult[] }>(
              `/api/v1/search/messages?q=${encodeURIComponent(q)}&denId=${activeDenId}`
            )
          : api<{ results: ChannelSearchResult[] }>(
              `/api/v1/search/messages?q=${encodeURIComponent(q)}&channelId=${activeChannelId}`
            );

      request
        .then((r) => {
          if (inDmContext) {
            setDmResults(r.results as DmSearchResult[]);
            setChannelResults([]);
          } else {
            setChannelResults(r.results as ChannelSearchResult[]);
            setDmResults([]);
          }
          setError(null);
        })
        .catch((err) => {
          setChannelResults([]);
          setDmResults([]);
          setError((err as Error).message ?? "Search failed");
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(t);
  }, [q, open, activeChannelId, activeDenId, activeDmId, inDmContext, scope]);

  const handleClose = () => {
    setOpen(false);
    setQ("");
    setChannelResults([]);
    setDmResults([]);
    setError(null);
  };

  const channelName = (channelId: string) =>
    channels.find((c) => c.id === channelId)?.name ?? "channel";

  const jumpToChannelMessage = (result: ChannelSearchResult) => {
    const needsSwitch = result.channelId !== activeChannelId;
    if (needsSwitch) {
      setActiveChannelId(result.channelId);
    }
    window.setTimeout(
      () => {
        window.dispatchEvent(
          new CustomEvent("cubino:scroll-to-message", {
            detail: { messageId: result.id, channelId: result.channelId },
          })
        );
      },
      needsSwitch ? 300 : 0
    );
    handleClose();
  };

  const jumpToDmMessage = (result: DmSearchResult) => {
    const needsSwitch = result.dmChannelId !== activeDmId;
    if (needsSwitch) {
      queueDmMessageScroll(result.dmChannelId, result.id);
      setActiveDmId(result.dmChannelId);
    } else {
      window.dispatchEvent(
        new CustomEvent("cubino:scroll-to-dm-message", {
          detail: { messageId: result.id, dmId: result.dmChannelId },
        })
      );
    }
    handleClose();
  };

  const filteredChannelResults = useMemo(() => {
    if (channelFilter === "all") return channelResults;
    return channelResults.filter((r) => r.channelId === channelFilter);
  }, [channelResults, channelFilter]);

  const resultChannelOptions = useMemo(() => {
    const ids = new Set(channelResults.map((r) => r.channelId));
    return channels.filter((c) => ids.has(c.id));
  }, [channelResults, channels]);

  if (!open) return null;

  const results = inDmContext ? dmResults : filteredChannelResults;
  const showHint = q.length < 2 && !loading;
  const showEmpty = !loading && !error && q.length >= 2 && results.length === 0;
  const searchTarget = inDmContext
    ? searchAllDms
      ? "all conversations"
      : "this conversation"
    : scope === "den"
      ? "this Den"
      : "this channel";

  return (
    <Modal onClose={handleClose} className="max-w-lg" ariaLabel="Search messages">
      <div className="p-4">
        {!inDmContext && activeDenId && (
          <div
            className="mb-3 flex rounded-den bg-den-elevated p-0.5"
            role="tablist"
            aria-label="Search scope"
          >
            <button
              type="button"
              role="tab"
              aria-selected={scope === "channel"}
              onClick={() => setScope("channel")}
              className={`flex-1 rounded-den px-3 py-1.5 text-xs font-medium transition-colors ${
                scope === "channel"
                  ? "bg-den-surface text-den-cream shadow-sm"
                  : "text-den-muted hover:text-den-cream"
              }`}
            >
              This channel
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scope === "den"}
              onClick={() => setScope("den")}
              className={`flex-1 rounded-den px-3 py-1.5 text-xs font-medium transition-colors ${
                scope === "den"
                  ? "bg-den-surface text-den-cream shadow-sm"
                  : "text-den-muted hover:text-den-cream"
              }`}
            >
              Entire Den
            </button>
          </div>
        )}

        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search messages in ${searchTarget} (Ctrl+K)`}
          autoFocus
          aria-label={`Search messages in ${searchTarget}`}
        />

        {!inDmContext && scope === "den" && channelResults.length > 0 && (
          <div className="mt-3">
            <label htmlFor="search-channel-filter" className="text-xs text-den-muted">
              Filter by channel
            </label>
            <select
              id="search-channel-filter"
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="mt-1 w-full rounded-den border border-white/10 bg-den-elevated px-3 py-2 text-sm text-den-cream"
            >
              <option value="all">All channels ({channelResults.length})</option>
              {resultChannelOptions.map((ch) => {
                const count = channelResults.filter((r) => r.channelId === ch.id).length;
                return (
                  <option key={ch.id} value={ch.id}>
                    #{ch.name} ({count})
                  </option>
                );
              })}
            </select>
          </div>
        )}

        <div
          className="mt-3 max-h-64 space-y-2 overflow-y-auto"
          aria-busy={loading}
          aria-live="polite"
        >
          {loading && (
            <div className="flex flex-col items-center justify-center gap-2 py-8">
              <LionLoader />
              <p className="text-xs text-den-muted">Searching...</p>
            </div>
          )}

          {!loading && error && (
            <div className="py-8 text-center">
              <p className="text-sm font-medium text-den-cream">Search unavailable</p>
              <p className="mt-1 text-xs text-den-muted">{error}</p>
            </div>
          )}

          {showHint && (
            <p className="py-8 text-center text-sm text-den-muted">
              Type at least 2 characters to search {searchTarget}
            </p>
          )}

          {showEmpty && (
            <p className="py-8 text-center text-sm text-den-muted">
              No messages found for &ldquo;{q}&rdquo;
            </p>
          )}

          {!loading &&
            !error &&
            inDmContext &&
            dmResults.map((r) => {
              const name = authorLabel(r.author);
              return (
              <button
                key={r.id}
                type="button"
                onClick={() => jumpToDmMessage(r)}
                className="block w-full rounded bg-den-elevated p-2 text-left text-sm transition-colors hover:bg-den-elevated/80 hover:ring-1 hover:ring-den-honey/30"
                aria-label={`Jump to message from ${name}${searchAllDms ? ` in ${dmTitle(r.dmChannelId)}` : ""}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-medium text-den-cream">{name}</p>
                  {searchAllDms && (
                    <span className="shrink-0 text-[10px] text-den-muted">
                      {dmTitle(r.dmChannelId)}
                    </span>
                  )}
                </div>
                <p className="text-den-muted">{r.content.slice(0, 200)}</p>
                <p className="mt-1 text-[10px] font-medium text-den-link">Jump to message</p>
              </button>
            );
            })}

          {!loading &&
            !error &&
            !inDmContext &&
            filteredChannelResults.map((r) => {
              const name = authorLabel(r.author);
              return (
              <button
                key={r.id}
                type="button"
                onClick={() => jumpToChannelMessage(r)}
                className="block w-full rounded bg-den-elevated p-2 text-left text-sm transition-colors hover:bg-den-elevated/80 hover:ring-1 hover:ring-den-honey/30"
                aria-label={`Jump to message from ${name} in #${channelName(r.channelId)}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-medium text-den-cream">{name}</p>
                  {scope === "den" && (
                    <span className="shrink-0 text-[10px] text-den-muted">#{channelName(r.channelId)}</span>
                  )}
                </div>
                <p className="text-den-muted">{r.content.slice(0, 200)}</p>
                <p className="mt-1 text-[10px] font-medium text-den-link">Jump to message</p>
              </button>
            );
            })}
        </div>

        <Button variant="ghost" className="mt-3 w-full" onClick={handleClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
