/** Den-scoped display label: nickname overrides global display name. */
export function memberDisplayName(member: {
  displayName: string;
  nickname?: string | null;
}): string {
  return member.nickname?.trim() || member.displayName;
}
