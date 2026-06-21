"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Input } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { LionLoader } from "@/components/ui/lion";
import { Permission, hasPermission } from "@cubino/shared";
import type { RoleDTO, MemberDTO } from "@cubino/shared";
import { memberDisplayName } from "@/lib/member-utils";

const ROLE_COLOR_PRESETS = [
  "#e8a838",
  "#e05252",
  "#57a853",
  "#5865f2",
  "#eb459e",
  "#ed4245",
  "#fee75c",
  "#a89888",
  "#1abc9c",
  "#9b59b6",
];

const PERM_LABELS: { flag: bigint; label: string }[] = [
  { flag: Permission.MANAGE_DEN, label: "Manage Den" },
  { flag: Permission.MANAGE_CHANNELS, label: "Manage Channels" },
  { flag: Permission.MANAGE_ROLES, label: "Manage Roles" },
  { flag: Permission.KICK_MEMBERS, label: "Kick Members" },
  { flag: Permission.BAN_MEMBERS, label: "Ban Members" },
  { flag: Permission.SEND_MESSAGES, label: "Send Messages" },
  { flag: Permission.MANAGE_MESSAGES, label: "Manage Messages" },
  { flag: Permission.CONNECT_VOICE, label: "Connect Voice" },
  { flag: Permission.SPEAK, label: "Speak" },
  { flag: Permission.MUTE_MEMBERS, label: "Mute Members" },
  { flag: Permission.MENTION_EVERYONE, label: "Mention Everyone" },
];

