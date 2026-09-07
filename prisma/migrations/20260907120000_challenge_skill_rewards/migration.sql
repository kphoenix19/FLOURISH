ALTER TABLE "quest_skill_rewards" ADD COLUMN "challenge_bonus_xp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "quest_skill_rewards" DROP CONSTRAINT "quest_skill_rewards_components_check";
ALTER TABLE "quest_skill_rewards" ADD CONSTRAINT "quest_skill_rewards_components_check" CHECK (
  "base_skill_xp" >= 0 AND "catch_up_bonus_xp" >= 0 AND "streak_bonus_xp" >= 0 AND "challenge_bonus_xp" >= 0
  AND "bonus_skill_xp" = "catch_up_bonus_xp" + "streak_bonus_xp" + "challenge_bonus_xp"
  AND "final_skill_xp" = "base_skill_xp" + "bonus_skill_xp"
);
