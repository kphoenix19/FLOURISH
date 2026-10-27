import { randomUUID } from "node:crypto";
import type { PrismaClient, QuestFeedbackReason } from "../../../generated/prisma/client";
import { gameConfig } from "../../../config/game";
import { ServiceError } from "../../../lib/service-error";
import { previewSnapshots, type Definition } from "./content";
import { currentSlots, occupiedDefinitions, standardTransaction, slotInclude, type StandardContext, type Slot } from "./context";
import { primaryTag, selectCandidate, type RandomSource } from "./selection";
import { standardState } from "./view";
import { reconcileExpiredInTransaction } from "./resolution";

export async function ensureSlotsInTransaction(context: StandardContext) {
  const { tx, state, playerId } = context;
  await tx.playerQuestSlot.createMany({ data: state.skills.flatMap((s) => Array.from({ length: gameConfig.quests.standardSlotsPerSkill }, (_, i) => ({ playerId, skillId: s.id, slotNumber: i + 1 }))), skipDuplicates: true });
  return currentSlots(context);
}
export function ensureStandardQuestSlots(db: PrismaClient, playerId: string) {
  return standardTransaction(db, playerId, ensureSlotsInTransaction);
}

// Caller holds the context's Player/library locks and owns this transaction.
// Phase 05 may reuse this after resolving the old quest in the same transaction.
export async function replaceStandardSlotQuest(context: StandardContext, slot: Slot, definition: Definition, options: { operationId?: string; action?: "REROLLED" | "UPGRADED"; feedback?: QuestFeedbackReason | null } = {}) {
  const { tx, playerId } = context;
  await tx.playerRecommendation.updateMany({ where: { playerId, invalidatedAt: null }, data: { invalidatedAt: new Date() } });
  const current = await tx.playerQuestSlot.findUniqueOrThrow({ where: { id: slot.id }, include: slotInclude });
  if (current.playerId !== playerId || current.currentPlayerQuestId !== slot.currentPlayerQuestId) throw new ServiceError(409, "SLOT_CHANGED", "This slot has changed. Refresh your quests.");
  const old = current.currentPlayerQuest;
  if (old && (old.playerId !== playerId || old.poolType !== "STANDARD")) throw new ServiceError(409, "SLOT_INTEGRITY", "The current slot needs repair.");
  if (old?.status === "ACCEPTED" || (old?.status === "EXPIRED" && !old.clearedAt)) throw new ServiceError(409, "QUEST_LOCKED", "This quest still occupies its slot.");
  if (!context.valid(definition, slot.skillId) || occupiedDefinitions(await currentSlots(context)).has(definition.id)) throw new ServiceError(409, "INVALID_REPLACEMENT", "The replacement is no longer available.");
  const operationId = options.operationId ?? randomUUID();
  if (old?.status === "AVAILABLE") {
    await tx.playerQuest.update({ where: { id: old.id }, data: { status: "REROLLED" } });
    // Content reconciliation is not player feedback and adds no negative signal.
    if (options.action) await tx.questInteraction.create({ data: { playerId, playerQuestId: old.id, questDefinitionId: old.questDefinitionId, interactionType: options.action, feedbackReason: options.feedback ?? null, operationId } });
  }
  const quest = await tx.playerQuest.create({ data: { playerId, questDefinitionId: definition.id, poolType: "STANDARD", status: "AVAILABLE", currentProgress: 0, ...previewSnapshots(definition) } });
  await tx.playerQuestSlot.update({ where: { id: slot.id }, data: { currentPlayerQuestId: quest.id } });
  await tx.questInteraction.create({ data: { playerId, playerQuestId: quest.id, questDefinitionId: definition.id, interactionType: "SHOWN", operationId } });
  return quest;
}
export async function reconcileInTransaction(context: StandardContext, random: RandomSource) {
  const slots = await ensureSlotsInTransaction(context);
  const occupied = occupiedDefinitions(slots);
  if (occupied.size !== slots.filter((s) => s.currentPlayerQuest).length) throw new ServiceError(409, "DUPLICATE_ASSIGNMENT", "Duplicate current quests require repair.");
  for (const slot of slots) {
    const q = slot.currentPlayerQuest;
    if (q && (q.playerId !== context.playerId || q.poolType !== "STANDARD")) throw new ServiceError(409, "SLOT_INTEGRITY", "The current slot needs repair.");
    if (q?.status === "ACCEPTED" || (q?.status === "EXPIRED" && !q.clearedAt)) continue;
    if (q?.status === "AVAILABLE" && context.valid(q.questDefinition, slot.skillId)) continue;
    const target = selectCandidate(context.candidates(slot.skillId), { ...await context.selection(slot.skillId, occupied), excluded: new Set(q ? [q.questDefinitionId] : []), avoidTagId: q ? primaryTag(q.questDefinition) : null }, random);
    await replaceStandardSlotQuest(context, slot, target);
    if (q) occupied.delete(q.questDefinitionId);
    occupied.add(target.id);
  }
  return standardState(context);
}
export function reconcileStandardQuestSlots(db: PrismaClient, playerId: string, random: RandomSource = Math.random, now: () => Date = () => new Date()) {
  return standardTransaction(db, playerId, async (context) => { const at = now(); await reconcileExpiredInTransaction(context, at); await reconcileInTransaction(context, random); return standardState(context, at); });
}
