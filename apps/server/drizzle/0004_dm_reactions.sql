CREATE TABLE IF NOT EXISTS "dm_message_reactions" (
  "message_id" uuid NOT NULL REFERENCES "dm_messages"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "emoji" varchar(32) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("message_id", "user_id", "emoji")
);
