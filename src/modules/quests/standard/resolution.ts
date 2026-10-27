import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "../../../generated/prisma/client";
import { gameConfig } from "../../../config/game";
import { ServiceError } from "../../../lib/service-error";
import { overallLevelForXp, skillLevelForXp } from "../../progression/levels";
import { allocateLargestRemainder, percentRoundHalfUp } from "../../progression/math";
import { advanceStreak, localDate, streakBonusPercent } from "../../progression/streaks";
import { currentSlots, occupiedDefinitions, standardTransaction, type StandardContext, type Slot } from "./context";
import { primaryTag, selectCandidate, type RandomSource } from "./selection";
import { replaceStandardSlotQuest } from "./slots";
import { standardState } from "./view";

export type ResolutionAction = "complete" | "abandon" | "clear";
export type ResolutionFeedback = { action: ResolutionAction; overallXpGained: number; previousOverallLevel: number; newOverallLevel: number; skills: { skillCode: string; xpChange: number; catchUpBonusXp: number; streakBonusXp: number; previousLevel: number; newLevel: number }[] };
const dateOnly = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
function assertAcceptedSnapshots(q: NonNullable<Slot["currentPlayerQuest"]>) {
  if (!q.acceptedAt || !q.deadlineAt || !q.skillSnapshots.length || q.skillSnapshots.reduce((n, s) => n + s.rewardPercent, 0) !== 100) throw new ServiceError(409, "SNAPSHOT_INTEGRITY", "The accepted quest needs repair.");
}
async function storePenalty(context: StandardContext, q: NonNullable<Slot["currentPlayerQuest"]>, now: Date) {
  assertAcceptedSnapshots(q);
  const total = percentRoundHalfUp(q.baseXpSnapshot, gameConfig.quests.failurePenaltyPercent);
  const codes = Object.fromEntries(context.state.skills.map((s) => [s.id, s.code]));
  const allocation = allocateLargestRemainder(total, q.skillSnapshots.map((s) => ({ key: codes[s.skillId], weight: s.rewardPercent })));
  await context.tx.playerQuest.update({ where: { id: q.id }, data: { status: "EXPIRED", expiredAt: now, failurePenaltyXp: total } });
  await context.tx.playerQuestFailurePenaltySkill.createMany({ data: q.skillSnapshots.map((s) => ({ playerQuestId: q.id, skillId: s.skillId, intendedPenaltyXp: allocation[codes[s.skillId]] })) });
  await context.tx.questInteraction.create({ data: { playerId: context.playerId, playerQuestId: q.id, questDefinitionId: q.questDefinitionId, interactionType: "EXPIRED", operationId: randomUUID(), createdAt: now } });
}
export async function reconcileExpiredInTransaction(context: StandardContext, now: Date) {
  let expiredCount = 0;
  for (const slot of await currentSlots(context)) {
    const q = slot.currentPlayerQuest;
    if (q?.status === "ACCEPTED" && q.deadlineAt && now.getTime() > q.deadlineAt.getTime()) { await storePenalty(context, q, now); await context.tx.playerRecommendation.updateMany({ where: { playerId: context.playerId, invalidatedAt: null }, data: { invalidatedAt: now } }); expiredCount++; }
  }
  return expiredCount;
}

