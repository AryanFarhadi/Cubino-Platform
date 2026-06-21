"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Permission } from "@cubino/shared";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { useHasDenPermission } from "@/hooks/use-den-permissions";
import { Avatar, Badge, Button } from "@/components/ui/primitives";
import { LionLoader } from "@/components/ui/lion";
import { Modal } from "@/components/ui/Modal";
import { MemberRolesModal } from "@/components/den/MemberRolesModal";
import type { MemberDTO } from "@cubino/shared";
import { memberDisplayName } from "@/lib/member-utils";

const BAN_DURATION_OPTIONS = [
  { label: "Permanent", value: "" as const },
  { label: "1 hour", value: 1 as const },
  { label: "24 hours", value: 24 as const },
  { label: "7 days", value: 168 as const },
  { label: "30 days", value: 720 as const },
];

export function MemberPanel({
  mobile,
  onClose,
  showModeration = false,
  openReportCount = 0,
}: {
  mobile?: boolean;
  onClose?: () => void;
  showModeration?: boolean;
  openReportCount?: number;
} = {}) {
  const activeDenId = useAppStore((s) => s.activeDenId);
  const user = useAppStore((s) => s.user);
  const setActiveDmId = useAppStore((s) => s.setActiveDmId);
  const qc = useQueryClient();
  const [moderationTarget, setModerationTarget] = useState<MemberDTO | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banDurationHours, setBanDurationHours] = useState<number | "">("");
  const [modError, setModError] = useState<string | null>(null);
  const [rolesTarget, setRolesTarget] = useState<MemberDTO | null>(null);
  const [actionTarget, setActionTarget] = useState<MemberDTO | null>(null);
  const [highlightMemberId, setHighlightMemberId] = useState<string | null>(null);
  const [friendToast, setFriendToast] = useState<string | null>(null);
  const longPressRef = useRef<{ timer?: ReturnType<typeof setTimeout>; moved: boolean }>({
    moved: false,
  });

  const canKick = useHasDenPermission(activeDenId, Permission.KICK_MEMBERS);
  const canBan = useHasDenPermission(activeDenId, Permission.BAN_MEMBERS);
  const canManageRoles = useHasDenPermission(activeDenId, Permission.MANAGE_ROLES);

  useEffect(() => {
    const onHighlight = (event: Event) => {
      const memberId = (event as CustomEvent<{ memberId: string }>).detail?.memberId;
      if (!memberId) return;
      setHighlightMemberId(memberId);
      window.setTimeout(() => {
        document.getElementById(`member-${memberId}`)?.scrollIntoView({ block: "nearest" });
      }, 100);
      window.setTimeout(() => setHighlightMemberId(null), 3000);
    };
    window.addEventListener("cubino:highlight-member", onHighlight);
    return () => window.removeEventListener("cubino:highlight-member", onHighlight);
  }, []);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["members", activeDenId],
    enabled: !!activeDenId,
    queryFn: () =>
      api<{ members: MemberDTO[] }>(`/api/v1/dens/${activeDenId}/members`),
  });

  const startDm = useMutation({
    mutationFn: (username: string) =>
      api<{ dm: { id: string } }>("/api/v1/dms", {
        method: "POST",
        body: JSON.stringify({ username }),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["dms"] });
      setActiveDmId(res.dm.id);
    },
    onError: (err) => {
      setFriendToast((err as Error).message || "Could not start conversation");
      window.setTimeout(() => setFriendToast(null), 4000);
    },
  });

  const sendFriendRequest = useMutation({
    mutationFn: (username: string) =>
      api<{ ok: boolean; accepted?: boolean }>("/api/v1/friends/request", {
        method: "POST",
        body: JSON.stringify({ username }),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["friends"] });
      setFriendToast(res.accepted ? "You are now friends!" : "Friend request sent");
      window.setTimeout(() => setFriendToast(null), 3000);
    },
    onError: (err) => {
      setFriendToast((err as Error).message || "Could not send friend request");
      window.setTimeout(() => setFriendToast(null), 4000);
    },
  });

  const acceptFriend = useMutation({
    mutationFn: (friendId: string) =>
      api(`/api/v1/friends/${friendId}/accept`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["friends"] });
      setFriendToast("Friend request accepted");
      window.setTimeout(() => setFriendToast(null), 3000);
    },
  });

  const blockUser = useMutation({
    mutationFn: (friendId: string) =>
      api(`/api/v1/friends/${friendId}/block`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["friends"] });
      setFriendToast("User blocked");
      window.setTimeout(() => setFriendToast(null), 3000);
    },
    onError: (err) => {
      setFriendToast((err as Error).message || "Could not block user");
      window.setTimeout(() => setFriendToast(null), 4000);
    },
  });

  const unblockUser = useMutation({
    mutationFn: (friendId: string) =>
      api(`/api/v1/friends/${friendId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["friends"] });
      setFriendToast("User unblocked");
      window.setTimeout(() => setFriendToast(null), 3000);
    },
    onError: (err) => {
      setFriendToast((err as Error).message || "Could not unblock user");
      window.setTimeout(() => setFriendToast(null), 4000);
    },
  });

  const { data: friendsData } = useQuery({
    queryKey: ["friends"],
    queryFn: () =>
      api<{
        friends: {
          status: string;
          direction?: string;
          user: { id: string; username: string };
        }[];
        blocked?: { user: { id: string; username: string } }[];
      }>("/api/v1/friends"),
  });

  const friendStatusFor = (memberId: string, username: string) => {
    if (friendsData?.blocked?.some((b) => b.user.id === memberId || b.user.username === username)) {
      return "blocked" as const;
    }
    const row = friendsData?.friends.find((f) => f.user.id === memberId || f.user.username === username);
    if (!row) return "none" as const;
    if (row.status === "accepted") return "friends" as const;
    if (row.direction === "incoming") return "incoming" as const;
    return "outgoing" as const;
  };

  const kickMember = useMutation({
    mutationFn: (memberId: string) =>
      api(`/api/v1/dens/${activeDenId}/members/${memberId}/kick`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members", activeDenId] });
      setModerationTarget(null);
      setModError(null);
    },
    onError: (err) => setModError((err as Error).message),
  });

  const banMember = useMutation({
    mutationFn: ({
      memberId,
      reason,
      expiresInHours,
    }: {
      memberId: string;
      reason?: string;
      expiresInHours?: number;
    }) =>
      api(`/api/v1/dens/${activeDenId}/members/${memberId}/ban`, {
        method: "POST",
        body: JSON.stringify({
          reason: reason || undefined,
          expiresInHours: expiresInHours || undefined,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members", activeDenId] });
      setModerationTarget(null);
      setBanReason("");
      setBanDurationHours("");
      setModError(null);
    },
    onError: (err) => setModError((err as Error).message),
  });

  if (!activeDenId) return null;

  const owners = data?.members.filter((m) => m.isOwner) ?? [];
  const others = data?.members.filter((m) => !m.isOwner) ?? [];
  const memberCount = data?.members.length ?? 0;
  const showEmptyMembers = !isLoading && !isError && memberCount === 0;

  const canModerate = (m: MemberDTO) =>
    m.id !== user?.id && !m.isOwner && (canKick || canBan);

  const canEditRoles = (m: MemberDTO) =>
    m.id !== user?.id && !m.isOwner && canManageRoles;

  const openModeration = (m: MemberDTO) => {
    setModError(null);
    setBanReason("");
    setBanDurationHours("");
    setModerationTarget(m);
  };

  const cancelLongPress = () => {
    if (longPressRef.current.timer) {
      clearTimeout(longPressRef.current.timer);
      longPressRef.current.timer = undefined;
    }
  };

  const startLongPress = (m: MemberDTO) => {
    if (!mobile || (!canEditRoles(m) && !canModerate(m))) return;
    longPressRef.current.moved = false;
    cancelLongPress();
    longPressRef.current.timer = setTimeout(() => {
      if (!longPressRef.current.moved) setActionTarget(m);
    }, 450);
  };

  const renderMember = (m: MemberDTO) => {
    const displayLabel = m.nickname?.trim() || m.displayName;
    const friendStatus = m.id !== user?.id ? friendStatusFor(m.id, m.username) : null;
    const isBlocked = friendStatus === "blocked";
    return (
    <div
      key={m.id}
      id={`member-${m.id}`}
      className={`group/member relative rounded-den transition-colors ${
        highlightMemberId === m.id ? "bg-den-honey/15 ring-1 ring-den-honey" : ""
      }`}
    >
      <button
        type="button"
        disabled={m.id === user?.id || startDm.isPending || isBlocked}
        onClick={() => {
          if (m.id !== user?.id && !isBlocked) startDm.mutate(m.username);
        }}
        onContextMenu={(e) => {
          if (!canModerate(m)) return;
          e.preventDefault();
          openModeration(m);
        }}
        onTouchStart={() => startLongPress(m)}
        onTouchEnd={cancelLongPress}
        onTouchCancel={cancelLongPress}
        onTouchMove={() => {
          longPressRef.current.moved = true;
          cancelLongPress();
        }}
        className="flex w-full items-center gap-2 rounded-den px-2 py-1.5 text-left hover:bg-den-elevated/60 disabled:cursor-default"
        title={m.id === user?.id ? undefined : isBlocked ? "User is blocked" : `Message @${m.username}`}
      >
        <Avatar
          name={displayLabel}
          src={m.avatarUrl}
          size={32}
          status={
            m.status === "online"
              ? "online"
              : m.status === "idle"
                ? "idle"
                : m.status === "dnd"
                  ? "dnd"
                  : "offline"
          }
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium text-den-cream">{displayLabel}</p>
            {m.isOwner && <Badge variant="owner">Owner</Badge>}
            {m.roles?.map((r) => (
              <span key={r.id} className="text-[10px] font-semibold" style={{ color: r.color }}>
                {r.name}
              </span>
            ))}
          </div>
          <p className="truncate text-xs text-den-muted">
            {m.nickname?.trim()
              ? m.id === user?.id
                ? `${m.displayName} · @${m.username} (you)`
                : `${m.displayName} · @${m.username}`
              : m.id === user?.id
                ? `@${m.username} (you)`
                : `@${m.username}`}
          </p>
        </div>
      </button>
      {m.id !== user?.id && (() => {
        const showFriendActions =
          friendStatus === "none" ||
          friendStatus === "incoming" ||
          friendStatus === "outgoing" ||
          friendStatus === "friends" ||
          friendStatus === "blocked";
        if (!showFriendActions && !canModerate(m) && !canEditRoles(m)) return null;
        return (
        <div
          className={`absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5 transition-opacity ${
            mobile ? "opacity-100" : "opacity-0 group-hover/member:opacity-100"
          }`}
        >
          {friendStatus === "none" && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  sendFriendRequest.mutate(m.username);
                }}
                disabled={sendFriendRequest.isPending}
                title={`Add ${displayLabel} as friend`}
                aria-label={`Add ${displayLabel} as friend`}
                className="rounded px-1 py-0.5 text-[10px] font-semibold text-den-muted hover:bg-den-surface hover:text-den-honey"
              >
                Friend
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Block ${displayLabel}?`)) blockUser.mutate(m.id);
                }}
                disabled={blockUser.isPending}
                title={`Block ${displayLabel}`}
                aria-label={`Block ${displayLabel}`}
                className="rounded px-1 py-0.5 text-[10px] font-semibold text-den-muted hover:bg-den-surface hover:text-den-berry"
              >
                Block
              </button>
            </>
          )}
          {friendStatus === "incoming" && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  acceptFriend.mutate(m.id);
                }}
                disabled={acceptFriend.isPending}
                title={`Accept friend request from ${displayLabel}`}
                aria-label={`Accept friend request from ${displayLabel}`}
                className="rounded px-1 py-0.5 text-[10px] font-semibold text-den-honey hover:bg-den-surface"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Block ${displayLabel}?`)) blockUser.mutate(m.id);
                }}
                disabled={blockUser.isPending}
                title={`Block ${displayLabel}`}
                aria-label={`Block ${displayLabel}`}
                className="rounded px-1 py-0.5 text-[10px] font-semibold text-den-muted hover:bg-den-surface hover:text-den-berry"
              >
                Block
              </button>
            </>
          )}
          {friendStatus === "outgoing" && (
            <span className="rounded px-1 py-0.5 text-[10px] font-semibold text-den-muted">
              Pending
            </span>
          )}
          {friendStatus === "friends" && (
            <>
              <span className="rounded px-1 py-0.5 text-[10px] font-semibold text-den-forest">
                Friends
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Block ${displayLabel}?`)) blockUser.mutate(m.id);
                }}
                disabled={blockUser.isPending}
                title={`Block ${displayLabel}`}
                aria-label={`Block ${displayLabel}`}
                className="rounded px-1 py-0.5 text-[10px] font-semibold text-den-muted hover:bg-den-surface hover:text-den-berry"
              >
                Block
              </button>
            </>
          )}
          {friendStatus === "blocked" && (
            <>
              <span className="rounded px-1 py-0.5 text-[10px] font-semibold text-den-berry">
                Blocked
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  unblockUser.mutate(m.id);
                }}
                disabled={unblockUser.isPending}
                title={`Unblock ${displayLabel}`}
                aria-label={`Unblock ${displayLabel}`}
                className="rounded px-1 py-0.5 text-[10px] font-semibold text-den-muted hover:bg-den-surface hover:text-den-cream"
              >
                Unblock
              </button>
            </>
          )}
          {canEditRoles(m) && (
            <button
              type="button"
              onClick={() => setRolesTarget(m)}
              title={`Manage roles for ${displayLabel}`}
              aria-label={`Manage roles for ${displayLabel}`}
              className="rounded px-1 py-0.5 text-[10px] font-semibold text-den-muted hover:bg-den-surface hover:text-den-honey"
            >
              Roles
            </button>
          )}
          {canModerate(m) && (
            <button
              type="button"
              onClick={() => openModeration(m)}
              title={`Moderate ${displayLabel}`}
              aria-label={`Moderate ${displayLabel}`}
              className="rounded p-0.5 text-den-muted hover:bg-den-surface hover:text-den-cream"
            >
              ⋯
            </button>
          )}
        </div>
        );
      })()}
    </div>
  );
  };

  return (
    <>
      <aside className={`flex w-full flex-col bg-den-surface ${mobile ? "h-full" : "hidden w-60 lg:flex"}`}>
        <div className="flex h-12 items-center justify-between border-b border-black/20 px-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-den-muted">
            Members — {isLoading ? "…" : memberCount}
          </span>
          {mobile && onClose && (
            <button onClick={onClose} className="text-den-muted hover:text-den-cream" aria-label="Close members">
              ✕
            </button>
          )}
        </div>
        {friendToast && (
          <p
            className="border-b border-black/20 px-4 py-2 text-xs text-den-forest"
            role="status"
            aria-live="polite"
          >
            {friendToast}
          </p>
        )}
        <div className="flex-1 overflow-y-auto p-2" aria-busy={isLoading} aria-live="polite">
          {isLoading && (
            <div className="flex flex-col items-center justify-center gap-2 px-2 py-8">
              <LionLoader />
              <p className="text-xs text-den-muted">Loading members...</p>
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center gap-2 px-2 py-8 text-center">
              <p className="text-sm font-medium text-den-cream">Could not load members</p>
              <p className="text-xs text-den-muted">
                {(error as Error)?.message ?? "Check your connection and try again."}
              </p>
              <Button variant="ghost" className="mt-1 px-3 py-1.5 text-xs" onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          )}

          {showEmptyMembers && (
            <div className="px-2 py-8 text-center">
              <p className="text-sm text-den-muted">No members in this Den</p>
            </div>
          )}

          {!isLoading && !isError && owners.length > 0 && (
            <div className="mb-3">
              <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-den-muted">
                Owner
              </p>
              {owners.map(renderMember)}
            </div>
          )}
          {!isLoading && !isError && others.length > 0 && (
            <div>
              <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-den-muted">
                {owners.length > 0 ? "Members" : "Online"}
              </p>
              {others.map(renderMember)}
            </div>
          )}
        </div>

        {mobile && showModeration && (
          <div className="border-t border-black/20 p-2">
            <button
              type="button"
              onClick={() => {
                onClose?.();
                window.dispatchEvent(new Event("cubino:open-moderation"));
              }}
              className="relative flex w-full items-center justify-center gap-2 rounded-den py-2 text-sm text-den-muted hover:bg-den-elevated hover:text-den-cream"
            >
              Moderation
              {openReportCount > 0 && (
                <span
                  className="flex h-4 min-w-4 items-center justify-center rounded-full bg-den-berry px-1 text-[10px] font-bold text-white"
                  aria-label={`${openReportCount} open reports`}
                >
                  {openReportCount > 99 ? "99+" : openReportCount}
                </span>
              )}
            </button>
          </div>
        )}
      </aside>

      {moderationTarget && (
        <Modal
          onClose={() => setModerationTarget(null)}
          className="max-w-sm"
          ariaLabel={`Moderate ${moderationTarget.nickname?.trim() || moderationTarget.displayName}`}
        >
          <div className="p-5">
            <h3 className="font-bold text-den-cream">
              {moderationTarget.nickname?.trim() || moderationTarget.displayName}
            </h3>
            <p className="mt-1 text-sm text-den-muted">
              {moderationTarget.nickname?.trim()
                ? `${moderationTarget.displayName} · @${moderationTarget.username}`
                : `@${moderationTarget.username}`}
            </p>

            {canBan && (
              <>
                <div className="mt-4">
                  <label htmlFor="ban-duration" className="text-xs text-den-muted">
                    Ban duration
                  </label>
                  <select
                    id="ban-duration"
                    value={banDurationHours === "" ? "" : String(banDurationHours)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setBanDurationHours(v === "" ? "" : Number(v));
                    }}
                    className="mt-1 w-full rounded-den border border-white/10 bg-den-elevated px-3 py-2 text-sm text-den-cream"
                  >
                    {BAN_DURATION_OPTIONS.map((opt) => (
                      <option key={String(opt.value)} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-3">
                  <label htmlFor="ban-reason" className="text-xs text-den-muted">
                    Ban reason (optional)
                  </label>
                  <input
                    id="ban-reason"
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    placeholder="Reason for ban"
                    maxLength={256}
                    className="mt-1 w-full rounded-den border border-white/10 bg-den-elevated px-3 py-2 text-sm text-den-cream"
                  />
                </div>
              </>
            )}

            {modError && <p className="mt-3 text-sm text-den-berry">{modError}</p>}

            <div className="mt-4 space-y-2">
              {canKick && (
                <Button
                  variant="ghost"
                  className="w-full"
                  disabled={kickMember.isPending}
                  onClick={() => {
                    if (confirm(`Kick ${moderationTarget.displayName} from this Den?`)) {
                      kickMember.mutate(moderationTarget.id);
                    }
                  }}
                >
                  {kickMember.isPending ? "Kicking..." : "Kick member"}
                </Button>
              )}
              {canBan && (
                <Button
                  variant="danger"
                  className="w-full"
                  disabled={banMember.isPending}
                  onClick={() => {
                    const label =
                      moderationTarget.nickname?.trim() || moderationTarget.displayName;
                    const durationLabel =
                      banDurationHours === ""
                        ? "permanently"
                        : `for ${BAN_DURATION_OPTIONS.find((o) => o.value === banDurationHours)?.label.toLowerCase() ?? "a limited time"}`;
                    if (
                      confirm(`Ban ${label} ${durationLabel}? They will not be able to rejoin while banned.`)
                    ) {
                      banMember.mutate({
                        memberId: moderationTarget.id,
                        reason: banReason.trim() || undefined,
                        expiresInHours:
                          banDurationHours === "" ? undefined : banDurationHours,
                      });
                    }
                  }}
                >
                  {banMember.isPending ? "Banning..." : "Ban member"}
                </Button>
              )}
              <button
                type="button"
                onClick={() => setModerationTarget(null)}
                className="w-full rounded-den py-2 text-sm text-den-muted hover:text-den-cream"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {rolesTarget && activeDenId && (
        <MemberRolesModal
          denId={activeDenId}
          member={rolesTarget}
          onClose={() => setRolesTarget(null)}
        />
      )}

      {actionTarget && (
        <Modal
          onClose={() => setActionTarget(null)}
          className="max-w-xs"
          ariaLabel={`Actions for ${memberDisplayName(actionTarget)}`}
        >
          <div className="p-5">
            <h3 className="font-bold text-den-cream">{memberDisplayName(actionTarget)}</h3>
            <p className="mt-1 text-sm text-den-muted">@{actionTarget.username}</p>
            <div className="mt-4 space-y-2">
              {canEditRoles(actionTarget) && (
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setRolesTarget(actionTarget);
                    setActionTarget(null);
                  }}
                >
                  Manage roles
                </Button>
              )}
              {canModerate(actionTarget) && (
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    openModeration(actionTarget);
                    setActionTarget(null);
                  }}
                >
                  Moderate member
                </Button>
              )}
              <button
                type="button"
                onClick={() => setActionTarget(null)}
                className="w-full rounded-den py-2 text-sm text-den-muted hover:text-den-cream"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
