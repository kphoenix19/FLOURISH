import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { ServiceError } from "../../lib/service-error";
import { listQuerySchema, questInputSchema, transitionSchema, type QuestInput } from "./domain";

const questInclude = { family: true, skills: { include: { skill: true } }, varietyTags: { include: { varietyTag: { include: { skill: true } } } } } as const;
const snapshot = (quest: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(quest)) as Prisma.InputJsonValue;
async function serializable<T>(db: PrismaClient, action: (tx: Prisma.TransactionClient) => Promise<T>) { for (let attempt=0;attempt<3;attempt++) { try { return await db.$transaction(action,{isolationLevel:"Serializable"}); } catch (error) { const code=typeof error==="object"&&error&&"code" in error?String(error.code):""; if(!["P2034","40001","40P01"].includes(code)||attempt===2)throw error; } } throw new Error("unreachable"); }

export async function adminReferenceData(db: PrismaClient) {
  const [skills, varietyTags, families] = await Promise.all([
    db.skill.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.varietyTag.findMany({ where: { active: true }, include: { skill: true }, orderBy: [{ skill: { name: "asc" } }, { displayName: "asc" }] }),
    db.questFamily.findMany({ orderBy: { name: "asc" }, include: { quests: { select: { id: true, difficulty: true, title: true, active: true } } } }),
  ]);
  return { skills, varietyTags, families };
}

