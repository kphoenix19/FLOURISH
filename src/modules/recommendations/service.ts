import type { PrismaClient } from "../../generated/prisma/client";
import { gameConfig } from "../../config/game";
import { ServiceError } from "../../lib/service-error";
import { standardTransaction } from "../quests/standard/context";
import { reconcileExpiredInTransaction } from "../quests/standard/resolution";
import { reconcileInTransaction } from "../quests/standard/slots";
import { catchUpModifiers, primaryTag, weightedChoice, type RandomSource } from "../quests/standard/selection";
import { reasonCodes, scoreRecommendation, type RecommendationCandidate, type RecommendationInteraction } from "./scoring";

export type HomeRecommendation = { playerQuestId: string; slotId: string; skillCode: string; skillName: string; title: string; description: string; difficulty: string; estimatedMinutes: number; reasonCodes: string[]; calculatedAt: string };
const mapReason = (code: string) => ({ MATCHES_FOCUS: "Matches your Focus", CATCH_UP: "Skill needs attention", ADDS_VARIETY: "Something different", GOOD_DIFFICULTY_FIT: "Matches your experience" }[code] ?? code);

export type HomeRecommendationResult = (HomeRecommendation & { differentAvailable?: boolean }) | null;

export function getHomeRecommendation(db: PrismaClient, playerId: string, random: RandomSource = Math.random, now: () => Date = () => new Date(), excludePlayerQuestId?: string): Promise<HomeRecommendationResult> {
  return standardTransaction(db, playerId, async (context) => {
    const at = now(); await reconcileExpiredInTransaction(context, at); const slots = await reconcileInTransaction(context, random);
    const allEligible = slots.filter((s) => s.currentPlayerQuest?.status === "AVAILABLE" && context.valid(s.currentPlayerQuest.questDefinition, s.skillId));
    const persisted = await context.tx.playerRecommendation.findUnique({ where: { playerId } });
    const persistedSlot = persisted && !persisted.invalidatedAt ? allEligible.find((s) => s.currentPlayerQuestId === persisted.playerQuestId) : undefined;
    if (excludePlayerQuestId && persistedSlot?.currentPlayerQuestId !== excludePlayerQuestId) throw new ServiceError(409, "STALE_RECOMMENDATION", "That recommendation is no longer current. Your Home recommendation has been refreshed.");
    const eligible = excludePlayerQuestId ? allEligible.filter((s) => s.currentPlayerQuestId !== excludePlayerQuestId) : allEligible;
    const recommendationView = (slot: (typeof slots)[number], codes: string[], calculatedAt: Date, differentAvailable?: boolean) => { const q = slot.currentPlayerQuest!; const skill = context.state.skills.find((s) => s.id === slot.skillId)!; return { playerQuestId: q.id, slotId: slot.id, skillCode: skill.code, skillName: skill.name, title: q.questDefinition.title, description: q.questDefinition.shortDescription, difficulty: q.questDefinition.difficulty, estimatedMinutes: q.questDefinition.estimatedMinutes, reasonCodes: codes.map(mapReason), calculatedAt: calculatedAt.toISOString(), differentAvailable }; };
    if (excludePlayerQuestId && !eligible.length && persistedSlot?.currentPlayerQuestId === excludePlayerQuestId) return recommendationView(persistedSlot, persisted?.reasonCodes ?? [], persisted?.calculatedAt ?? at, false);
    let selected = persistedSlot; let reasons = persisted?.reasonCodes ?? []; let calculatedAt = persisted?.calculatedAt ?? at;
    if (excludePlayerQuestId) { selected = undefined; reasons = []; calculatedAt = at; }
    if (!selected) {
      if (!eligible.length) return null;
      const focus = Object.fromEntries(context.state.rows.map((r) => [r.skillId, r.focusPoints]));
      const catchUp = catchUpModifiers(context.progress.map((p) => ({ ...p, code: context.state.skills.find((s) => s.id === p.skillId)!.code })));
      const completed = await context.history();
      const interactionsRaw = await context.tx.questInteraction.findMany({ where: { playerId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: gameConfig.recommendations.interactionHistoryWindow * 8, include: { playerQuest: { include: { questDefinition: { include: { skills: true, varietyTags: true } } } } } });
      const interactions: RecommendationInteraction[] = interactionsRaw.flatMap((i) => { const quest = i.playerQuest; if (!quest) return []; const primary = quest.questDefinition.skills.find((s) => s.isPrimary); return primary ? [{ interactionType: i.interactionType, feedbackReason: i.feedbackReason, skillId: primary.skillId, primaryTagId: primaryTag(quest.questDefinition), difficulty: quest.difficultySnapshot, estimatedMinutes: quest.estimatedMinutesSnapshot ?? quest.questDefinition.estimatedMinutes }] : []; });
      const candidates = eligible.map((slot) => { const q = slot.currentPlayerQuest!; return { id: slot.id, playerQuestId: q.id, slotSkillId: slot.skillId, difficulty: q.questDefinition.difficulty, estimatedMinutes: q.questDefinition.estimatedMinutes, skills: q.questDefinition.skills, primaryTagId: primaryTag(q.questDefinition) } satisfies RecommendationCandidate; });
      const scored = candidates.map((candidate) => { const level = context.progress.find((p) => p.skillId === candidate.slotSkillId)!.currentLevel; const tags = completed.get(candidate.slotSkillId)!.map((q) => q.primaryTagId); return { candidate, factors: scoreRecommendation(candidate, { level, focus, catchUp, completedPrimaryTags: tags, interactions }, random) }; });
      const winner = weightedChoice(scored, scored.map((s) => s.factors.score), random); selected = eligible.find((s) => s.id === winner.candidate.id)!; reasons = reasonCodes(winner.factors); calculatedAt = at;
      await context.tx.playerRecommendation.upsert({ where: { playerId }, create: { playerId, playerQuestId: selected.currentPlayerQuestId!, reasonCodes: reasons, configVersion: gameConfig.version, calculatedAt }, update: { playerQuestId: selected.currentPlayerQuestId!, reasonCodes: reasons, configVersion: gameConfig.version, calculatedAt, invalidatedAt: null } });
      const q = selected.currentPlayerQuest!; await context.tx.questInteraction.create({ data: { playerId, playerQuestId: q.id, questDefinitionId: q.questDefinitionId, interactionType: "RECOMMENDED", createdAt: at } });
    }
    return recommendationView(selected, reasons, calculatedAt, excludePlayerQuestId ? true : undefined);
  });
}
