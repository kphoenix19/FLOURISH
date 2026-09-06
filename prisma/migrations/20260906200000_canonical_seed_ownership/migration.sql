-- Existing content remains non-seed-managed; ownership is never inferred from a key.
ALTER TABLE "quest_definitions" ADD COLUMN "seed_managed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "quest_families" ADD COLUMN "seed_managed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "variety_tags" ADD COLUMN "seed_managed" BOOLEAN NOT NULL DEFAULT false;
