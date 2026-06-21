"use client";

import { useQuery } from "@tanstack/react-query";
import { hasPermission, Permission } from "@cubino/shared";
import { api } from "@/lib/api";

export function useDenPermissions(denId: string | null) {
  return useQuery({
    queryKey: ["den-permissions", denId],
    enabled: !!denId,
    queryFn: () => api<{ permissions: string }>(`/api/v1/dens/${denId}/permissions/me`),
    staleTime: 60_000,
  });
}

export function useHasDenPermission(denId: string | null, flag: bigint): boolean {
  const { data } = useDenPermissions(denId);
  if (!data?.permissions) return false;
  try {
    return hasPermission(BigInt(data.permissions), flag);
  } catch {
    return false;
  }
}

export function useCanManageMessages(denId: string | null): boolean {
  return useHasDenPermission(denId, Permission.MANAGE_MESSAGES);
}

export function useCanManageChannels(denId: string | null): boolean {
  return useHasDenPermission(denId, Permission.MANAGE_CHANNELS);
}

export function useCanManageRoles(denId: string | null): boolean {
  return useHasDenPermission(denId, Permission.MANAGE_ROLES);
}

export function useCanManageDen(denId: string | null): boolean {
  return useHasDenPermission(denId, Permission.MANAGE_DEN);
}

export function useCanMentionEveryone(denId: string | null): boolean {
  return useHasDenPermission(denId, Permission.MENTION_EVERYONE);
}

export function useCanBanMembers(denId: string | null): boolean {
  return useHasDenPermission(denId, Permission.BAN_MEMBERS);
}
