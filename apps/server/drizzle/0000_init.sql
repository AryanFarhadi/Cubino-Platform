CREATE TYPE "public"."user_status" AS ENUM('online', 'idle', 'dnd', 'invisible');
CREATE TYPE "public"."channel_type" AS ENUM('TEXT', 'VOICE');

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(255) NOT NULL UNIQUE,
  "username" varchar(32) NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "display_name" varchar(64) NOT NULL,
  "avatar_url" text,
  "bio" varchar(256),
  "status" "user_status" DEFAULT 'online' NOT NULL,
  "custom_status" varchar(128),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "refresh_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "dens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(100) NOT NULL,
  "icon_url" text,
  "banner_url" text,
  "owner_id" uuid NOT NULL REFERENCES "users"("id"),
  "description" text,
  "is_public" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "den_members" (
  "den_id" uuid NOT NULL REFERENCES "dens"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "nickname" varchar(64),
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY("den_id","user_id")
);

CREATE TABLE IF NOT EXISTS "categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "den_id" uuid NOT NULL REFERENCES "dens"("id") ON DELETE cascade,
  "name" varchar(100) NOT NULL,
  "position" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "channels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "den_id" uuid NOT NULL REFERENCES "dens"("id") ON DELETE cascade,
  "category_id" uuid REFERENCES "categories"("id") ON DELETE set null,
  "name" varchar(100) NOT NULL,
  "type" "channel_type" DEFAULT 'TEXT' NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "topic" varchar(256)
);

CREATE TABLE IF NOT EXISTS "messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE cascade,
  "author_id" uuid NOT NULL REFERENCES "users"("id"),
  "content" text NOT NULL,
  "edited_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "message_reactions" (
  "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "emoji" varchar(32) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY("message_id","user_id","emoji")
);

CREATE TABLE IF NOT EXISTS "roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "den_id" uuid NOT NULL REFERENCES "dens"("id") ON DELETE cascade,
  "name" varchar(64) NOT NULL,
  "color" varchar(16) DEFAULT '#e8a838' NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "permissions" bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS "member_roles" (
  "den_id" uuid NOT NULL REFERENCES "dens"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "role_id" uuid NOT NULL REFERENCES "roles"("id") ON DELETE cascade,
  PRIMARY KEY("den_id","user_id","role_id")
);

CREATE TABLE IF NOT EXISTS "invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "den_id" uuid NOT NULL REFERENCES "dens"("id") ON DELETE cascade,
  "code" varchar(16) NOT NULL UNIQUE,
  "creator_id" uuid NOT NULL REFERENCES "users"("id"),
  "max_uses" integer,
  "uses" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "dm_channels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "dm_participants" (
  "dm_channel_id" uuid NOT NULL REFERENCES "dm_channels"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  PRIMARY KEY("dm_channel_id","user_id")
);

CREATE TABLE IF NOT EXISTS "dm_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dm_channel_id" uuid NOT NULL REFERENCES "dm_channels"("id") ON DELETE cascade,
  "author_id" uuid NOT NULL REFERENCES "users"("id"),
  "content" text NOT NULL,
  "edited_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