export async function listQuests(db: PrismaClient, raw: Record<string, string>) {
  const query = listQuerySchema.parse(raw); const where: Prisma.QuestDefinitionWhereInput = {};
  if (query.q) where.OR = [{ title: { contains: query.q, mode: "insensitive" } }, { stableKey: { contains: query.q, mode: "insensitive" } }, { shortDescription: { contains: query.q, mode: "insensitive" } }];
  if (query.skill) where.skills = { some: { skill: { code: query.skill } } };
  if (query.difficulty) where.difficulty = query.difficulty;
  if (query.family) where.questFamilyId = query.family;
  if (query.active) where.active = query.active === "true";
  if (query.review) where.reviewStatus = query.review;
  if (query.pool === "STANDARD") where.standardEligible = true;
  if (query.pool === "DAILY") where.dailyEligible = true;
  if (query.pool === "WEEKLY") where.weeklyEligible = true;
  if (query.ownership) where.seedManaged = query.ownership === "SEED";
  const [items, total] = await db.$transaction([
    db.questDefinition.findMany({ where, include: questInclude, orderBy: [{ updatedAt: "desc" }, { stableKey: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    db.questDefinition.count({ where }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize, pages: Math.max(1, Math.ceil(total / query.pageSize)) };
}

export async function getQuest(db: PrismaClient, id: string) {
  const quest = await db.questDefinition.findUnique({ where: { id }, include: questInclude });
  if (!quest) throw new ServiceError(404, "NOT_FOUND", "Quest definition was not found.");
  return quest;
}

async function verifyReferences(tx: Prisma.TransactionClient, input: QuestInput, excludeId?: string) {
  const [skills, tags, family, familyConflict] = await Promise.all([
    tx.skill.findMany({ where: { id: { in: input.skills.map((x) => x.skillId) }, active: true }, select: { id: true } }),
    tx.varietyTag.findMany({ where: { id: { in: input.varietyTags.map((x) => x.varietyTagId) }, active: true }, select: { id: true, skillId: true } }),
    input.familyId ? tx.questFamily.findUnique({ where: { id: input.familyId }, select: { active: true } }) : null,
    input.familyId ? tx.questDefinition.findFirst({ where: { questFamilyId: input.familyId, difficulty: input.difficulty, id: excludeId ? { not: excludeId } : undefined }, select: { id: true, title: true } }) : null,
  ]);
  if (skills.length !== input.skills.length || tags.length !== input.varietyTags.length) throw new ServiceError(400, "INVALID_TAXONOMY", "Choose active controlled Skills and Variety Tags.");
  const rewarded = new Set(input.skills.map((x) => x.skillId));
  if (tags.some((tag) => !rewarded.has(tag.skillId))) throw new ServiceError(400, "TAG_SKILL_MISMATCH", "Every Variety Tag must belong to a rewarded Skill.");
  if (input.familyId && !family?.active) throw new ServiceError(400, "INVALID_FAMILY", "Choose an active Quest Family.");
  if (familyConflict) throw new ServiceError(409, "FAMILY_TIER_CONFLICT", `That family already has a ${input.difficulty} quest: ${familyConflict.title}.`);
}

export async function createQuest(db: PrismaClient, actorId: string, raw: unknown) {
  const input = questInputSchema.parse(raw);
  return serializable(db, async (tx) => {
    await verifyReferences(tx, input);
    const quest = await tx.questDefinition.create({ data: { ...fields(input), seedManaged: false, reviewStatus: "DRAFT", active: false, skills: { create: input.skills }, varietyTags: { create: input.varietyTags } }, include: questInclude });
    await tx.adminAuditLog.create({ data: { actorUserId: actorId, action: "CREATE", entityType: "QuestDefinition", entityId: quest.id, afterData: snapshot(quest) } });
    return quest;
  });
}

export async function updateQuest(db: PrismaClient, actorId: string, id: string, raw: unknown) {
  const input = questInputSchema.parse(raw); if (!input.expectedUpdatedAt) throw new ServiceError(400, "EXPECTED_VERSION", "The current updated timestamp is required.");
  return serializable(db, async (tx) => {
    const before = await tx.questDefinition.findUnique({ where: { id }, include: questInclude });
    if (!before) throw new ServiceError(404, "NOT_FOUND", "Quest definition was not found.");
    if (before.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new ServiceError(409, "STALE_EDIT", "This quest changed after you opened it. Refresh before saving.");
    await verifyReferences(tx, input, id);
    // Curator notes are the sole Build 1 field explicitly allowed to bypass re-review.
    const beforeFields = before as unknown as Record<string, unknown>;
    const nextFields = fields(input) as unknown as Record<string, unknown>;
    const gameplayChanged = ["stableKey", "difficulty", "baseXp", "estimatedMinutes", "completionWindowHours", "completionType", "completionTarget", "standardEligible", "dailyEligible", "weeklyEligible", "questFamilyId", "title", "shortDescription", "costLevel", "socialRequirement", "safetyCategory", "curatorValueScore", "curatorDifficultyReason"].some((key) => beforeFields[key] !== nextFields[key]) || JSON.stringify(before.skills.map((x) => [x.skillId,x.isPrimary,x.rewardPercent]).sort()) !== JSON.stringify(input.skills.map((x) => [x.skillId,x.isPrimary,x.rewardPercent]).sort()) || JSON.stringify(before.varietyTags.map((x) => [x.varietyTagId,x.isPrimary]).sort()) !== JSON.stringify(input.varietyTags.map((x) => [x.varietyTagId,x.isPrimary]).sort());
    const reviewStatus = before.reviewStatus === "APPROVED" && gameplayChanged ? "PENDING_REVIEW" : before.reviewStatus;
    const quest = await tx.questDefinition.update({ where: { id }, data: { ...fields(input), reviewStatus, active: reviewStatus === "APPROVED" ? before.active : false, reviewedAt: reviewStatus === "PENDING_REVIEW" ? null : before.reviewedAt, reviewedById: reviewStatus === "PENDING_REVIEW" ? null : before.reviewedById, skills: { deleteMany: {}, create: input.skills }, varietyTags: { deleteMany: {}, create: input.varietyTags } }, include: questInclude });
    await tx.adminAuditLog.create({ data: { actorUserId: actorId, action: "UPDATE", entityType: "QuestDefinition", entityId: id, beforeData: snapshot(before), afterData: snapshot(quest) } });
    return quest;
  });
}

export async function transitionQuest(db: PrismaClient, actorId: string, id: string, raw: unknown) {
  const input = transitionSchema.parse(raw);
  return serializable(db, async (tx) => {
    const before = await tx.questDefinition.findUnique({ where: { id }, include: questInclude });
    if (!before) throw new ServiceError(404, "NOT_FOUND", "Quest definition was not found.");
    if (before.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new ServiceError(409, "STALE_EDIT", "This quest changed after you opened it. Refresh before continuing.");
    const definition = questInputSchema.parse({ stableKey: before.stableKey, title: before.title, shortDescription: before.shortDescription, difficulty: before.difficulty, baseXp: before.baseXp, estimatedMinutes: before.estimatedMinutes, completionWindowHours: before.completionWindowHours, completionType: before.completionType, completionTarget: before.completionTarget, standardEligible: before.standardEligible, dailyEligible: before.dailyEligible, weeklyEligible: before.weeklyEligible, familyId: before.questFamilyId, skills: before.skills.map(({ skillId, isPrimary, rewardPercent }) => ({ skillId, isPrimary, rewardPercent })), varietyTags: before.varietyTags.map(({ varietyTagId, isPrimary }) => ({ varietyTagId, isPrimary })), costLevel: before.costLevel, socialRequirement: before.socialRequirement, safetyCategory: before.safetyCategory, curatorValueScore: before.curatorValueScore, curatorDifficultyReason: before.curatorDifficultyReason, curatorNotes: before.curatorNotes });
    await verifyReferences(tx, definition, id);
    const allowed: Record<string, string[]> = { SUBMIT_REVIEW: ["DRAFT", "REJECTED"], APPROVE: ["PENDING_REVIEW"], REJECT: ["PENDING_REVIEW"], ACTIVATE: ["APPROVED"], DEACTIVATE: ["APPROVED"] };
    if (!allowed[input.action].includes(before.reviewStatus)) throw new ServiceError(409, "INVALID_TRANSITION", `${input.action} is not allowed from ${before.reviewStatus}.`);
    if (input.action === "ACTIVATE" && before.active) throw new ServiceError(409, "INVALID_TRANSITION", "Quest is already active.");
    if (input.action === "DEACTIVATE" && !before.active) throw new ServiceError(409, "INVALID_TRANSITION", "Quest is already inactive.");
    const data: Prisma.QuestDefinitionUncheckedUpdateInput = input.action === "SUBMIT_REVIEW" ? { reviewStatus: "PENDING_REVIEW", active: false, reviewedAt: null, reviewedById: null } : input.action === "APPROVE" ? { reviewStatus: "APPROVED", reviewedAt: new Date(), reviewedById: actorId } : input.action === "REJECT" ? { reviewStatus: "REJECTED", active: false, reviewedAt: new Date(), reviewedById: actorId } : { active: input.action === "ACTIVATE" };
    const quest = await tx.questDefinition.update({ where: { id }, data, include: questInclude });
    await tx.adminAuditLog.create({ data: { actorUserId: actorId, action: input.action, entityType: "QuestDefinition", entityId: id, beforeData: snapshot(before), afterData: snapshot(quest) } });
    return quest;
  });
}

function fields(input: QuestInput) { return { stableKey: input.stableKey, title: input.title, shortDescription: input.shortDescription, difficulty: input.difficulty, baseXp: input.baseXp, estimatedMinutes: input.estimatedMinutes, completionWindowHours: input.completionWindowHours, completionType: input.completionType, completionTarget: input.completionTarget, standardEligible: input.standardEligible, dailyEligible: input.dailyEligible, weeklyEligible: input.weeklyEligible, questFamilyId: input.familyId, costLevel: input.costLevel, socialRequirement: input.socialRequirement, safetyCategory: input.safetyCategory, curatorValueScore: input.curatorValueScore, curatorDifficultyReason: input.curatorDifficultyReason, curatorNotes: input.curatorNotes }; }
