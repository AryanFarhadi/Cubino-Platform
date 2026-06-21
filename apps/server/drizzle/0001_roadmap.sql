ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "slow_mode_seconds" integer DEFAULT 0 NOT NULL;

CREATE TYPE "public"."friendship_status" AS ENUM('pending', 'accepted', 'blocked');

CREATE TABLE IF NOT EXISTS "attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid REFERENCES "messages"("id") ON DELETE cascade,
  "dm_message_id" uuid REFERENCES "dm_messages"("id") ON DELETE cascade,
  "url" text NOT NULL,
  "mime" varchar(128) NOT NULL,
  "size" integer NOT NULL,
  "filename" varchar(256) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "friendships" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "friend_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "status" "friendship_status" DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY("user_id","friend_id")
);

CREATE TABLE IF NOT EXISTS "pinned_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE cascade,
  "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE cascade,
  "pinned_by" uuid NOT NULL REFERENCES "users"("id"),
  "pinned_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "message_mentions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE cascade,
  "user_id" uuid REFERENCES "users"("id") ON DELETE cascade,
  "role_id" uuid REFERENCES "roles"("id") ON DELETE cascade,
  "mention_everyone" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "channel_read_state" (
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY("channel_id","user_id")
);

CREATE TABLE IF NOT EXISTS "dm_read_state" (
  "dm_channel_id" uuid NOT NULL REFERENCES "dm_channels"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY("dm_channel_id","user_id")
);

CREATE TABLE IF NOT EXISTS "bans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "den_id" uuid NOT NULL REFERENCES "dens"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "reason" varchar(256),
  "banned_by" uuid NOT NULL REFERENCES "users"("id"),
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "den_id" uuid NOT NULL REFERENCES "dens"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "action" varchar(64) NOT NULL,
  "target_id" varchar(64),
  "metadata" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid REFERENCES "messages"("id") ON DELETE set null,
  "reporter_id" uuid NOT NULL REFERENCES "users"("id"),
  "reason" text NOT NULL,
  "status" varchar(32) DEFAULT 'open' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "type" varchar(64) NOT NULL,
  "title" varchar(256) NOT NULL,
  "body" text,
  "read" integer DEFAULT 0 NOT NULL,
  "metadata" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "member_notification_settings" (
  "den_id" uuid NOT NULL REFERENCES "dens"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "level" varchar(32) DEFAULT 'all' NOT NULL,
  PRIMARY KEY("den_id","user_id")
);

CREATE TABLE IF NOT EXISTS "user_achievements" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "achievement_id" varchar(64) NOT NULL,
  "unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY("user_id","achievement_id")
);

CREATE TABLE IF NOT EXISTS "custom_emotes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "den_id" uuid REFERENCES "dens"("id") ON DELETE cascade,
  "name" varchar(32) NOT NULL,
  "url" text NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "dm_channels_meta" (
  "dm_channel_id" uuid PRIMARY KEY REFERENCES "dm_channels"("id") ON DELETE cascade,
  "name" varchar(100),
  "is_group" integer DEFAULT 0 NOT NULL
);

CREATE INDEX IF NOT EXISTS "messages_content_fts" ON "messages" USING gin(to_tsvector('english', content));
