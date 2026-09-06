-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PLAYER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD', 'EPIC', 'LEGENDARY');

-- CreateEnum
CREATE TYPE "CompletionType" AS ENUM ('SINGLE', 'COUNT');

-- CreateEnum
CREATE TYPE "QuestPoolType" AS ENUM ('STANDARD', 'DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "PlayerQuestStatus" AS ENUM ('AVAILABLE', 'ACCEPTED', 'COMPLETED', 'ABANDONED', 'EXPIRED', 'REROLLED');

-- CreateEnum
CREATE TYPE "QuestReviewStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CostLevel" AS ENUM ('NONE', 'LOW', 'MODERATE', 'HIGH');

-- CreateEnum
CREATE TYPE "SocialRequirement" AS ENUM ('NONE', 'OPTIONAL', 'REQUIRED');

-- CreateEnum
CREATE TYPE "SafetyCategory" AS ENUM ('GENERAL', 'FITNESS', 'FINANCIAL', 'SPIRITUAL');

-- CreateEnum
CREATE TYPE "XpScope" AS ENUM ('OVERALL', 'SKILL', 'LIFETIME_SKILL');

-- CreateEnum
CREATE TYPE "XpTransactionType" AS ENUM ('QUEST_COMPLETION', 'QUEST_FAILURE', 'DAILY_CHALLENGE_BONUS', 'WEEKLY_CHALLENGE_BONUS', 'DAILY_SET_BONUS', 'WEEKLY_SET_BONUS', 'CATCH_UP_BONUS', 'STREAK_BONUS', 'OTHER');

-- CreateEnum
CREATE TYPE "QuestInteractionType" AS ENUM ('SHOWN', 'ACCEPTED', 'REROLLED', 'UPGRADED', 'COMPLETED', 'ABANDONED', 'EXPIRED', 'CLEARED', 'PROGRESS_INCREMENTED', 'PROGRESS_DECREMENTED', 'RECOMMENDED');

-- CreateEnum
CREATE TYPE "QuestFeedbackReason" AS ENUM ('TOO_HARD', 'NO_TIME', 'NOT_INTERESTED', 'JUST_DIFFERENT');

-- CreateEnum
CREATE TYPE "AdminAuditAction" AS ENUM ('CREATE', 'UPDATE', 'SUBMIT_REVIEW', 'APPROVE', 'REJECT', 'ACTIVATE', 'DEACTIVATE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image_url" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'PLAYER',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "timezone" TEXT NOT NULL,
    "onboarding_completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" UUID NOT NULL,
    "code" VARCHAR(1) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_skill_focus" (
    "player_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "focus_points" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "player_skill_focus_pkey" PRIMARY KEY ("player_id","skill_id")
);

-- CreateTable
CREATE TABLE "player_skill_focus_history" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "old_focus_points" INTEGER NOT NULL,
    "new_focus_points" INTEGER NOT NULL,
    "allocation_change_id" UUID,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_skill_focus_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_progress" (
    "player_id" UUID NOT NULL,
    "overall_xp" INTEGER NOT NULL DEFAULT 0,
    "overall_level" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "player_progress_pkey" PRIMARY KEY ("player_id")
);

-- CreateTable
CREATE TABLE "player_skill_progress" (
    "player_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "current_xp" INTEGER NOT NULL DEFAULT 0,
    "lifetime_xp" INTEGER NOT NULL DEFAULT 0,
    "current_level" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "player_skill_progress_pkey" PRIMARY KEY ("player_id","skill_id")
);

-- CreateTable
CREATE TABLE "player_skill_streaks" (
    "player_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "current_streak_days" INTEGER NOT NULL DEFAULT 0,
    "longest_streak_days" INTEGER NOT NULL DEFAULT 0,
    "last_qualifying_date" DATE,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "player_skill_streaks_pkey" PRIMARY KEY ("player_id","skill_id")
);

