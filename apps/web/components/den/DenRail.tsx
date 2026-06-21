"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "@/lib/api";
import { getChatSocket } from "@/hooks/use-socket";
import { useAppStore } from "@/stores/app-store";
import { useUnreadStore } from "@/stores/unread-store";
import { LionLogo } from "@/components/ui/lion";
import { Modal } from "@/components/ui/Modal";
import { IconPlus } from "@/components/ui/icons";
import { JoinDenModal } from "@/components/den/JoinDenModal";
import { resolveDenAssetUrl } from "@/lib/den-assets";

export function DenRail() {
  const router = useRouter();
  const dens = useAppStore((s) => s.dens);
  const activeDenId = useAppStore((s) => s.activeDenId);
  const dmOpen = useAppStore((s) => s.dmOpen);
  const setActiveDenId = useAppStore((s) => s.setActiveDenId);
  const setDmOpen = useAppStore((s) => s.setDmOpen);
  const setDens = useAppStore((s) => s.setDens);
  const dmUnreadTotal = useUnreadStore((s) =>
    Object.values(s.dmUnread).reduce((a, b) => a + b, 0)
  );
  const denUnread = useUnreadStore((s) => s.denUnread);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [name, setName] = useState("");
  const qc = useQueryClient();

  const { data: friendsData } = useQuery({
    queryKey: ["friends"],
    queryFn: () =>
      api<{
        friends: { status: string; direction?: string }[];
      }>("/api/v1/friends"),
  });

  const incomingFriendCount =
    friendsData?.friends.filter((f) => f.status === "pending" && f.direction === "incoming")
      .length ?? 0;

  useEffect(() => {
    const socket = getChatSocket();
    const refreshFriends = () => qc.invalidateQueries({ queryKey: ["friends"] });
    socket.on("friend:request", refreshFriends);
    socket.on("friend:accepted", refreshFriends);
    return () => {
      socket.off("friend:request", refreshFriends);
      socket.off("friend:accepted", refreshFriends);
    };
  }, [qc]);

  const createDen = useMutation({
    mutationFn: () => api<{ den: { id: string; name: string } }>("/api/v1/dens", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
    onSuccess: (data) => {
      setDens([...dens, data.den as never]);
      setActiveDenId(data.den.id);
      setShowCreate(false);
      setName("");
      qc.invalidateQueries({ queryKey: ["dens"] });
    },
  });

  return (
    <>
      <aside className="flex w-[72px] flex-col items-center gap-2 bg-den-darker py-3">
        <button
          title={
            incomingFriendCount > 0
              ? `Direct Messages (${incomingFriendCount} friend request${incomingFriendCount === 1 ? "" : "s"})`
              : "Direct Messages"
          }
          aria-label={
            incomingFriendCount > 0
              ? `Direct Messages, ${incomingFriendCount} pending friend request${incomingFriendCount === 1 ? "" : "s"}`
              : "Direct Messages"
          }
          onClick={() => setDmOpen(true)}
          className={clsx(
            "relative mb-1 flex h-12 w-12 items-center justify-center rounded-[24px] transition-all duration-200",
            dmOpen
              ? "rounded-2xl bg-den-honey shadow-glow"
              : "bg-den-surface hover:rounded-2xl hover:bg-den-honey"
          )}
        >
          <LionLogo size={36} />
          {incomingFriendCount > 0 && (
            <span
              className="absolute -left-0.5 -top-0.5 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-den-gold px-1 text-[10px] font-bold text-den-darker"
              aria-hidden="true"
            >
              {incomingFriendCount > 9 ? "9+" : incomingFriendCount}
            </span>
          )}
          {dmUnreadTotal > 0 && (
            <span className="absolute -bottom-0.5 -right-0.5 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-den-berry px-1 text-[10px] font-bold text-white">
              {dmUnreadTotal > 99 ? "99+" : dmUnreadTotal}
            </span>
          )}
        </button>

        <div className="mx-auto h-px w-8 bg-white/10" />

        {dens.map((den) => {
          const unread = denUnread[den.id] ?? 0;
          const showUnread = unread > 0 && (dmOpen || activeDenId !== den.id);
          return (
          <button
            key={den.id}
            title={
              showUnread ? `${den.name} (${unread > 99 ? "99+" : unread} unread)` : den.name
            }
            aria-label={
              showUnread
                ? `${den.name}, ${unread > 99 ? "99+" : unread} unread messages`
                : den.name
            }
            onClick={() => setActiveDenId(den.id)}
            className={clsx(
              "group relative flex h-12 w-12 items-center justify-center rounded-[24px] bg-den-surface text-sm font-semibold text-den-cream transition-all duration-200",
              "hover:rounded-2xl hover:bg-den-honey hover:text-white",
              activeDenId === den.id && !dmOpen && "rounded-2xl bg-den-honey text-white shadow-glow"
            )}
          >
            {activeDenId === den.id && !dmOpen && (
              <span className="absolute -left-3 h-10 w-1 rounded-r-full bg-white" />
            )}
            {showUnread && (
              <span
                className="absolute -bottom-0.5 -right-0.5 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-den-berry px-1 text-[10px] font-bold text-white"
                aria-hidden="true"
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}
            {resolveDenAssetUrl(den.iconUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolveDenAssetUrl(den.iconUrl)!}
                alt=""
                className="h-full w-full rounded-[inherit] object-cover"
              />
            ) : (
              den.name.slice(0, 2).toUpperCase()
            )}
          </button>
        );
        })}

        <button
          title="Discover public dens"
          aria-label="Discover public dens"
          onClick={() => router.push("/discover")}
          className="flex h-12 w-12 items-center justify-center rounded-[24px] bg-den-surface text-[10px] font-bold leading-tight text-den-honey transition-all duration-200 hover:rounded-2xl hover:bg-den-elevated hover:text-den-cream"
        >
          FIND
        </button>

        <button
          title="Join with invite code"
          onClick={() => setShowJoin(true)}
          className="flex h-12 w-12 items-center justify-center rounded-[24px] bg-den-surface text-[10px] font-bold leading-tight text-den-link transition-all duration-200 hover:rounded-2xl hover:bg-den-elevated hover:text-den-cream"
        >
          JOIN
        </button>

        <button
          title="Create Den"
          onClick={() => setShowCreate(true)}
          className="flex h-12 w-12 items-center justify-center rounded-[24px] bg-den-surface text-den-forest transition-all duration-200 hover:rounded-2xl hover:bg-den-forest hover:text-white"
        >
          <IconPlus className="h-6 w-6" />
        </button>
      </aside>

      {showCreate && (
        <Modal onClose={() => setShowCreate(false)} className="max-w-sm" labelledById="create-den-title">
          <div className="p-6">
            <div className="mb-4 flex items-center gap-3">
              <LionLogo size={32} />
              <h3 id="create-den-title" className="text-lg font-bold text-den-cream">
                Create a Den
              </h3>
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name your server..."
              className="mb-4 w-full rounded-den border border-black/30 bg-[#1e1f22] px-3 py-2.5 text-den-cream outline-none focus:border-den-honey focus:ring-1 focus:ring-den-honey/40"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-den px-4 py-2 text-sm text-den-muted hover:text-den-cream"
              >
                Cancel
              </button>
              <button
                onClick={() => createDen.mutate()}
                disabled={!name.trim()}
                className="rounded-den bg-den-honey px-4 py-2 text-sm font-semibold text-white hover:bg-den-amber disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showJoin && <JoinDenModal onClose={() => setShowJoin(false)} />}
    </>
  );
}
