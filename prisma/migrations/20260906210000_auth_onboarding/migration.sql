ALTER TABLE "users" ADD COLUMN "email_verified" TIMESTAMPTZ(3);
ALTER TABLE "auth_accounts" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'oauth';
-- No assumed timezone and no invented previous Focus choice for new players.
ALTER TABLE "players" ALTER COLUMN "timezone" DROP NOT NULL;
ALTER TABLE "player_skill_focus_history" ALTER COLUMN "old_focus_points" DROP NOT NULL;
-- The existing range CHECK still rejects non-null values outside 1..10.
ALTER TABLE "players" ADD CONSTRAINT "onboarded_timezone_required"
  CHECK ("onboarding_completed_at" IS NULL OR "timezone" IS NOT NULL);