-- CreateTable
CREATE TABLE "quest_families" (
    "id" UUID NOT NULL,
    "stable_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quest_families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quest_definitions" (
    "id" UUID NOT NULL,
    "stable_key" TEXT NOT NULL,
    "quest_family_id" UUID,
    "title" TEXT NOT NULL,
    "short_description" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "base_xp" INTEGER NOT NULL,
    "estimated_minutes" INTEGER NOT NULL,
    "completion_window_hours" INTEGER,
    "completion_type" "CompletionType" NOT NULL,
    "completion_target" INTEGER NOT NULL,
    "standard_eligible" BOOLEAN NOT NULL DEFAULT false,
    "daily_eligible" BOOLEAN NOT NULL DEFAULT false,
    "weekly_eligible" BOOLEAN NOT NULL DEFAULT false,
    "cost_level" "CostLevel" NOT NULL DEFAULT 'NONE',
    "social_requirement" "SocialRequirement" NOT NULL DEFAULT 'NONE',
    "safety_category" "SafetyCategory" NOT NULL DEFAULT 'GENERAL',
    "curator_value_score" INTEGER,
    "curator_difficulty_reason" TEXT,
    "review_status" "QuestReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "curator_notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quest_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quest_skills" (
    "quest_definition_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "reward_percent" INTEGER NOT NULL,

    CONSTRAINT "quest_skills_pkey" PRIMARY KEY ("quest_definition_id","skill_id")
);

-- CreateTable
CREATE TABLE "variety_tags" (
    "id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "variety_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quest_variety_tags" (
    "quest_definition_id" UUID NOT NULL,
    "variety_tag_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "quest_variety_tags_pkey" PRIMARY KEY ("quest_definition_id","variety_tag_id")
);

-- CreateTable
CREATE TABLE "context_tags" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "context_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quest_context_tags" (
    "quest_definition_id" UUID NOT NULL,
    "context_tag_id" UUID NOT NULL,

    CONSTRAINT "quest_context_tags_pkey" PRIMARY KEY ("quest_definition_id","context_tag_id")
);

-- CreateTable
CREATE TABLE "challenge_sets" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "pool_type" "QuestPoolType" NOT NULL,
    "window_start_at" TIMESTAMPTZ(3) NOT NULL,
    "window_end_at" TIMESTAMPTZ(3) NOT NULL,
    "set_bonus_awarded_at" TIMESTAMPTZ(3),
    "set_bonus_operation_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "challenge_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_quests" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "quest_definition_id" UUID NOT NULL,
    "challenge_set_id" UUID,
    "pool_type" "QuestPoolType" NOT NULL,
    "status" "PlayerQuestStatus" NOT NULL DEFAULT 'AVAILABLE',
    "current_progress" INTEGER NOT NULL DEFAULT 0,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMPTZ(3),
    "deadline_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "abandoned_at" TIMESTAMPTZ(3),
    "expired_at" TIMESTAMPTZ(3),
    "cleared_at" TIMESTAMPTZ(3),
    "window_start_at" TIMESTAMPTZ(3),
    "window_end_at" TIMESTAMPTZ(3),
    "difficulty_snapshot" "Difficulty" NOT NULL,
    "base_xp_snapshot" INTEGER NOT NULL,
    "completion_type_snapshot" "CompletionType" NOT NULL,
    "completion_target_snapshot" INTEGER NOT NULL,
    "completion_window_hours_snapshot" INTEGER,
    "reward_config_version_snapshot" TEXT NOT NULL,
    "failure_penalty_xp" INTEGER,
    "failure_penalty_applied_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "player_quests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_quest_skill_snapshots" (
    "player_quest_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "reward_percent" INTEGER NOT NULL,

    CONSTRAINT "player_quest_skill_snapshots_pkey" PRIMARY KEY ("player_quest_id","skill_id")
);

