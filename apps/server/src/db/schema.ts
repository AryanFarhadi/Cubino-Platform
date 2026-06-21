import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  bigint,
  pgEnum,
  primaryKey,
} from "drizzle-orm/pg-core";

export const userStatusEnum = pgEnum("user_status", [
  "online",
  "idle",
  "dnd",
  "invisible",
]);

export const channelTypeEnum = pgEnum("channel_type", ["TEXT", "VOICE"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  username: varchar("username", { length: 32 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: varchar("display_name", { length: 64 }).notNull(),
  avatarUrl: text("avatar_url"),
  bio: varchar("bio", { length: 256 }),
  status: userStatusEnum("status").notNull().default("online"),
  customStatus: varchar("custom_status", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const dens = pgTable("dens", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  iconUrl: text("icon_url"),
  bannerUrl: text("banner_url"),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  description: text("description"),
  welcomeMessage: text("welcome_message"),
  isPublic: integer("is_public").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const denMembers = pgTable(
  "den_members",
  {
    denId: uuid("den_id")
      .notNull()
      .references(() => dens.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nickname: varchar("nickname", { length: 64 }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.denId, t.userId] })]
);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  denId: uuid("den_id")
    .notNull()
    .references(() => dens.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  position: integer("position").notNull().default(0),
});

export const channels = pgTable("channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  denId: uuid("den_id")
    .notNull()
    .references(() => dens.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  name: varchar("name", { length: 100 }).notNull(),
  type: channelTypeEnum("type").notNull().default("TEXT"),
  position: integer("position").notNull().default(0),
  topic: varchar("topic", { length: 256 }),
  slowModeSeconds: integer("slow_mode_seconds").notNull().default(0),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: uuid("channel_id")
    .notNull()
    .references(() => channels.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  content: text("content").notNull(),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messageReactions = pgTable(
  "message_reactions",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: varchar("emoji", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId, t.emoji] })]
);

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  denId: uuid("den_id")
    .notNull()
    .references(() => dens.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 64 }).notNull(),
  color: varchar("color", { length: 16 }).notNull().default("#e8a838"),
  position: integer("position").notNull().default(0),
  permissions: bigint("permissions", { mode: "bigint" }).notNull(),
});

export const memberRoles = pgTable(
  "member_roles",
  {
    denId: uuid("den_id")
      .notNull()
      .references(() => dens.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.denId, t.userId, t.roleId] })]
);

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  denId: uuid("den_id")
    .notNull()
    .references(() => dens.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 16 }).notNull().unique(),
  creatorId: uuid("creator_id")
    .notNull()
    .references(() => users.id),
  maxUses: integer("max_uses"),
  uses: integer("uses").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const dmChannels = pgTable("dm_channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dmParticipants = pgTable(
  "dm_participants",
  {
    dmChannelId: uuid("dm_channel_id")
      .notNull()
      .references(() => dmChannels.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.dmChannelId, t.userId] })]
);

export const dmMessages = pgTable("dm_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  dmChannelId: uuid("dm_channel_id")
    .notNull()
    .references(() => dmChannels.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  content: text("content").notNull(),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dmMessageReactions = pgTable(
  "dm_message_reactions",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => dmMessages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: varchar("emoji", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId, t.emoji] })]
);

export const friendshipStatusEnum = pgEnum("friendship_status", [
  "pending",
  "accepted",
  "blocked",
]);

export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id").references(() => messages.id, { onDelete: "cascade" }),
  dmMessageId: uuid("dm_message_id").references(() => dmMessages.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  mime: varchar("mime", { length: 128 }).notNull(),
  size: integer("size").notNull(),
  filename: varchar("filename", { length: 256 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const friendships = pgTable(
  "friendships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    friendId: uuid("friend_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: friendshipStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.friendId] })]
);

export const pinnedMessages = pgTable("pinned_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: uuid("channel_id")
    .notNull()
    .references(() => channels.id, { onDelete: "cascade" }),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  pinnedBy: uuid("pinned_by")
    .notNull()
    .references(() => users.id),
  pinnedAt: timestamp("pinned_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messageMentions = pgTable("message_mentions", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").references(() => roles.id, { onDelete: "cascade" }),
  mentionEveryone: integer("mention_everyone").notNull().default(0),
});

export const channelReadState = pgTable(
  "channel_read_state",
  {
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.userId] })]
);

export const dmReadState = pgTable(
  "dm_read_state",
  {
    dmChannelId: uuid("dm_channel_id")
      .notNull()
      .references(() => dmChannels.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.dmChannelId, t.userId] })]
);

export const bans = pgTable("bans", {
  id: uuid("id").primaryKey().defaultRandom(),
  denId: uuid("den_id")
    .notNull()
    .references(() => dens.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reason: varchar("reason", { length: 256 }),
  bannedBy: uuid("banned_by")
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  denId: uuid("den_id")
    .notNull()
    .references(() => dens.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  action: varchar("action", { length: 64 }).notNull(),
  targetId: varchar("target_id", { length: 64 }),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
  reporterId: uuid("reporter_id")
    .notNull()
    .references(() => users.id),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 64 }).notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  body: text("body"),
  read: integer("read").notNull().default(0),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memberNotificationSettings = pgTable(
  "member_notification_settings",
  {
    denId: uuid("den_id")
      .notNull()
      .references(() => dens.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    level: varchar("level", { length: 32 }).notNull().default("all"),
  },
  (t) => [primaryKey({ columns: [t.denId, t.userId] })]
);

export const memberChannelMutes = pgTable(
  "member_channel_mutes",
  {
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.userId] })]
);

export const memberDmMutes = pgTable(
  "member_dm_mutes",
  {
    dmChannelId: uuid("dm_channel_id")
      .notNull()
      .references(() => dmChannels.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.dmChannelId, t.userId] })]
);

export const memberDmPins = pgTable(
  "member_dm_pins",
  {
    dmChannelId: uuid("dm_channel_id")
      .notNull()
      .references(() => dmChannels.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.dmChannelId, t.userId] })]
);

export const userAchievements = pgTable(
  "user_achievements",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    achievementId: varchar("achievement_id", { length: 64 }).notNull(),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.achievementId] })]
);

export const customEmotes = pgTable("custom_emotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  denId: uuid("den_id").references(() => dens.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 32 }).notNull(),
  url: text("url").notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dmChannelsExtended = pgTable("dm_channels_meta", {
  dmChannelId: uuid("dm_channel_id")
    .primaryKey()
    .references(() => dmChannels.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }),
  isGroup: integer("is_group").notNull().default(0),
  creatorId: uuid("creator_id").references(() => users.id),
});
