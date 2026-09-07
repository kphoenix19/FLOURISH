import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "../../../generated/prisma/client";
import { ServiceError } from "../../../lib/service-error";
import { validateQuestSkillAllocation } from "../domain/allocations";
import { previewSnapshots } from "./content";
import { currentSlots, occupiedDefinitions, standardTransaction } from "./context";
import { replaceStandardSlotQuest } from "./slots";
import { nextFamilyTier, primaryTag, selectCandidate, type RandomSource } from "./selection";
import { standardState } from "./view";

export const feedbackSchema = z.object({ feedbackReason: z.enum(["TOO_HARD", "NO_TIME", "NOT_INTERESTED", "JUST_DIFFERENT"]).nullable().optional() }).strict();
export const emptyActionSchema = z.object({}).strict();
export type StandardAction = "accept" | "reroll" | "bump";
export function mutateStandardQuest(db: PrismaClient, playerId: string, questId: string, action: StandardAction, input: unknown = {}, options: { random?: RandomSource; now?: () => Date } = {}) {
  z.string().uuid().parse(questId);
  const feedback = action === "reroll" ? feedbackSchema.parse(input).feedbackReason : (emptyActionSchema.parse(input), undefined);
  return standardTransaction(db, playerId, async (context) => {
    const slots = await currentSlots(context);
    const slot = slots.find((s) => s.currentPlayerQuestId === questId);
    if (!slot) {
      const owned = await context.tx.playerQuest.findFirst({ where: { id: questId, playerId } });
      throw new ServiceError(owned ? 409 : 404, "QUEST_NOT_CURRENT", owned ? "This quest has already been replaced. Refresh your quests." : "Quest not found.");
    }
    const q = slot.currentPlayerQuest!;
    if (q.playerId !== playerId || q.poolType !== "STANDARD") throw new ServiceError(404, "QUEST_NOT_FOUND", "Quest not found.");
    if (action === "accept" && q.status === "ACCEPTED") {
      if (!q.acceptedAt || !q.deadlineAt || !q.completionWindowHoursSnapshot || q.deadlineAt.getTime() !== q.acceptedAt.getTime() + q.completionWindowHoursSnapshot * 3_600_000 || !validateQuestSkillAllocation(q.skillSnapshots).success || q.skillSnapshots.find((s) => s.isPrimary)?.skillId !== slot.skillId) throw new ServiceError(409, "SNAPSHOT_INTEGRITY", "The accepted quest needs repair.");
      return standardState(context);
    }
    if (q.status !== "AVAILABLE") throw new ServiceError(409, "QUEST_LOCKED", "Only available Standard quests allow this action.");
    const operationId = randomUUID();
    await context.tx.playerRecommendation.updateMany({ where: { playerId, invalidatedAt: null }, data: { invalidatedAt: (options.now ?? (() => new Date()))() } });
    if (action === "accept") {
      if (!context.valid(q.questDefinition, slot.skillId)) throw new ServiceError(409, "OFFER_CHANGED", "This offer is no longer valid. Refresh your quests for a replacement.");
      const acceptedAt = (options.now ?? (() => new Date()))();
      const snapshot = previewSnapshots(q.questDefinition);
      await context.tx.playerQuestSkillSnapshot.deleteMany({ where: { playerQuestId: q.id } });
      await context.tx.playerQuestSkillSnapshot.createMany({ data: q.questDefinition.skills.map((s) => ({ playerQuestId: q.id, skillId: s.skillId, isPrimary: s.isPrimary, rewardPercent: s.rewardPercent })) });
      await context.tx.playerQuest.update({ where: { id: q.id }, data: { ...snapshot, status: "ACCEPTED", acceptedAt, deadlineAt: new Date(acceptedAt.getTime() + snapshot.completionWindowHoursSnapshot! * 3_600_000), currentProgress: 0 } });
      await context.tx.questInteraction.create({ data: { playerId, playerQuestId: q.id, questDefinitionId: q.questDefinitionId, interactionType: "ACCEPTED", operationId } });
    } else {
      const occupied = occupiedDefinitions(slots);
      const candidates = context.candidates(slot.skillId);
      const target = action === "bump" ? nextFamilyTier(q.questDefinition, candidates, occupied) : selectCandidate(candidates, { ...context.selection(slot.skillId, occupied), excluded: new Set([q.questDefinitionId]), avoidTagId: primaryTag(q.questDefinition) }, options.random ?? Math.random);
      if (!target) throw new ServiceError(409, "NO_HIGHER_TIER", "No higher available family tier exists.");
      await replaceStandardSlotQuest(context, slot, target, { operationId, action: action === "bump" ? "UPGRADED" : "REROLLED", feedback });
    }
    return standardState(context);
  });
}
