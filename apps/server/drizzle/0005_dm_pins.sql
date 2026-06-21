CREATE TABLE IF NOT EXISTS "member_dm_pins" (
  "dm_channel_id" uuid NOT NULL REFERENCES "dm_channels"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "pinned_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY("dm_channel_id","user_id")
);
