ALTER TABLE "dm_channels_meta" ADD COLUMN IF NOT EXISTS "creator_id" uuid REFERENCES "users"("id");

UPDATE "dm_channels_meta" m
SET "creator_id" = (
  SELECT dp."user_id"
  FROM "dm_participants" dp
  WHERE dp."dm_channel_id" = m."dm_channel_id"
  ORDER BY dp."user_id"
  LIMIT 1
)
WHERE m."is_group" = 1 AND m."creator_id" IS NULL;
