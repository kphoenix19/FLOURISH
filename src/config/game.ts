import { z } from "zod";

const difficultySchema = z.enum(["EASY", "MEDIUM", "HARD", "EPIC", "LEGENDARY"]);
const distributionSchema = z.record(difficultySchema, z.number().min(0)).refine(
  (distribution) => Object.values(distribution).reduce((sum, value) => sum + value, 0) === 100,
  "Difficulty distribution must total 100",
);

export const gameConfigSchema = z.object({
  version: z.string().min(1),
  progression: z.object({
    skillLevelCap: z.number().int().positive(),
    levelCurves: z.object({
      skill: z.object({ base: z.number().int().positive(), linear: z.number().int().min(0), quadratic: z.number().int().min(0) }),
      overall: z.object({ base: z.number().int().positive(), linear: z.number().int().min(0), quadratic: z.number().int().min(0) }),
    }),
  }),
  quests: z.object({
    baseXpRange: z.object({ min: z.number().int(), max: z.number().int() }),
    difficultyXpBands: z.record(
      difficultySchema,
      z.object({ min: z.number().int(), max: z.number().int() }),
    ),
    standardCompletionWindowsHours: z.array(z.number().int().positive()).nonempty(),
    standardSlotsPerSkill: z.number().int().positive(),
    failurePenaltyPercent: z.number().min(0).max(100),
  }),
  focus: z.object({
    totalPoints: z.number().int(),
    minPerSkill: z.number().int(),
    maxPerSkill: z.number().int(),
    modifiers: z.record(z.coerce.number().int(), z.number().positive()),
  }),
  catchUp: z.object({
    xpBonusPercent: z.number().min(0).max(100),
    recommendationModifiersByRank: z.record(z.coerce.number().int(), z.number().positive()),
  }),
  streaks: z.object({
    tiers: z.array(
      z.object({ minDays: z.number().int().min(0), maxDays: z.number().int().nullable(), bonusPercent: z.number().min(0) }),
    ),
    countCurrentDayBeforeBonus: z.literal(true),
  }),
  difficultyDistributions: z.object({
    standardBySkillLevel: z.array(
      z.object({ minLevel: z.number().int(), maxLevel: z.number().int(), weights: distributionSchema }),
    ),
    daily: distributionSchema,
    weekly: distributionSchema,
  }),
  challenges: z.object({
    dailyCount: z.number().int().positive(),
    weeklyCount: z.number().int().positive(),
    dailyCompletionBonusPercent: z.number().min(0),
    weeklyCompletionBonusPercent: z.number().min(0),
    dailySetBonusOverallXp: z.number().int().min(0),
    weeklySetBonusOverallXp: z.number().int().min(0),
  }),
  recommendations: z.object({
    homeDifficultyFit: z.object({ appropriate: z.number().positive(), slightMismatch: z.number().positive(), extremeMismatch: z.number().positive() }),
    varietyHistoryWindow: z.number().int().positive(),
    varietyModifiersByOccurrences: z.record(z.coerce.number().int(), z.number().positive()),
    interactionHistoryWindow: z.number().int().positive(),
    historyModifiers: z.record(z.string(), z.number().positive()),
    randomness: z.object({ min: z.number().positive(), max: z.number().positive() }),
    similarity: z.literal("SAME_SKILL_AND_PRIMARY_VARIETY_TAG"),
  }),
}).superRefine((config, context) => {
  if (config.quests.baseXpRange.min > config.quests.baseXpRange.max) {
    context.addIssue({ code: "custom", path: ["quests", "baseXpRange"], message: "Minimum XP cannot exceed maximum XP" });
  }
  if (config.recommendations.randomness.min > config.recommendations.randomness.max) {
    context.addIssue({ code: "custom", path: ["recommendations", "randomness"], message: "Randomness minimum cannot exceed maximum" });
  }
});

export type GameConfig = z.infer<typeof gameConfigSchema>;

