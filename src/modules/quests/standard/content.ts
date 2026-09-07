import type { Prisma } from "../../../generated/prisma/client";
import { gameConfig } from "../../../config/game";
import { validateQuestSkillAllocation, validateQuestVarietyTags } from "../domain/allocations";

export const definitionInclude = { skills: true, varietyTags: true } satisfies Prisma.QuestDefinitionInclude;
export type Definition = Prisma.QuestDefinitionGetPayload<{ include: typeof definitionInclude }>;
export function validDefinition(q: Definition, skillId: string, canonicalIds: Set<string>) {
  const band = gameConfig.quests.difficultyXpBands[q.difficulty];
  return q.active && q.reviewStatus === "APPROVED" && q.standardEligible
    && q.skills.find((s) => s.isPrimary)?.skillId === skillId
    && q.skills.every((s) => canonicalIds.has(s.skillId))
    && validateQuestSkillAllocation(q.skills).success && validateQuestVarietyTags(q.varietyTags).success
    && q.completionWindowHours !== null && gameConfig.quests.standardCompletionWindowsHours.includes(q.completionWindowHours)
    && Number.isInteger(q.baseXp) && q.baseXp >= band.min && q.baseXp <= band.max
    && q.estimatedMinutes > 0 && !!q.title.trim() && !!q.shortDescription.trim()
    && ((q.completionType === "SINGLE" && q.completionTarget === 1) || (q.completionType === "COUNT" && q.completionTarget > 1));
}
export function previewSnapshots(q: Definition) {
  return { difficultySnapshot: q.difficulty, baseXpSnapshot: q.baseXp, completionTypeSnapshot: q.completionType,
    completionTargetSnapshot: q.completionTarget, completionWindowHoursSnapshot: q.completionWindowHours,
    rewardConfigVersionSnapshot: gameConfig.version, titleSnapshot: q.title, descriptionSnapshot: q.shortDescription, estimatedMinutesSnapshot: q.estimatedMinutes };
}
