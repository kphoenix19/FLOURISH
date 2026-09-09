import { z } from "zod";
import { gameConfig } from "../../config/game";

export const difficulties = ["EASY", "MEDIUM", "HARD", "EPIC", "LEGENDARY"] as const;
export const reviewStatuses = ["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED"] as const;
export const skillCodes = ["F", "L", "O", "U", "R", "I", "S", "H"] as const;
const requiredText = z.string().trim().min(1);

export const questInputSchema = z.strictObject({
  stableKey: requiredText.regex(/^[A-Z][A-Z0-9_-]*$/, "Stable key must use uppercase letters, numbers, underscores, or hyphens."),
  title: requiredText.max(160), shortDescription: requiredText.max(1000),
  difficulty: z.enum(difficulties), baseXp: z.number().int(), estimatedMinutes: z.number().int().positive(),
  completionWindowHours: z.number().int().positive().nullable(), completionType: z.enum(["SINGLE", "COUNT"]), completionTarget: z.number().int().positive(),
  standardEligible: z.boolean(), dailyEligible: z.boolean(), weeklyEligible: z.boolean(), familyId: z.uuid().nullable(),
  skills: z.array(z.strictObject({ skillId: z.uuid(), isPrimary: z.boolean(), rewardPercent: z.number().int().min(1).max(100) })).min(1).max(3),
  varietyTags: z.array(z.strictObject({ varietyTagId: z.uuid(), isPrimary: z.boolean() })).min(1).max(3),
  costLevel: z.enum(["NONE", "LOW", "MODERATE", "HIGH"]), socialRequirement: z.enum(["NONE", "OPTIONAL", "REQUIRED"]), safetyCategory: z.enum(["GENERAL", "FITNESS", "FINANCIAL", "SPIRITUAL"]),
  curatorValueScore: z.number().int().min(1).max(5), curatorDifficultyReason: requiredText.max(1000), curatorNotes: z.string().trim().max(2000).nullable(),
  expectedUpdatedAt: z.iso.datetime().optional(),
}).superRefine((value, ctx) => {
  const band = gameConfig.quests.difficultyXpBands[value.difficulty];
  if (value.baseXp < band.min || value.baseXp > band.max) ctx.addIssue({ code: "custom", path: ["baseXp"], message: `${value.difficulty} XP must be ${band.min}–${band.max}.` });
  if (value.completionType === "SINGLE" && value.completionTarget !== 1) ctx.addIssue({ code: "custom", path: ["completionTarget"], message: "SINGLE quests must have a target of 1." });
  if (value.completionType === "COUNT" && value.completionTarget <= 1) ctx.addIssue({ code: "custom", path: ["completionTarget"], message: "COUNT quests must have a target greater than 1." });
  if (value.standardEligible && !gameConfig.quests.standardCompletionWindowsHours.includes(value.completionWindowHours ?? -1)) ctx.addIssue({ code: "custom", path: ["completionWindowHours"], message: "Standard quests require a 24, 48, or 72 hour window." });
  if (!value.standardEligible && value.completionWindowHours !== null) ctx.addIssue({ code: "custom", path: ["completionWindowHours"], message: "Non-Standard quests must not define a Standard window." });
  if (![value.standardEligible, value.dailyEligible, value.weeklyEligible].some(Boolean)) ctx.addIssue({ code: "custom", path: ["standardEligible"], message: "Select at least one eligible pool." });
  if (new Set(value.skills.map((item) => item.skillId)).size !== value.skills.length) ctx.addIssue({ code: "custom", path: ["skills"], message: "Reward Skills must be unique." });
  if (value.skills.filter((item) => item.isPrimary).length !== 1) ctx.addIssue({ code: "custom", path: ["skills"], message: "Choose exactly one primary Skill." });
  if (value.skills.reduce((sum, item) => sum + item.rewardPercent, 0) !== 100) ctx.addIssue({ code: "custom", path: ["skills"], message: "Reward percentages must total 100%." });
  if (new Set(value.varietyTags.map((item) => item.varietyTagId)).size !== value.varietyTags.length) ctx.addIssue({ code: "custom", path: ["varietyTags"], message: "Variety Tags must be unique." });
  if (value.varietyTags.filter((item) => item.isPrimary).length !== 1) ctx.addIssue({ code: "custom", path: ["varietyTags"], message: "Choose exactly one primary Variety Tag." });
});

export const listQuerySchema = z.object({
  q: z.string().trim().max(100).default(""), skill: z.enum(skillCodes).optional(), difficulty: z.enum(difficulties).optional(),
  family: z.string().uuid().optional(), active: z.enum(["true", "false"]).optional(), review: z.enum(reviewStatuses).optional(),
  pool: z.enum(["STANDARD", "DAILY", "WEEKLY"]).optional(), ownership: z.enum(["SEED", "ADMIN"]).optional(),
  page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(10).max(100).default(25),
});

export const transitionSchema = z.strictObject({ action: z.enum(["SUBMIT_REVIEW", "APPROVE", "REJECT", "ACTIVATE", "DEACTIVATE"]), expectedUpdatedAt: z.iso.datetime() });
export type QuestInput = z.infer<typeof questInputSchema>;