const rawGameConfig = {
  version: "build1-08-v1",
  progression: { skillLevelCap: 100, levelCurves: {
    skill: { base: 100, linear: 20, quadratic: 2 },
    overall: { base: 200, linear: 35, quadratic: 3 },
  } },
  quests: {
    baseXpRange: { min: 50, max: 1000 },
    difficultyXpBands: {
      EASY: { min: 50, max: 99 }, MEDIUM: { min: 100, max: 249 }, HARD: { min: 250, max: 499 },
      EPIC: { min: 500, max: 749 }, LEGENDARY: { min: 750, max: 1000 },
    },
    standardCompletionWindowsHours: [24, 48, 72], standardSlotsPerSkill: 3, failurePenaltyPercent: 20,
  },
  focus: {
    totalPoints: 46, minPerSkill: 1, maxPerSkill: 10,
    modifiers: { 1: 0.7, 2: 0.75, 3: 0.8, 4: 0.9, 5: 1, 6: 1.1, 7: 1.2, 8: 1.3, 9: 1.4, 10: 1.5 },
  },
  catchUp: { xpBonusPercent: 10, recommendationModifiersByRank: { 1: 1.3, 2: 1.2, 3: 1.1 } },
  streaks: { tiers: [
    { minDays: 0, maxDays: 2, bonusPercent: 0 }, { minDays: 3, maxDays: 6, bonusPercent: 5 },
    { minDays: 7, maxDays: 13, bonusPercent: 10 }, { minDays: 14, maxDays: 29, bonusPercent: 15 },
    { minDays: 30, maxDays: null, bonusPercent: 20 },
  ], countCurrentDayBeforeBonus: true },
  difficultyDistributions: {
    standardBySkillLevel: [
      { minLevel: 1, maxLevel: 10, weights: { EASY: 60, MEDIUM: 25, HARD: 10, EPIC: 4, LEGENDARY: 1 } },
      { minLevel: 11, maxLevel: 25, weights: { EASY: 45, MEDIUM: 30, HARD: 17, EPIC: 7, LEGENDARY: 1 } },
      { minLevel: 26, maxLevel: 50, weights: { EASY: 30, MEDIUM: 30, HARD: 25, EPIC: 12, LEGENDARY: 3 } },
      { minLevel: 51, maxLevel: 75, weights: { EASY: 20, MEDIUM: 25, HARD: 30, EPIC: 20, LEGENDARY: 5 } },
      { minLevel: 76, maxLevel: 100, weights: { EASY: 15, MEDIUM: 20, HARD: 30, EPIC: 25, LEGENDARY: 10 } },
    ],
    daily: { EASY: 60, MEDIUM: 30, HARD: 8, EPIC: 2, LEGENDARY: 0 },
    weekly: { EASY: 30, MEDIUM: 40, HARD: 25, EPIC: 5, LEGENDARY: 0 },
  },
  challenges: { dailyCount: 3, weeklyCount: 5, dailyCompletionBonusPercent: 10, weeklyCompletionBonusPercent: 15, dailySetBonusOverallXp: 100, weeklySetBonusOverallXp: 300 },
  recommendations: {
    homeDifficultyFit: { appropriate: 1, slightMismatch: 0.95, extremeMismatch: 0.85 },
    varietyHistoryWindow: 5,
    varietyModifiersByOccurrences: { 0: 1, 1: 0.95, 2: 0.9, 3: 0.85, 4: 0.8, 5: 0.75 },
    interactionHistoryWindow: 20,
    historyModifiers: { none: 1, recentlyCompletedSimilar: 0.95, genericReroll: 0.9, justDifferent: 0.98, noTime: 0.9, tooHard: 0.85, notInterested: 0.75, recentlyAbandonedSimilar: 0.85, recentlyExpiredSimilar: 0.9 },
    randomness: { min: 0.9, max: 1.1 },
    similarity: "SAME_SKILL_AND_PRIMARY_VARIETY_TAG",
  },
} as const;

export const gameConfig: GameConfig = gameConfigSchema.parse(rawGameConfig);
