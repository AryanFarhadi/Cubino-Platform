CREATE TABLE IF NOT EXISTS "member_channel_mutes" (
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY("channel_id","user_id")
);

ALTER TABLE "dens" ADD COLUMN IF NOT EXISTS "welcome_message" text;
