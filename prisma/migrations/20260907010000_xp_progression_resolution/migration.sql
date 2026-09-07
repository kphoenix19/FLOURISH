CREATE TABLE "player_quest_failure_penalty_skills" (
  "player_quest_id" UUID NOT NULL,
  "skill_id" UUID NOT NULL,
  "intended_penalty_xp" INTEGER NOT NULL,
  "actual_applied_penalty_xp" INTEGER,
  CONSTRAINT "player_quest_failure_penalty_skills_pkey" PRIMARY KEY ("player_quest_id", "skill_id"),
  CONSTRAINT "player_quest_failure_penalty_skills_intended_check" CHECK ("intended_penalty_xp" >= 0),
  CONSTRAINT "player_quest_failure_penalty_skills_actual_check" CHECK ("actual_applied_penalty_xp" IS NULL OR ("actual_applied_penalty_xp" >= 0 AND "actual_applied_penalty_xp" <= "intended_penalty_xp")),
  CONSTRAINT "player_quest_failure_penalty_skills_player_quest_id_fkey" FOREIGN KEY ("player_quest_id") REFERENCES "player_quests"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "player_quest_failure_penalty_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "player_quest_failure_penalty_skills_skill_id_idx" ON "player_quest_failure_penalty_skills"("skill_id");

ALTER TABLE "quest_skill_rewards" ADD COLUMN "catch_up_bonus_xp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "quest_skill_rewards" ADD COLUMN "streak_bonus_xp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "quest_skill_rewards" ADD CONSTRAINT "quest_skill_rewards_components_check" CHECK (
  "base_skill_xp" >= 0 AND "catch_up_bonus_xp" >= 0 AND "streak_bonus_xp" >= 0
  AND "bonus_skill_xp" = "catch_up_bonus_xp" + "streak_bonus_xp"
  AND "final_skill_xp" = "base_skill_xp" + "bonus_skill_xp"
);
CREATE UNIQUE INDEX "xp_transactions_operation_id_xp_scope_skill_id_transaction_type_key" ON "xp_transactions"("operation_id", "xp_scope", "skill_id", "transaction_type");

ALTER TABLE "player_progress" ADD CONSTRAINT "player_progress_phase05_check" CHECK ("overall_xp" >= 0 AND "overall_level" >= 1);
ALTER TABLE "player_skill_progress" ADD CONSTRAINT "player_skill_progress_phase05_check" CHECK ("current_xp" >= 0 AND "lifetime_xp" >= 0 AND "current_level" BETWEEN 1 AND 100);
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_phase05_semantics_check" CHECK (
  ("xp_scope" = 'OVERALL' AND "skill_id" IS NULL AND "amount" > 0 AND "transaction_type" <> 'QUEST_FAILURE')
  OR ("xp_scope" = 'LIFETIME_SKILL' AND "skill_id" IS NOT NULL AND "amount" > 0 AND "transaction_type" <> 'QUEST_FAILURE')
  OR ("xp_scope" = 'SKILL' AND "skill_id" IS NOT NULL AND "amount" <> 0 AND (("transaction_type" = 'QUEST_FAILURE' AND "amount" < 0) OR ("transaction_type" <> 'QUEST_FAILURE' AND "amount" > 0)))
);