export function RoleEditorModal({ denId, onClose }: { denId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [assignMemberId, setAssignMemberId] = useState("");
  const [dragRoleId, setDragRoleId] = useState<string | null>(null);
  const [dragOverRoleId, setDragOverRoleId] = useState<string | null>(null);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["roles", denId],
    queryFn: () => api<{ roles: RoleDTO[] }>(`/api/v1/dens/${denId}/roles`),
  });

  const { data: membersData } = useQuery({
    queryKey: ["members", denId],
    queryFn: () => api<{ members: MemberDTO[] }>(`/api/v1/dens/${denId}/members`),
  });

  const sortedRoles = useMemo(
    () => [...(data?.roles ?? [])].sort((a, b) => a.position - b.position),
    [data?.roles]
  );

  const selected = sortedRoles.find((r) => r.id === selectedId);

  const membersWithRole = useMemo(() => {
    if (!selected) return [];
    return (membersData?.members ?? []).filter((m) =>
      m.roles?.some((r) => r.id === selected.id)
    );
  }, [membersData, selected]);

  const membersWithoutRole = useMemo(() => {
    if (!selected) return [];
    return (membersData?.members ?? []).filter(
      (m) => !m.isOwner && !m.roles?.some((r) => r.id === selected.id)
    );
  }, [membersData, selected]);

  useEffect(() => {
    if (sortedRoles.length && !selectedId) setSelectedId(sortedRoles[0].id);
  }, [sortedRoles, selectedId]);

  const createRole = useMutation({
    mutationFn: () =>
      api(`/api/v1/dens/${denId}/roles`, {
        method: "POST",
        body: JSON.stringify({ name: newName, permissions: Permission.SEND_MESSAGES.toString() }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles", denId] });
      setNewName("");
    },
  });

  const updateRole = useMutation({
    mutationFn: (patch: { name?: string; color?: string; permissions?: string }) =>
      api(`/api/v1/roles/${selected!.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles", denId] });
      qc.invalidateQueries({ queryKey: ["role-mention-keys"] });
    },
  });

  const reorderRole = useMutation({
    mutationFn: async ({ role, swapWith }: { role: RoleDTO; swapWith: RoleDTO }) => {
      await Promise.all([
        api(`/api/v1/roles/${role.id}`, {
          method: "PATCH",
          body: JSON.stringify({ position: swapWith.position }),
        }),
        api(`/api/v1/roles/${swapWith.id}`, {
          method: "PATCH",
          body: JSON.stringify({ position: role.position }),
        }),
      ]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles", denId] }),
  });

  const deleteRole = useMutation({
    mutationFn: () => api(`/api/v1/roles/${selected!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles", denId] });
      qc.invalidateQueries({ queryKey: ["role-mention-keys"] });
      setSelectedId(null);
    },
  });

  const updateMemberRoles = useMutation({
    mutationFn: ({ memberId, roleIds }: { memberId: string; roleIds: string[] }) =>
      api(`/api/v1/dens/${denId}/members/${memberId}/roles`, {
        method: "PUT",
        body: JSON.stringify({ roleIds }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members", denId] });
      qc.invalidateQueries({ queryKey: ["role-mention-keys"] });
    },
  });

  const assignRoleToMember = (memberId: string) => {
    if (!selected) return;
    const member = membersData?.members.find((m) => m.id === memberId);
    if (!member) return;
    const roleIds = [...new Set([...(member.roles?.map((r) => r.id) ?? []), selected.id])];
    updateMemberRoles.mutate({ memberId, roleIds });
  };

  const removeRoleFromMember = (memberId: string) => {
    if (!selected) return;
    const member = membersData?.members.find((m) => m.id === memberId);
    if (!member) return;
    const roleIds = (member.roles?.map((r) => r.id) ?? []).filter((id) => id !== selected.id);
    updateMemberRoles.mutate({ memberId, roleIds });
  };

  const clearDragState = () => {
    setDragRoleId(null);
    setDragOverRoleId(null);
  };

  const togglePerm = (flag: bigint) => {
    if (!selected) return;
    const perms = BigInt(selected.permissions);
    const next = hasPermission(perms, flag) ? perms & ~flag : perms | flag;
    updateRole.mutate({ permissions: next.toString() });
  };

  const roleReorder =
    selected && sortedRoles.length > 1
      ? (() => {
          const idx = sortedRoles.findIndex((r) => r.id === selected.id);
          return {
            swapUp: idx > 0 ? sortedRoles[idx - 1] : null,
            swapDown: idx >= 0 && idx < sortedRoles.length - 1 ? sortedRoles[idx + 1] : null,
          };
        })()
      : null;

  const memberCountForRole = (roleId: string) =>
    (membersData?.members ?? []).filter((m) => m.roles?.some((r) => r.id === roleId)).length;

  return (
    <Modal onClose={onClose} className="max-w-2xl" labelledById="role-editor-title">
      <div className="flex h-[80vh] flex-col">
        <div className="border-b border-black/20 px-5 py-4">
          <h3 id="role-editor-title" className="text-lg font-bold text-den-cream">
            Roles
          </h3>
        </div>

        {isLoading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2">
            <LionLoader />
            <p className="text-xs text-den-muted">Loading roles...</p>
          </div>
        )}

        {isError && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="text-sm text-den-cream">Could not load roles</p>
            <p className="text-xs text-den-muted">{(error as Error).message}</p>
            <Button variant="ghost" className="mt-2 text-xs" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        )}

        {!isLoading && !isError && (
          <div className="flex min-h-0 flex-1">
            <div className="w-48 overflow-y-auto border-r border-black/20 p-2">
              {sortedRoles.map((r) => {
                const count = memberCountForRole(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    draggable={sortedRoles.length > 1}
                    onDragStart={(e) => {
                      setDragRoleId(r.id);
                      e.dataTransfer.setData("text/plain", r.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      if (!dragRoleId || dragRoleId === r.id) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDragOverRoleId(r.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverRoleId === r.id) setDragOverRoleId(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const draggedId = dragRoleId ?? e.dataTransfer.getData("text/plain");
                      const dragged = sortedRoles.find((role) => role.id === draggedId);
                      if (!dragged || dragged.id === r.id) {
                        clearDragState();
                        return;
                      }
                      reorderRole.mutate({ role: dragged, swapWith: r });
                      clearDragState();
                    }}
                    onDragEnd={clearDragState}
                    className={`mb-1 flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-sm ${
                      selected?.id === r.id ? "bg-den-elevated text-den-cream" : "text-den-muted"
                    } ${dragOverRoleId === r.id ? "ring-1 ring-den-honey" : ""} ${
                      dragRoleId === r.id ? "opacity-50" : ""
                    }`}
                  >
                    <span style={{ color: r.color }} aria-hidden="true">
                      ●
                    </span>
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    {count > 0 && (
                      <span className="shrink-0 text-[10px] text-den-muted">{count}</span>
                    )}
                  </button>
                );
              })}
              <div className="mt-2 flex gap-1">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="New role"
                  aria-label="New role name"
                />
                <Button onClick={() => createRole.mutate()} disabled={!newName.trim()}>
                  +
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {selected && (
                <>
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <Input
                      value={selected.name}
                      onChange={(e) => updateRole.mutate({ name: e.target.value })}
                      className="min-w-0 flex-1"
                      disabled={selected.name === "@whole-den"}
                      aria-label="Role name"
                    />
                    {roleReorder && (roleReorder.swapUp || roleReorder.swapDown) && (
                      <div className="flex gap-1">
                        {roleReorder.swapUp && (
                          <Button
                            variant="ghost"
                            className="px-2 py-1 text-xs"
                            disabled={reorderRole.isPending}
                            onClick={() =>
                              reorderRole.mutate({
                                role: selected,
                                swapWith: roleReorder.swapUp!,
                              })
                            }
                          >
                            Move up
                          </Button>
                        )}
                        {roleReorder.swapDown && (
                          <Button
                            variant="ghost"
                            className="px-2 py-1 text-xs"
                            disabled={reorderRole.isPending}
                            onClick={() =>
                              reorderRole.mutate({
                                role: selected,
                                swapWith: roleReorder.swapDown!,
                              })
                            }
                          >
                            Move down
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  <p className="mb-2 text-xs font-semibold uppercase text-den-muted">Role color</p>
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    {ROLE_COLOR_PRESETS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        title={`Set color ${color}`}
                        aria-label={`Set role color ${color}`}
                        onClick={() => updateRole.mutate({ color })}
                        className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${
                          selected.color === color ? "border-white" : "border-transparent"
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <label className="flex items-center gap-1.5 text-xs text-den-muted">
                      <span className="sr-only">Custom color</span>
                      <input
                        type="color"
                        value={selected.color}
                        onChange={(e) => updateRole.mutate({ color: e.target.value })}
                        className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
                      />
                      Custom
                    </label>
                  </div>

                  <p className="mb-2 text-xs font-semibold uppercase text-den-muted">Permissions</p>
                  <div className="space-y-1">
                    {PERM_LABELS.map(({ flag, label }) => (
                      <label key={label} className="flex items-center gap-2 text-sm text-den-cream">
                        <input
                          type="checkbox"
                          checked={hasPermission(BigInt(selected.permissions), flag)}
                          onChange={() => togglePerm(flag)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>

                  <div className="mt-5 border-t border-white/10 pt-4">
                    <p className="mb-2 text-xs font-semibold uppercase text-den-muted">
                      Members with this role ({membersWithRole.length})
                    </p>

                    {selected.name !== "@whole-den" && membersWithoutRole.length > 0 && (
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <label htmlFor="assign-role-member" className="sr-only">
                          Assign role to member
                        </label>
                        <select
                          id="assign-role-member"
                          value={assignMemberId}
                          onChange={(e) => setAssignMemberId(e.target.value)}
                          className="min-w-0 flex-1 rounded-den border border-white/10 bg-den-elevated px-2 py-1.5 text-sm text-den-cream"
                        >
                          <option value="">Select member...</option>
                          {membersWithoutRole.map((m) => (
                            <option key={m.id} value={m.id}>
                              {memberDisplayName(m)} (@{m.username})
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="ghost"
                          className="shrink-0 px-2 py-1 text-xs"
                          disabled={!assignMemberId || updateMemberRoles.isPending}
                          onClick={() => {
                            if (assignMemberId) {
                              assignRoleToMember(assignMemberId);
                              setAssignMemberId("");
                            }
                          }}
                        >
                          Assign
                        </Button>
                      </div>
                    )}

                    {membersWithRole.length === 0 ? (
                      <p className="text-sm text-den-muted">No members have this role</p>
                    ) : (
                      <ul className="max-h-32 space-y-1 overflow-y-auto">
                        {membersWithRole.map((m) => (
                          <li
                            key={m.id}
                            className="flex items-center justify-between gap-2 text-sm text-den-cream"
                          >
                            <span className="min-w-0 truncate" title={`@${m.username}`}>
                              {memberDisplayName(m)}
                              {m.isOwner && (
                                <span className="ml-1 text-[10px] text-den-muted">(owner)</span>
                              )}
                            </span>
                            {selected.name !== "@whole-den" && !m.isOwner && (
                              <button
                                type="button"
                                disabled={updateMemberRoles.isPending}
                                onClick={() => removeRoleFromMember(m.id)}
                                className="shrink-0 text-[10px] text-den-muted hover:text-den-berry"
                              >
                                Remove
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {selected.name !== "@whole-den" && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete role "${selected.name}"?`)) deleteRole.mutate();
                      }}
                      className="mt-4 text-sm text-den-berry hover:underline"
                    >
                      Delete role
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <div className="border-t border-black/20 px-5 py-3 text-right">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
