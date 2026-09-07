-- Preserve the accepted task instructions as well as its existing reward fields.
-- Nullable fields retain compatibility with historical rows from earlier phases.
ALTER TABLE "player_quests"
  ADD COLUMN "title_snapshot" TEXT,
  ADD COLUMN "description_snapshot" TEXT,
  ADD COLUMN "estimated_minutes_snapshot" INTEGER;
ALTER TABLE "player_quests" ADD CONSTRAINT "positive_estimated_minutes_snapshot"
  CHECK ("estimated_minutes_snapshot" IS NULL OR "estimated_minutes_snapshot" > 0);
