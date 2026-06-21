"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { LionLoader } from "@/components/ui/lion";
import type { MemberDTO, RoleDTO } from "@cubino/shared";
import { memberDisplayName } from "@/lib/member-utils";

export function MemberRolesModal({
  denId,
  member,
  onClose,
}: {
  denId: string;
  member: MemberDTO;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const {
    data: rolesData,
    isLoading: rolesLoading,
    isError: rolesError,
    refetch: refetchRoles,
  } = useQuery({
    queryKey: ["roles", denId],
    queryFn: () => api<{ roles: RoleDTO[] }>(`/api/v1/dens/${denId}/roles`),
  });

  const roles = rolesData?.roles ?? [];
  const everyoneRole = roles.find((r) => r.name === "@whole-den");

  useEffect(() => {
    setSelectedRoleIds(member.roles?.map((r) => r.id) ?? []);
    setError(null);
  }, [member]);

  const saveRoles = useMutation({
    mutationFn: () =>
      api(`/api/v1/dens/${denId}/members/${member.id}/roles`, {
        method: "PUT",
        body: JSON.stringify({ roleIds: selectedRoleIds }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members", denId] });
      qc.invalidateQueries({ queryKey: ["role-mention-keys"] });
      onClose();
    },
    onError: (err) => setError((err as Error).message),
  });

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  };

  const displayName = memberDisplayName(member);

  return (
    <Modal onClose={onClose} className="max-w-sm" labelledById="member-roles-title">
      <div className="p-5">
        <h3 id="member-roles-title" className="font-bold text-den-cream">
          Manage roles
        </h3>
        <p className="mt-1 text-sm text-den-muted">
          {displayName} · @{member.username}
        </p>

        <div className="mt-4 max-h-[50vh] overflow-y-auto" aria-live="polite">
          {rolesLoading && (
            <div className="flex flex-col items-center gap-2 py-8">
              <LionLoader />
              <p className="text-xs text-den-muted">Loading roles...</p>
            </div>
          )}

          {rolesError && (
            <div className="py-6 text-center">
              <p className="text-sm text-den-cream">Could not load roles</p>
              <Button variant="ghost" className="mt-2 text-xs" onClick={() => refetchRoles()}>
                Try again
              </Button>
            </div>
          )}

          {!rolesLoading && !rolesError && roles.length === 0 && (
            <p className="py-6 text-center text-sm text-den-muted">No roles in this Den</p>
          )}

          {!rolesLoading && !rolesError && roles.length > 0 && (
            <fieldset className="space-y-1">
              <legend className="sr-only">Roles for {displayName}</legend>
              {roles.map((role) => {
                const isEveryone = role.name === "@whole-den";
                return (
                  <label
                    key={role.id}
                    className="flex cursor-pointer items-center gap-2 rounded-den px-2 py-2 hover:bg-den-elevated/60"
                  >
                    <input
                      type="checkbox"
                      checked={selectedRoleIds.includes(role.id)}
                      onChange={() => toggleRole(role.id)}
                      className="rounded border-white/20"
                    />
                    <span className="text-sm font-medium" style={{ color: role.color }}>
                      {role.name}
                    </span>
                    {isEveryone && (
                      <span className="ml-auto text-[10px] text-den-muted">Base role</span>
                    )}
                  </label>
                );
              })}
            </fieldset>
          )}
        </div>

        {everyoneRole && !selectedRoleIds.includes(everyoneRole.id) && (
          <p className="mt-3 text-xs text-den-gold">
            @whole-den will be added automatically — every member needs base permissions.
          </p>
        )}

        {error && <p className="mt-3 text-sm text-den-berry">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-den px-4 py-2 text-sm text-den-muted">
            Cancel
          </button>
          <Button
            onClick={() => saveRoles.mutate()}
            disabled={saveRoles.isPending || rolesLoading || rolesError}
          >
            {saveRoles.isPending ? "Saving..." : "Save roles"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
