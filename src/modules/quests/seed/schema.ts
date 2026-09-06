import { z } from "zod";

const text = z.string().trim().min(1);
const key = text.regex(/^[A-Z][A-Z0-9_-]*$/);
const code = z.enum(["F", "L", "O", "U", "R", "I", "S", "H"]);
const positiveInt = z.number().int().positive();

export const seedSchema = z.strictObject({
  skills: z.array(z.strictObject({ code, name: text, description: text, active: z.literal(true) })),
  varietyTags: z.array(z.strictObject({ skillCode: code, code: text, displayName: text, active: z.literal(true) })),
  families: z.array(z.strictObject({ stableKey: key, name: text, description: text, active: z.boolean() })),
  quests: z.array(z.strictObject({
    stableKey: key,
    title: text,
    shortDescription: text,
    difficulty: z.enum(["EASY", "MEDIUM", "HARD", "EPIC", "LEGENDARY"]),
    baseXp: positiveInt,
    estimatedMinutes: positiveInt,
    completionWindowHours: positiveInt.nullable(),
    completionType: z.enum(["SINGLE", "COUNT"]),
    completionTarget: positiveInt,
    standardEligible: z.boolean(),
    dailyEligible: z.boolean(),
    weeklyEligible: z.boolean(),
    familyKey: key.nullable(),
    skills: z.array(z.strictObject({ skillCode: code, isPrimary: z.boolean(), rewardPercent: positiveInt.max(100) })),
    varietyTags: z.array(z.strictObject({ skillCode: code, code: text, isPrimary: z.boolean() })),
    costLevel: z.enum(["NONE", "LOW", "MODERATE", "HIGH"]),
    socialRequirement: z.enum(["NONE", "OPTIONAL", "REQUIRED"]),
    safetyCategory: z.enum(["GENERAL", "FITNESS", "FINANCIAL", "SPIRITUAL"]),
    curatorValueScore: positiveInt.max(5),
    curatorDifficultyReason: text,
    curatorNotes: text,
    reviewStatus: z.literal("APPROVED"),
    reviewedAt: z.iso.datetime(),
    active: z.boolean(),
    deprecationReason: text.nullable(),
  })),
});

export type CanonicalSeed = z.infer<typeof seedSchema>;
