import { createElement, type ReactNode } from "react";

export interface MentionCandidate {
  id: string;
  username: string;
  displayName: string;
  nickname?: string | null;
  kind?: "member" | "role";
  color?: string;
}

export interface RoleHighlight {
  mentionKey: string;
  name: string;
  color: string;
}

/** Normalize a role name into an @mention token (e.g. "Super Mod" → "SuperMod"). */
export function roleMentionKey(name: string): string {
  return name.replace(/\s+/g, "").replace(/[^a-zA-Z0-9_]/g, "");
}

/** If the cursor sits inside an unfinished `@mention`, return match context. */
export function getActiveMentionQuery(
  text: string,
  cursor: number
): { query: string; start: number; end: number } | null {
  const before = text.slice(0, cursor);
  const match = /(^|\s)@([a-zA-Z0-9_]*)$/.exec(before);
  if (!match) return null;
  const query = match[2];
  const start = cursor - query.length - 1;
  return { query, start, end: cursor };
}

export const EVERYONE_MENTION_CANDIDATES: MentionCandidate[] = [
  { id: "__everyone__", username: "everyone", displayName: "@everyone", kind: "member" },
  { id: "__here__", username: "here", displayName: "@here", kind: "member" },
];

/** Find den members, roles, and optional @everyone/@here matching a partial @mention query. */
export function searchMentionCandidates(
  query: string,
  members: MentionCandidate[],
  limit = 8,
  includeEveryone = false,
  roles: MentionCandidate[] = []
): MentionCandidate[] {
  const normalized = query.toLowerCase();

  const everyoneMatches =
    includeEveryone && normalized.length > 0
      ? EVERYONE_MENTION_CANDIDATES.filter(
          (item) =>
            item.username.startsWith(normalized) || item.username.includes(normalized)
        )
      : includeEveryone && normalized.length === 0
        ? EVERYONE_MENTION_CANDIDATES
        : [];

  const roleMatches = roles
    .filter((role) => {
      const key = role.username.toLowerCase();
      const label = role.displayName.toLowerCase();
      if (!normalized) return true;
      return key.startsWith(normalized) || label.includes(normalized);
    })
    .slice(0, limit);

  if (!normalized) {
    const slots = Math.max(0, limit - everyoneMatches.length - roleMatches.length);
    const memberSlice = members.slice(0, slots);
    return [...everyoneMatches, ...roleMatches, ...memberSlice];
  }

  const memberMatches = members
    .filter((member) => {
      const nick = member.nickname?.trim().toLowerCase() ?? "";
      return (
        member.username.toLowerCase().startsWith(normalized) ||
        member.displayName.toLowerCase().includes(normalized) ||
        (nick.length > 0 && nick.includes(normalized))
      );
    })
    .sort((a, b) => {
      const aUser = a.username.toLowerCase().startsWith(normalized) ? 0 : 1;
      const bUser = b.username.toLowerCase().startsWith(normalized) ? 0 : 1;
      if (aUser !== bUser) return aUser - bUser;
      return a.displayName.localeCompare(b.displayName);
    });

  return [...everyoneMatches, ...roleMatches, ...memberMatches].slice(0, limit);
}

/** Returns true when `content` contains `@username` (case-insensitive, word boundary). */
export function isUserMentioned(content: string, username: string): boolean {
  if (!username) return false;
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`@${escaped}\\b`, "i").test(content);
}

/** Returns true when content contains @everyone or @here. */
export function hasEveryoneMention(content: string): boolean {
  return /@(?:everyone|here)\b/i.test(content);
}

/** Returns true when content @mentions any of the given role keys (normalized, lowercase). */
export function isRoleMentioned(content: string, roleKeys: string[]): boolean {
  if (roleKeys.length === 0) return false;
  for (const match of content.matchAll(/@([a-zA-Z0-9_]{2,32})/g)) {
    const token = match[1].toLowerCase();
    if (token === "everyone" || token === "here") continue;
    if (roleKeys.includes(token)) return true;
  }
  return false;
}

/** True when the user is @mentioned by username, @role, or @everyone/@here. */
export function isPersonallyMentioned(
  content: string,
  username: string,
  roleKeys: string[] = []
): boolean {
  return (
    isUserMentioned(content, username) ||
    hasEveryoneMention(content) ||
    isRoleMentioned(content, roleKeys)
  );
}

/** Split plain text into segments, highlighting @username, @role, and @everyone/@here tokens. */
export function highlightMentionsInText(
  text: string,
  roleHighlights: RoleHighlight[] = []
): ReactNode[] {
  const roleByKey = new Map(
    roleHighlights.map((r) => [r.mentionKey.toLowerCase(), r])
  );

  const parts = text.split(/(@[a-zA-Z0-9_]{2,32})/g);
  return parts.map((part, index) => {
    if (!part.startsWith("@")) return part;
    const isBroadcast = /^@(everyone|here)$/i.test(part);
    if (isBroadcast) {
      return createElement(
        "span",
        {
          key: index,
          className:
            "rounded bg-den-berry/20 px-0.5 font-semibold text-den-berry",
        },
        part
      );
    }

    const role = roleByKey.get(part.slice(1).toLowerCase());
    if (role) {
      return createElement(
        "span",
        {
          key: index,
          className: "rounded px-0.5 font-semibold",
          style: {
            backgroundColor: `${role.color}22`,
            color: role.color,
          },
        },
        part
      );
    }

    return createElement(
      "span",
      {
        key: index,
        className: "rounded bg-den-honey/15 px-0.5 font-medium text-den-link",
      },
      part
    );
  });
}
