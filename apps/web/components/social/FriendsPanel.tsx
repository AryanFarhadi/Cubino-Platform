"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { UserStatus } from "@cubino/shared";
import { api } from "@/lib/api";
import { getChatSocket } from "@/hooks/use-socket";
import { usePresenceStore } from "@/stores/presence-store";
import { useAppStore } from "@/stores/app-store";
import { Button, Input, Avatar } from "@/components/ui/primitives";
import { LionLoader } from "@/components/ui/lion";

type FriendRow = {
  status: string;
  direction?: "incoming" | "outgoing";
  user: { id: string; username: string; displayName: string; avatarUrl?: string | null; status?: UserStatus };
};

type BlockedRow = {
  user: { id: string; username: string; displayName: string };
};

export function FriendsPanel() {
  const qc = useQueryClient();
  const setActiveDmId = useAppStore((s) => s.setActiveDmId);
  const onlineUsers = usePresenceStore((s) => s.onlineUsers);
  const [username, setUsername] = useState("");
  const [search, setSearch] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [friendToast, setFriendToast] = useState<string | null>(null);
  const activeDmId = useAppStore((s) => s.activeDmId);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api<{ friends: FriendRow[]; blocked?: BlockedRow[] }>("/api/v1/friends"),
  });

  useEffect(() => {
    const socket = getChatSocket();
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ["friends"] });
    };
    const onRequest = (payload: { fromUser?: { displayName?: string } }) => {
      refresh();
      const name = payload.fromUser?.displayName ?? "Someone";
      setFriendToast(`${name} sent you a friend request`);
      window.setTimeout(() => setFriendToast(null), 4000);
    };
    const onAccepted = (payload: { user?: { displayName?: string } }) => {
      refresh();
      const name = payload.user?.displayName ?? "A friend";
      setFriendToast(`${name} is now your friend!`);
      window.setTimeout(() => setFriendToast(null), 4000);
    };
    socket.on("friend:request", onRequest);
    socket.on("friend:accepted", onAccepted);
    return () => {
      socket.off("friend:request", onRequest);
      socket.off("friend:accepted", onAccepted);
    };
  }, [qc]);

  const sendRequest = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; accepted?: boolean }>("/api/v1/friends/request", {
        method: "POST",
        body: JSON.stringify({ username: username.trim().replace(/^@/, "") }),
      }),
    onSuccess: (res) => {
      setUsername("");
      setAddError(null);
      setAddSuccess(
        res.accepted ? "You are now friends!" : "Friend request sent"
      );
      qc.invalidateQueries({ queryKey: ["friends"] });
      window.setTimeout(() => setAddSuccess(null), 3000);
    },
    onError: (err) => {
      setAddSuccess(null);
      setAddError((err as Error).message || "Failed to send request");
    },
  });

  const accept = useMutation({
    mutationFn: (friendId: string) =>
      api(`/api/v1/friends/${friendId}/accept`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["friends"] });
      setFriendToast("Friend request accepted");
      window.setTimeout(() => setFriendToast(null), 3000);
    },
  });

  const decline = useMutation({
    mutationFn: (friendId: string) =>
      api(`/api/v1/friends/${friendId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["friends"] }),
  });

  const removeFriend = useMutation({
    mutationFn: (friendId: string) =>
      api(`/api/v1/friends/${friendId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["friends"] }),
  });

  const blockUser = useMutation({
    mutationFn: (friendId: string) =>
      api(`/api/v1/friends/${friendId}/block`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["friends"] }),
  });

  const unblockUser = useMutation({
    mutationFn: (friendId: string) =>
      api(`/api/v1/friends/${friendId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["friends"] }),
  });

  const startDm = useMutation({
    mutationFn: (friendUsername: string) =>
      api<{ dm: { id: string } }>("/api/v1/dms", {
        method: "POST",
        body: JSON.stringify({ username: friendUsername }),
      }),
    onSuccess: (res) => {
      setMessageError(null);
      qc.invalidateQueries({ queryKey: ["dms"] });
      setActiveDmId(res.dm.id);
    },
    onError: (err) => {
      setMessageError((err as Error).message || "Could not open conversation");
      window.setTimeout(() => setMessageError(null), 4000);
    },
  });

  const friends = data?.friends ?? [];
  const blocked = data?.blocked ?? [];
  const q = search.trim().toLowerCase();
  const matchesSearch = (name: string, uname: string) =>
    !q || name.toLowerCase().includes(q) || uname.toLowerCase().includes(q);

  const incoming = friends.filter(
    (f) => f.status === "pending" && f.direction === "incoming" && matchesSearch(f.user.displayName, f.user.username)
  );
  const accepted = friends.filter(
    (f) => f.status === "accepted" && matchesSearch(f.user.displayName, f.user.username)
  );
  const outgoing = friends.filter(
    (f) => f.status === "pending" && f.direction === "outgoing" && matchesSearch(f.user.displayName, f.user.username)
  );
  const blockedFiltered = blocked.filter((b) => matchesSearch(b.user.displayName, b.user.username));
  const incomingCount = incoming.length;

  const friendPresence = (friend: FriendRow["user"]): UserStatus => {
    const live = onlineUsers[friend.id];
    if (live === "invisible") return "offline";
    return live ?? friend.status ?? "offline";
  };

  const presenceRank = (status: UserStatus) => {
    if (status === "online") return 0;
    if (status === "idle") return 1;
    if (status === "dnd") return 2;
    return 3;
  };

  const sortedAccepted = [...accepted].sort((a, b) => {
    const diff = presenceRank(friendPresence(a.user)) - presenceRank(friendPresence(b.user));
    if (diff !== 0) return diff;
    return a.user.displayName.localeCompare(b.user.displayName);
  });

  const showEmptyFriends =
    !isLoading &&
    !isError &&
    incoming.length === 0 &&
    accepted.length === 0 &&
    outgoing.length === 0 &&
    blockedFiltered.length === 0 &&
    !q;

  return (
    <div
      className={`border-t border-black/20 p-3 ${activeDmId ? "hidden md:block" : ""}`}
      aria-busy={isLoading}
      aria-live="polite"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase text-den-muted">Friends</p>
        {incomingCount > 0 && (
          <span className="rounded-full bg-den-berry px-1.5 py-0.5 text-[10px] font-bold text-white">
            {incomingCount} pending
          </span>
        )}
      </div>

      <form
        className="mb-3 flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (!username.trim() || sendRequest.isPending) return;
          setAddError(null);
          sendRequest.mutate();
        }}
      >
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Add friend by username"
          aria-label="Friend username"
          className="min-w-0 flex-1 text-xs"
          maxLength={32}
          disabled={sendRequest.isPending}
        />
        <Button
          type="submit"
          className="shrink-0 px-2 text-xs"
          disabled={!username.trim() || sendRequest.isPending}
        >
          {sendRequest.isPending ? "..." : "Add"}
        </Button>
      </form>

      {(accepted.length > 0 || blocked.length > 0) && (
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search friends..."
          aria-label="Search friends"
          className="mb-3 text-xs"
        />
      )}

      {addError && (
        <p className="mb-2 text-xs text-den-berry" role="alert">
          {addError}
        </p>
      )}
      {addSuccess && (
        <p className="mb-2 text-xs text-den-forest" role="status">
          {addSuccess}
        </p>
      )}
      {messageError && (
        <p className="mb-2 text-xs text-den-berry" role="alert">
          {messageError}
        </p>
      )}
      {friendToast && (
        <p className="mb-2 text-xs text-den-forest" role="status">
          {friendToast}
        </p>
      )}

      {isLoading && (
        <div className="flex flex-col items-center justify-center gap-2 py-4">
          <LionLoader />
          <p className="text-xs text-den-muted">Loading friends...</p>
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <p className="text-sm font-medium text-den-cream">Could not load friends</p>
          <p className="text-xs text-den-muted">
            {(error as Error)?.message ?? "Check your connection and try again."}
          </p>
          <Button variant="ghost" className="mt-1 px-3 py-1.5 text-xs" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      )}

      {showEmptyFriends && (
        <p className="text-xs text-den-muted">No friends yet — add someone by username above</p>
      )}

      {!isLoading && !isError && (
        <div className="space-y-3">
          {incoming.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-den-muted">
                Incoming requests
              </p>
              <div className="space-y-1">
                {incoming.map((f) => (
                  <div key={f.user.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-den-cream">{f.user.displayName}</span>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-xs"
                        disabled={accept.isPending || decline.isPending}
                        onClick={() => accept.mutate(f.user.id)}
                      >
                        Accept
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-xs text-den-muted"
                        disabled={accept.isPending || decline.isPending}
                        onClick={() => decline.mutate(f.user.id)}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {accepted.length > 0 && (
            <div>
              {incoming.length > 0 && (
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-den-muted">
                  Friends
                </p>
              )}
              <div className="space-y-1">
                {sortedAccepted.map((f) => (
                  <div key={f.user.id} className="flex items-center justify-between gap-2 text-sm">
                    <button
                      type="button"
                      disabled={startDm.isPending}
                      onClick={() => startDm.mutate(f.user.username)}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-den px-1 py-0.5 text-left hover:bg-den-elevated/60 disabled:opacity-50"
                      title={`Message ${f.user.displayName}`}
                      aria-label={`Message ${f.user.displayName}`}
                    >
                      <Avatar
                        name={f.user.displayName}
                        src={f.user.avatarUrl}
                        size={24}
                        status={friendPresence(f.user)}
                      />
                      <span className="truncate text-den-cream">{f.user.displayName}</span>
                    </button>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-xs text-den-honey"
                        disabled={startDm.isPending}
                        onClick={() => startDm.mutate(f.user.username)}
                      >
                        Message
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-xs text-den-muted hover:text-den-berry"
                        disabled={removeFriend.isPending || blockUser.isPending}
                        onClick={() => {
                          if (
                            confirm(
                              `Remove ${f.user.displayName} from your friends list?`
                            )
                          ) {
                            removeFriend.mutate(f.user.id);
                          }
                        }}
                      >
                        Remove
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-xs text-den-muted hover:text-den-berry"
                        disabled={blockUser.isPending}
                        onClick={() => {
                          if (
                            confirm(
                              `Block ${f.user.displayName}? They will not be able to message you or send friend requests.`
                            )
                          ) {
                            blockUser.mutate(f.user.id);
                          }
                        }}
                      >
                        Block
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {outgoing.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-den-muted">
                Sent requests
              </p>
              <div className="space-y-1">
                {outgoing.map((f) => (
                  <div key={f.user.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-den-cream">{f.user.displayName}</span>
                    <Button
                      variant="ghost"
                      className="shrink-0 px-2 py-1 text-xs text-den-muted"
                      disabled={removeFriend.isPending}
                      onClick={() => removeFriend.mutate(f.user.id)}
                    >
                      Cancel
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {blockedFiltered.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-den-muted">
                Blocked
              </p>
              <div className="space-y-1">
                {blockedFiltered.map((b) => (
                  <div key={b.user.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-den-muted">{b.user.displayName}</span>
                    <Button
                      variant="ghost"
                      className="shrink-0 px-2 py-1 text-xs"
                      disabled={unblockUser.isPending}
                      onClick={() => unblockUser.mutate(b.user.id)}
                    >
                      Unblock
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {q && incoming.length === 0 && accepted.length === 0 && outgoing.length === 0 && blockedFiltered.length === 0 && (
            <p className="text-xs text-den-muted">No friends match &ldquo;{search.trim()}&rdquo;</p>
          )}
        </div>
      )}
    </div>
  );
}
