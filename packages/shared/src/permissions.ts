export const Permission = {
  ADMINISTRATOR: 1n << 0n,
  MANAGE_DEN: 1n << 1n,
  MANAGE_CHANNELS: 1n << 2n,
  MANAGE_ROLES: 1n << 3n,
  KICK_MEMBERS: 1n << 4n,
  BAN_MEMBERS: 1n << 5n,
  SEND_MESSAGES: 1n << 6n,
  MANAGE_MESSAGES: 1n << 7n,
  CONNECT_VOICE: 1n << 8n,
  SPEAK: 1n << 9n,
  MUTE_MEMBERS: 1n << 10n,
  DEAFEN_MEMBERS: 1n << 11n,
  MENTION_EVERYONE: 1n << 12n,
} as const;

export const DEFAULT_EVERYONE =
  Permission.SEND_MESSAGES | Permission.CONNECT_VOICE | Permission.SPEAK;

export const DEFAULT_ADMIN =
  Permission.ADMINISTRATOR |
  Permission.MANAGE_DEN |
  Permission.MANAGE_CHANNELS |
  Permission.MANAGE_ROLES |
  Permission.KICK_MEMBERS |
  Permission.BAN_MEMBERS |
  Permission.SEND_MESSAGES |
  Permission.MANAGE_MESSAGES |
  Permission.CONNECT_VOICE |
  Permission.SPEAK |
  Permission.MUTE_MEMBERS |
  Permission.DEAFEN_MEMBERS |
  Permission.MENTION_EVERYONE;

export function hasPermission(perms: bigint, flag: bigint): boolean {
  if (perms & Permission.ADMINISTRATOR) return true;
  return (perms & flag) === flag;
}

export type UserStatus = "online" | "idle" | "dnd" | "invisible";
export type ChannelType = "TEXT" | "VOICE";

export interface UserPublic {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  status: UserStatus;
  customStatus: string | null;
}

export interface AttachmentDTO {
  id: string;
  url: string;
  mime: string;
  size: number;
  filename: string;
}

export interface MessageDTO {
  id: string;
  channelId: string;
  authorId: string;
  content: string;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  author?: UserPublic;
  reactions?: ReactionDTO[];
  attachments?: AttachmentDTO[];
}

export interface ReactionDTO {
  emoji: string;
  count: number;
  userIds: string[];
  me: boolean;
}

export interface DenDTO {
  id: string;
  name: string;
  iconUrl: string | null;
  ownerId: string;
  description: string | null;
}

export interface ChannelDTO {
  id: string;
  denId: string;
  categoryId: string | null;
  name: string;
  type: ChannelType;
  position: number;
  topic: string | null;
  slowModeSeconds?: number;
}

export interface CategoryDTO {
  id: string;
  denId: string;
  name: string;
  position: number;
}

export interface MemberDTO extends UserPublic {
  nickname?: string | null;
  isOwner?: boolean;
  roles?: { id: string; name: string; color: string }[];
}

export interface RoleDTO {
  id: string;
  denId: string;
  name: string;
  color: string;
  position: number;
  permissions: string;
}

export interface DmChannelDTO {
  id: string;
  participants: UserPublic[];
  isGroup?: boolean;
  name?: string | null;
  creatorId?: string | null;
  pinned?: boolean;
  lastMessage?: MessageDTO | null;
}

export interface DmMessageDTO {
  id: string;
  dmChannelId: string;
  authorId: string;
  content: string;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  author?: UserPublic;
  reactions?: ReactionDTO[];
  attachments?: AttachmentDTO[];
}
