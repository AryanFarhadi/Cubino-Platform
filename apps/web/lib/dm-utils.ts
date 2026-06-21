type DmParticipant = {
  id: string;
  displayName: string;
  username?: string;
  avatarUrl?: string | null;
};

type DmSummary = {
  isGroup?: boolean;
  name?: string | null;
  participants: DmParticipant[];
};

/** Display title for a DM or group conversation. */
export function getDmTitle(dm: DmSummary, currentUserId?: string | null): string {
  if (dm.isGroup) {
    if (dm.name?.trim()) return dm.name.trim();
    const others = dm.participants.filter((p) => p.id !== currentUserId);
    if (others.length === 0) return "Group chat";
    if (others.length === 1) return others[0].displayName;
    if (others.length === 2) return `${others[0].displayName}, ${others[1].displayName}`;
    return `${others[0].displayName}, ${others[1].displayName} +${others.length - 2}`;
  }
  const other = dm.participants.find((p) => p.id !== currentUserId);
  return other?.displayName ?? "Direct Message";
}

/** Avatar label for sidebar / header (initials source). */
export function getDmAvatarName(dm: DmSummary, currentUserId?: string | null): string {
  if (dm.isGroup) {
    if (dm.name?.trim()) return dm.name.trim();
    return getDmTitle(dm, currentUserId);
  }
  const other = dm.participants.find((p) => p.id !== currentUserId);
  return other?.displayName ?? "?";
}

export function getDmAvatarUrl(
  dm: DmSummary,
  currentUserId?: string | null
): string | null | undefined {
  if (dm.isGroup) return null;
  const other = dm.participants.find((p) => p.id !== currentUserId);
  return other?.avatarUrl;
}

type TypingParticipant = { id: string; displayName: string };

/** Human-readable typing indicator for DMs and group chats. */
export function formatDmTypingLabel(
  typingUserIds: string[],
  participants: TypingParticipant[],
  currentUserId?: string | null
): string | null {
  const others = typingUserIds.filter((id) => id !== currentUserId);
  if (others.length === 0) return null;

  const names = others
    .map((id) => participants.find((p) => p.id === id)?.displayName)
    .filter((n): n is string => !!n);

  if (names.length === 1) return `${names[0]} is typing...`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
  if (names.length > 2) return `${names.length} people are typing...`;
  return "Someone is typing...";
}