-- CreateTable
CREATE TABLE "player_quest_slots" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "slot_number" INTEGER NOT NULL,
    "current_player_quest_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "player_quest_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quest_rewards" (
    "id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "player_quest_id" UUID NOT NULL,
    "base_xp" INTEGER NOT NULL,
    "catch_up_bonus_xp" INTEGER NOT NULL DEFAULT 0,
    "streak_bonus_xp" INTEGER NOT NULL DEFAULT 0,
    "challenge_bonus_xp" INTEGER NOT NULL DEFAULT 0,
    "other_bonus_xp" INTEGER NOT NULL DEFAULT 0,
    "final_overall_xp" INTEGER NOT NULL,
    "calculated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quest_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quest_skill_rewards" (
    "id" UUID NOT NULL,
    "quest_reward_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "reward_percent" INTEGER NOT NULL,
    "base_skill_xp" INTEGER NOT NULL,
    "bonus_skill_xp" INTEGER NOT NULL,
    "final_skill_xp" INTEGER NOT NULL,

    CONSTRAINT "quest_skill_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xp_transactions" (
    "id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "player_quest_id" UUID,
    "skill_id" UUID,
    "xp_scope" "XpScope" NOT NULL,
    "transaction_type" "XpTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xp_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quest_interactions" (
    "id" UUID NOT NULL,
    "operation_id" UUID,
    "player_id" UUID NOT NULL,
    "quest_definition_id" UUID NOT NULL,
    "player_quest_id" UUID,
    "interaction_type" "QuestInteractionType" NOT NULL,
    "feedback_reason" "QuestFeedbackReason",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quest_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" "AdminAuditAction" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before_data" JSONB,
    "after_data" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_recommendations" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "player_quest_id" UUID NOT NULL,
    "reason_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "config_version" TEXT NOT NULL,
    "calculated_at" TIMESTAMPTZ(3) NOT NULL,
    "invalidated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "player_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_accounts_provider_provider_account_id_key" ON "auth_accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "players_user_id_key" ON "players"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "skills_code_key" ON "skills"("code");

-- CreateIndex
CREATE UNIQUE INDEX "skills_name_key" ON "skills"("name");

-- CreateIndex
CREATE INDEX "player_skill_focus_skill_id_idx" ON "player_skill_focus"("skill_id");

-- CreateIndex
CREATE INDEX "player_skill_focus_history_player_id_changed_at_idx" ON "player_skill_focus_history"("player_id", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "player_skill_focus_history_allocation_change_id_idx" ON "player_skill_focus_history"("allocation_change_id");

-- CreateIndex
CREATE INDEX "player_skill_focus_history_skill_id_idx" ON "player_skill_focus_history"("skill_id");

-- CreateIndex
CREATE INDEX "player_skill_progress_player_id_idx" ON "player_skill_progress"("player_id");

-- CreateIndex
CREATE INDEX "player_skill_progress_skill_id_idx" ON "player_skill_progress"("skill_id");

-- CreateIndex
CREATE INDEX "player_skill_streaks_skill_id_idx" ON "player_skill_streaks"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "quest_families_stable_key_key" ON "quest_families"("stable_key");

-- CreateIndex
CREATE UNIQUE INDEX "quest_definitions_stable_key_key" ON "quest_definitions"("stable_key");

-- CreateIndex
CREATE INDEX "quest_definitions_active_review_status_idx" ON "quest_definitions"("active", "review_status");

-- CreateIndex
CREATE INDEX "quest_definitions_standard_eligible_active_review_status_di_idx" ON "quest_definitions"("standard_eligible", "active", "review_status", "difficulty");

-- CreateIndex
CREATE INDEX "quest_definitions_daily_eligible_active_review_status_diffi_idx" ON "quest_definitions"("daily_eligible", "active", "review_status", "difficulty");

-- CreateIndex
CREATE INDEX "quest_definitions_weekly_eligible_active_review_status_diff_idx" ON "quest_definitions"("weekly_eligible", "active", "review_status", "difficulty");

-- CreateIndex
CREATE INDEX "quest_definitions_difficulty_idx" ON "quest_definitions"("difficulty");

-- CreateIndex
CREATE INDEX "quest_definitions_quest_family_id_idx" ON "quest_definitions"("quest_family_id");

-- CreateIndex
CREATE INDEX "quest_skills_skill_id_idx" ON "quest_skills"("skill_id");

-- CreateIndex
CREATE INDEX "variety_tags_skill_id_idx" ON "variety_tags"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "variety_tags_skill_id_code_key" ON "variety_tags"("skill_id", "code");

-- CreateIndex
CREATE INDEX "quest_variety_tags_variety_tag_id_idx" ON "quest_variety_tags"("variety_tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "context_tags_code_key" ON "context_tags"("code");

-- CreateIndex
CREATE INDEX "quest_context_tags_context_tag_id_idx" ON "quest_context_tags"("context_tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_sets_set_bonus_operation_id_key" ON "challenge_sets"("set_bonus_operation_id");

-- CreateIndex
CREATE INDEX "challenge_sets_player_id_pool_type_window_start_at_window_e_idx" ON "challenge_sets"("player_id", "pool_type", "window_start_at", "window_end_at");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_sets_player_id_pool_type_window_start_at_key" ON "challenge_sets"("player_id", "pool_type", "window_start_at");

-- CreateIndex
CREATE INDEX "player_quests_player_id_status_idx" ON "player_quests"("player_id", "status");

-- CreateIndex
CREATE INDEX "player_quests_player_id_pool_type_status_idx" ON "player_quests"("player_id", "pool_type", "status");

-- CreateIndex
CREATE INDEX "player_quests_deadline_at_idx" ON "player_quests"("deadline_at");

-- CreateIndex
CREATE INDEX "player_quests_player_id_deadline_at_idx" ON "player_quests"("player_id", "deadline_at");

-- CreateIndex
CREATE INDEX "player_quests_player_id_window_start_at_window_end_at_idx" ON "player_quests"("player_id", "window_start_at", "window_end_at");

-- CreateIndex
CREATE INDEX "player_quests_quest_definition_id_idx" ON "player_quests"("quest_definition_id");

-- CreateIndex
CREATE INDEX "player_quests_challenge_set_id_idx" ON "player_quests"("challenge_set_id");

-- CreateIndex
CREATE INDEX "player_quest_skill_snapshots_skill_id_idx" ON "player_quest_skill_snapshots"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_quest_slots_current_player_quest_id_key" ON "player_quest_slots"("current_player_quest_id");

-- CreateIndex
CREATE INDEX "player_quest_slots_player_id_skill_id_idx" ON "player_quest_slots"("player_id", "skill_id");

-- CreateIndex
CREATE INDEX "player_quest_slots_skill_id_idx" ON "player_quest_slots"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_quest_slots_player_id_skill_id_slot_number_key" ON "player_quest_slots"("player_id", "skill_id", "slot_number");

-- CreateIndex
CREATE UNIQUE INDEX "quest_rewards_player_quest_id_key" ON "quest_rewards"("player_quest_id");

-- CreateIndex
CREATE INDEX "quest_rewards_operation_id_idx" ON "quest_rewards"("operation_id");

-- CreateIndex
CREATE INDEX "quest_skill_rewards_skill_id_idx" ON "quest_skill_rewards"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "quest_skill_rewards_quest_reward_id_skill_id_key" ON "quest_skill_rewards"("quest_reward_id", "skill_id");

-- CreateIndex
CREATE INDEX "xp_transactions_player_id_created_at_idx" ON "xp_transactions"("player_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "xp_transactions_player_quest_id_idx" ON "xp_transactions"("player_quest_id");

-- CreateIndex
CREATE INDEX "xp_transactions_operation_id_idx" ON "xp_transactions"("operation_id");

-- CreateIndex
CREATE INDEX "xp_transactions_skill_id_created_at_idx" ON "xp_transactions"("skill_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "quest_interactions_player_id_created_at_idx" ON "quest_interactions"("player_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "quest_interactions_player_id_quest_definition_id_created_at_idx" ON "quest_interactions"("player_id", "quest_definition_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "quest_interactions_player_quest_id_idx" ON "quest_interactions"("player_quest_id");

-- CreateIndex
CREATE INDEX "quest_interactions_interaction_type_idx" ON "quest_interactions"("interaction_type");

-- CreateIndex
CREATE INDEX "quest_interactions_operation_id_idx" ON "quest_interactions"("operation_id");

-- CreateIndex
CREATE INDEX "admin_audit_logs_actor_user_id_created_at_idx" ON "admin_audit_logs"("actor_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "admin_audit_logs_entity_type_entity_id_created_at_idx" ON "admin_audit_logs"("entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "player_recommendations_player_id_key" ON "player_recommendations"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_recommendations_player_quest_id_key" ON "player_recommendations"("player_quest_id");

-- AddForeignKey
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_skill_focus" ADD CONSTRAINT "player_skill_focus_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_skill_focus" ADD CONSTRAINT "player_skill_focus_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_skill_focus_history" ADD CONSTRAINT "player_skill_focus_history_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_skill_focus_history" ADD CONSTRAINT "player_skill_focus_history_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_progress" ADD CONSTRAINT "player_progress_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_skill_progress" ADD CONSTRAINT "player_skill_progress_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_skill_progress" ADD CONSTRAINT "player_skill_progress_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_skill_streaks" ADD CONSTRAINT "player_skill_streaks_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_skill_streaks" ADD CONSTRAINT "player_skill_streaks_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_definitions" ADD CONSTRAINT "quest_definitions_quest_family_id_fkey" FOREIGN KEY ("quest_family_id") REFERENCES "quest_families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_definitions" ADD CONSTRAINT "quest_definitions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_skills" ADD CONSTRAINT "quest_skills_quest_definition_id_fkey" FOREIGN KEY ("quest_definition_id") REFERENCES "quest_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_skills" ADD CONSTRAINT "quest_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variety_tags" ADD CONSTRAINT "variety_tags_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_variety_tags" ADD CONSTRAINT "quest_variety_tags_quest_definition_id_fkey" FOREIGN KEY ("quest_definition_id") REFERENCES "quest_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_variety_tags" ADD CONSTRAINT "quest_variety_tags_variety_tag_id_fkey" FOREIGN KEY ("variety_tag_id") REFERENCES "variety_tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_context_tags" ADD CONSTRAINT "quest_context_tags_quest_definition_id_fkey" FOREIGN KEY ("quest_definition_id") REFERENCES "quest_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_context_tags" ADD CONSTRAINT "quest_context_tags_context_tag_id_fkey" FOREIGN KEY ("context_tag_id") REFERENCES "context_tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_sets" ADD CONSTRAINT "challenge_sets_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_quests" ADD CONSTRAINT "player_quests_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_quests" ADD CONSTRAINT "player_quests_quest_definition_id_fkey" FOREIGN KEY ("quest_definition_id") REFERENCES "quest_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_quests" ADD CONSTRAINT "player_quests_challenge_set_id_fkey" FOREIGN KEY ("challenge_set_id") REFERENCES "challenge_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_quest_skill_snapshots" ADD CONSTRAINT "player_quest_skill_snapshots_player_quest_id_fkey" FOREIGN KEY ("player_quest_id") REFERENCES "player_quests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_quest_skill_snapshots" ADD CONSTRAINT "player_quest_skill_snapshots_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_quest_slots" ADD CONSTRAINT "player_quest_slots_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_quest_slots" ADD CONSTRAINT "player_quest_slots_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_quest_slots" ADD CONSTRAINT "player_quest_slots_current_player_quest_id_fkey" FOREIGN KEY ("current_player_quest_id") REFERENCES "player_quests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_rewards" ADD CONSTRAINT "quest_rewards_player_quest_id_fkey" FOREIGN KEY ("player_quest_id") REFERENCES "player_quests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_skill_rewards" ADD CONSTRAINT "quest_skill_rewards_quest_reward_id_fkey" FOREIGN KEY ("quest_reward_id") REFERENCES "quest_rewards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_skill_rewards" ADD CONSTRAINT "quest_skill_rewards_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_player_quest_id_fkey" FOREIGN KEY ("player_quest_id") REFERENCES "player_quests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_interactions" ADD CONSTRAINT "quest_interactions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_interactions" ADD CONSTRAINT "quest_interactions_quest_definition_id_fkey" FOREIGN KEY ("quest_definition_id") REFERENCES "quest_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_interactions" ADD CONSTRAINT "quest_interactions_player_quest_id_fkey" FOREIGN KEY ("player_quest_id") REFERENCES "player_quests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_recommendations" ADD CONSTRAINT "player_recommendations_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_recommendations" ADD CONSTRAINT "player_recommendations_player_quest_id_fkey" FOREIGN KEY ("player_quest_id") REFERENCES "player_quests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain invariants that Prisma cannot express.
ALTER TABLE "skills" ADD CONSTRAINT "skills_code_check"
  CHECK ("code" IN ('F', 'L', 'O', 'U', 'R', 'I', 'S', 'H'));
ALTER TABLE "player_skill_focus" ADD CONSTRAINT "player_skill_focus_points_check"
  CHECK ("focus_points" BETWEEN 1 AND 10);
ALTER TABLE "player_skill_focus_history" ADD CONSTRAINT "player_skill_focus_history_points_check"
  CHECK ("old_focus_points" BETWEEN 1 AND 10 AND "new_focus_points" BETWEEN 1 AND 10);
ALTER TABLE "player_progress" ADD CONSTRAINT "player_progress_values_check"
  CHECK ("overall_xp" >= 0 AND "overall_level" >= 1);
ALTER TABLE "player_skill_progress" ADD CONSTRAINT "player_skill_progress_values_check"
  CHECK ("current_xp" >= 0 AND "lifetime_xp" >= 0 AND "current_level" BETWEEN 1 AND 100);
ALTER TABLE "player_skill_streaks" ADD CONSTRAINT "player_skill_streaks_values_check"
  CHECK ("current_streak_days" >= 0 AND "longest_streak_days" >= "current_streak_days");

ALTER TABLE "quest_definitions" ADD CONSTRAINT "quest_definitions_values_check"
  CHECK (
    "base_xp" BETWEEN 50 AND 1000
    AND "estimated_minutes" >= 0
    AND "completion_target" > 0
    AND (("completion_type" = 'SINGLE' AND "completion_target" = 1) OR ("completion_type" = 'COUNT' AND "completion_target" > 1))
    AND (NOT "standard_eligible" OR "completion_window_hours" IN (24, 48, 72))
  );
ALTER TABLE "quest_skills" ADD CONSTRAINT "quest_skills_reward_percent_check"
  CHECK ("reward_percent" BETWEEN 1 AND 100);
ALTER TABLE "challenge_sets" ADD CONSTRAINT "challenge_sets_window_check"
  CHECK ("pool_type" IN ('DAILY', 'WEEKLY') AND "window_end_at" > "window_start_at");
ALTER TABLE "player_quests" ADD CONSTRAINT "player_quests_values_check"
  CHECK (
    "current_progress" BETWEEN 0 AND "completion_target_snapshot"
    AND "base_xp_snapshot" BETWEEN 50 AND 1000
    AND "completion_target_snapshot" > 0
    AND (("completion_type_snapshot" = 'SINGLE' AND "completion_target_snapshot" = 1) OR ("completion_type_snapshot" = 'COUNT' AND "completion_target_snapshot" > 1))
    AND ("failure_penalty_xp" IS NULL OR "failure_penalty_xp" >= 0)
    AND (("window_start_at" IS NULL AND "window_end_at" IS NULL) OR ("window_start_at" IS NOT NULL AND "window_end_at" > "window_start_at"))
  );
ALTER TABLE "player_quest_skill_snapshots" ADD CONSTRAINT "player_quest_skill_snapshots_reward_percent_check"
  CHECK ("reward_percent" BETWEEN 1 AND 100);
ALTER TABLE "player_quest_slots" ADD CONSTRAINT "player_quest_slots_slot_number_check"
  CHECK ("slot_number" BETWEEN 1 AND 3);
ALTER TABLE "quest_rewards" ADD CONSTRAINT "quest_rewards_values_check"
  CHECK (
    "base_xp" >= 0 AND "catch_up_bonus_xp" >= 0 AND "streak_bonus_xp" >= 0
    AND "challenge_bonus_xp" >= 0 AND "other_bonus_xp" >= 0 AND "final_overall_xp" >= 0
  );
ALTER TABLE "quest_skill_rewards" ADD CONSTRAINT "quest_skill_rewards_values_check"
  CHECK (
    "reward_percent" BETWEEN 1 AND 100 AND "base_skill_xp" >= 0
    AND "bonus_skill_xp" >= 0 AND "final_skill_xp" >= 0
  );
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_scope_check"
  CHECK (
    (("xp_scope" = 'OVERALL' AND "skill_id" IS NULL) OR ("xp_scope" IN ('SKILL', 'LIFETIME_SKILL') AND "skill_id" IS NOT NULL))
    AND ("amount" >= 0 OR ("xp_scope" = 'SKILL' AND "transaction_type" = 'QUEST_FAILURE'))
    AND ("transaction_type" <> 'QUEST_FAILURE' OR "xp_scope" = 'SKILL')
  );

-- At most one primary association per quest; application validators enforce at least one.
CREATE UNIQUE INDEX "quest_skills_one_primary_idx"
  ON "quest_skills" ("quest_definition_id") WHERE "is_primary";
CREATE UNIQUE INDEX "quest_variety_tags_one_primary_idx"
  ON "quest_variety_tags" ("quest_definition_id") WHERE "is_primary";
CREATE UNIQUE INDEX "player_quest_skill_snapshots_one_primary_idx"
  ON "player_quest_skill_snapshots" ("player_quest_id") WHERE "is_primary";

-- A family may publish only one definition at a given difficulty.
CREATE UNIQUE INDEX "quest_definitions_family_difficulty_key"
  ON "quest_definitions" ("quest_family_id", "difficulty") WHERE "quest_family_id" IS NOT NULL;