export function reconcileExpiredStandardQuests(db: PrismaClient, playerId: string, now: Date = new Date()) {
  return standardTransaction(db, playerId, (context) => reconcileExpiredInTransaction(context, now));
}
async function refill(context: StandardContext, slot: Slot, random: RandomSource) {
  const occupied = occupiedDefinitions(await currentSlots(context)); occupied.delete(slot.currentPlayerQuest!.questDefinitionId);
  const target = selectCandidate(context.candidates(slot.skillId), { ...await context.selection(slot.skillId, occupied), occupied, excluded: new Set([slot.currentPlayerQuest!.questDefinitionId]), avoidTagId: primaryTag(slot.currentPlayerQuest!.questDefinition) }, random);
  await replaceStandardSlotQuest(context, slot, target);
}
async function applyPenalty(context: StandardContext, q: NonNullable<Slot["currentPlayerQuest"]>, now: Date, operationId: string) {
  const details = await context.tx.playerQuestFailurePenaltySkill.findMany({ where: { playerQuestId: q.id }, orderBy: { skillId: "asc" } });
  if (!details.length) throw new ServiceError(409, "PENALTY_INTEGRITY", "The failure penalty needs repair.");
  const changes: ResolutionFeedback["skills"] = [];
  for (const detail of details) {
    const row = context.progress.find((p) => p.skillId === detail.skillId)!;
    const actual = Math.min(row.currentXp, detail.intendedPenaltyXp);
    const nextXp = row.currentXp - actual; const nextLevel = skillLevelForXp(nextXp);
    await context.tx.playerSkillProgress.update({ where: { playerId_skillId: { playerId: context.playerId, skillId: detail.skillId } }, data: { currentXp: nextXp, currentLevel: nextLevel } });
    await context.tx.playerQuestFailurePenaltySkill.update({ where: { playerQuestId_skillId: { playerQuestId: q.id, skillId: detail.skillId } }, data: { actualAppliedPenaltyXp: actual } });
    if (actual > 0) await context.tx.xpTransaction.create({ data: { operationId, playerId: context.playerId, playerQuestId: q.id, skillId: detail.skillId, xpScope: "SKILL", transactionType: "QUEST_FAILURE", amount: -actual, createdAt: now } });
    changes.push({ skillCode: context.state.skills.find((s) => s.id === detail.skillId)!.code, xpChange: -actual, catchUpBonusXp: 0, streakBonusXp: 0, previousLevel: row.currentLevel, newLevel: nextLevel });
    row.currentXp = nextXp; row.currentLevel = nextLevel;
  }
  return changes;
}
async function complete(context: StandardContext, slot: Slot, now: Date, random: RandomSource) {
  const q = slot.currentPlayerQuest!; assertAcceptedSnapshots(q);
  // Preserve the original pre-completion history used by immediate slot refill.
  await context.history();
  const operationId = randomUUID();
  const codes = Object.fromEntries(context.state.skills.map((s) => [s.id, s.code]));
  const base = allocateLargestRemainder(q.baseXpSnapshot, q.skillSnapshots.map((s) => ({ key: codes[s.skillId], weight: s.rewardPercent })));
  const lowest = [...context.progress].sort((a, b) => a.currentLevel - b.currentLevel || a.currentXp - b.currentXp || codes[a.skillId].localeCompare(codes[b.skillId]))[0].skillId;
  const streakRows = await context.tx.playerSkillStreak.findMany({ where: { playerId: context.playerId } });
  const day = localDate(now, context.state.player.timezone!);
  const rewards = q.skillSnapshots.map((snap) => {
    const prior = streakRows.find((s) => s.skillId === snap.skillId)!;
    const streak = advanceStreak(prior.currentStreakDays, prior.longestStreakDays, dateOnly(prior.lastQualifyingDate), day);
    const baseSkillXp = base[codes[snap.skillId]];
    const catchUpBonusXp = snap.skillId === lowest ? percentRoundHalfUp(baseSkillXp, gameConfig.catchUp.xpBonusPercent) : 0;
    const streakBonusXp = percentRoundHalfUp(baseSkillXp, streakBonusPercent(streak.currentStreakDays));
    return { snap, streak, baseSkillXp, catchUpBonusXp, streakBonusXp, finalSkillXp: baseSkillXp + catchUpBonusXp + streakBonusXp };
  });
  const finalOverallXp = rewards.reduce((sum, r) => sum + r.finalSkillXp, 0);
  const reward = await context.tx.questReward.create({ data: { operationId, playerQuestId: q.id, baseXp: q.baseXpSnapshot, catchUpBonusXp: rewards.reduce((n, r) => n + r.catchUpBonusXp, 0), streakBonusXp: rewards.reduce((n, r) => n + r.streakBonusXp, 0), finalOverallXp, calculatedAt: now } });
  const changes: ResolutionFeedback["skills"] = [];
  for (const r of rewards) {
    await context.tx.questSkillReward.create({ data: { questRewardId: reward.id, skillId: r.snap.skillId, rewardPercent: r.snap.rewardPercent, baseSkillXp: r.baseSkillXp, bonusSkillXp: r.catchUpBonusXp + r.streakBonusXp, catchUpBonusXp: r.catchUpBonusXp, streakBonusXp: r.streakBonusXp, finalSkillXp: r.finalSkillXp } });
    const p = context.progress.find((x) => x.skillId === r.snap.skillId)!; const nextXp = p.currentXp + r.finalSkillXp;
    await context.tx.playerSkillProgress.update({ where: { playerId_skillId: { playerId: context.playerId, skillId: r.snap.skillId } }, data: { currentXp: nextXp, lifetimeXp: { increment: r.finalSkillXp }, currentLevel: skillLevelForXp(nextXp) } });
    await context.tx.playerSkillStreak.update({ where: { playerId_skillId: { playerId: context.playerId, skillId: r.snap.skillId } }, data: { ...r.streak, lastQualifyingDate: new Date(`${r.streak.lastQualifyingDate}T00:00:00Z`) } });
    for (const xpScope of ["SKILL", "LIFETIME_SKILL"] as const) await context.tx.xpTransaction.create({ data: { operationId, playerId: context.playerId, playerQuestId: q.id, skillId: r.snap.skillId, xpScope, transactionType: "QUEST_COMPLETION", amount: r.finalSkillXp, createdAt: now } });
    changes.push({ skillCode: codes[r.snap.skillId], xpChange: r.finalSkillXp, catchUpBonusXp: r.catchUpBonusXp, streakBonusXp: r.streakBonusXp, previousLevel: p.currentLevel, newLevel: skillLevelForXp(nextXp) });
    p.currentXp = nextXp; p.lifetimeXp += r.finalSkillXp; p.currentLevel = skillLevelForXp(nextXp);
  }
  const overall = await context.tx.playerProgress.findUniqueOrThrow({ where: { playerId: context.playerId } }); const overallXp = overall.overallXp + finalOverallXp;
  await context.tx.playerProgress.update({ where: { playerId: context.playerId }, data: { overallXp, overallLevel: overallLevelForXp(overallXp) } });
  await context.tx.xpTransaction.create({ data: { operationId, playerId: context.playerId, playerQuestId: q.id, xpScope: "OVERALL", transactionType: "QUEST_COMPLETION", amount: finalOverallXp, createdAt: now } });
  await context.tx.playerQuest.update({ where: { id: q.id }, data: { status: "COMPLETED", completedAt: now } });
  await context.tx.questInteraction.create({ data: { operationId, playerId: context.playerId, playerQuestId: q.id, questDefinitionId: q.questDefinitionId, interactionType: "COMPLETED", createdAt: now } });
  await refill(context, slot, random);
  return { action: "complete", overallXpGained: finalOverallXp, previousOverallLevel: overall.overallLevel, newOverallLevel: overallLevelForXp(overallXp), skills: changes } satisfies ResolutionFeedback;
}
export async function resolveStandardQuest(db: PrismaClient, playerId: string, questId: string, action: ResolutionAction, options: { now?: () => Date; random?: RandomSource } = {}) {
  z.string().uuid().parse(questId);
  const result = await standardTransaction(db, playerId, async (context) => {
    const now = (options.now ?? (() => new Date()))(); await reconcileExpiredInTransaction(context, now);
    const slot = (await currentSlots(context)).find((s) => s.currentPlayerQuestId === questId);
    if (!slot) { const owned = await context.tx.playerQuest.findFirst({ where: { id: questId, playerId } }); throw new ServiceError(owned ? 409 : 404, "QUEST_NOT_CURRENT", owned ? "This quest no longer occupies its slot." : "Quest not found."); }
    const q = slot.currentPlayerQuest!; const random = options.random ?? Math.random;
    await context.tx.playerRecommendation.updateMany({ where: { playerId, invalidatedAt: null }, data: { invalidatedAt: now } });
    if (action === "complete") {
      if (q.status === "EXPIRED") return { expired: true as const };
      if (q.status !== "ACCEPTED") throw new ServiceError(409, "INVALID_STATUS", "Only an accepted quest can be completed.");
      const feedback = await complete(context, slot, now, random); return standardState(context, now, feedback);
    } else if (action === "abandon") {
      if (q.status === "EXPIRED") return standardState(context);
      if (q.status !== "ACCEPTED") throw new ServiceError(409, "INVALID_STATUS", "Only an accepted quest can be abandoned.");
      await storePenalty(context, q, now); const operationId = randomUUID(); const skills = await applyPenalty(context, q, now, operationId);
      await context.tx.playerQuest.update({ where: { id: q.id }, data: { status: "ABANDONED", expiredAt: null, abandonedAt: now, failurePenaltyAppliedAt: now } });
      await context.tx.questInteraction.deleteMany({ where: { playerQuestId: q.id, interactionType: "EXPIRED" } });
      await context.tx.questInteraction.create({ data: { operationId, playerId, playerQuestId: q.id, questDefinitionId: q.questDefinitionId, interactionType: "ABANDONED", createdAt: now } }); await refill(context, slot, random); return standardState(context, now, { action, overallXpGained: 0, previousOverallLevel: (await context.tx.playerProgress.findUniqueOrThrow({ where: { playerId } })).overallLevel, newOverallLevel: (await context.tx.playerProgress.findUniqueOrThrow({ where: { playerId } })).overallLevel, skills });
    } else {
      if (q.status !== "EXPIRED" || q.clearedAt || q.failurePenaltyAppliedAt) throw new ServiceError(409, "INVALID_STATUS", "Only an uncleared expired quest can be cleared.");
      const operationId = randomUUID(); const skills = await applyPenalty(context, q, now, operationId);
      await context.tx.playerQuest.update({ where: { id: q.id }, data: { clearedAt: now, failurePenaltyAppliedAt: now } });
      await context.tx.questInteraction.create({ data: { operationId, playerId, playerQuestId: q.id, questDefinitionId: q.questDefinitionId, interactionType: "CLEARED", createdAt: now } }); await refill(context, slot, random); const level = (await context.tx.playerProgress.findUniqueOrThrow({ where: { playerId } })).overallLevel; return standardState(context, now, { action, overallXpGained: 0, previousOverallLevel: level, newOverallLevel: level, skills });
    }
    return standardState(context, now);
  });
  // Commit lazy expiration and its penalty snapshot before rejecting completion.
  if ("expired" in result) throw new ServiceError(409, "QUEST_EXPIRED", "This quest expired and must be cleared without a reward.");
  return result;
}
