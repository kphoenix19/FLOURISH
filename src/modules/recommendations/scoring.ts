import { gameConfig } from "../../config/game";
import type { Difficulty, QuestFeedbackReason, QuestInteractionType } from "../../generated/prisma/enums";
import { difficultyOrder, difficultyWeights, type RandomSource } from "../quests/standard/selection";

export type RecommendationCandidate = {
  id: string; playerQuestId: string; slotSkillId: string; difficulty: Difficulty; estimatedMinutes: number;
  skills: { skillId: string; rewardPercent: number }[]; primaryTagId: string | null;
};
export type RecommendationInteraction = {
  interactionType: QuestInteractionType; feedbackReason: QuestFeedbackReason | null; skillId: string;
  primaryTagId: string | null; difficulty: Difficulty; estimatedMinutes: number;
};
export type RecommendationInputs = {
  level: number; focus: Record<string, number>; catchUp: Record<string, number>;
  completedPrimaryTags: (string | null)[]; interactions: RecommendationInteraction[];
};
export type RecommendationFactors = { difficulty: number; focus: number; catchUp: number; variety: number; history: number; randomness: number };

export function difficultyFit(level: number, difficulty: Difficulty) {
  const weights = difficultyWeights(level); const peak = Math.max(...Object.values(weights));
  const preferred = difficultyOrder.findIndex((d) => weights[d] === peak); const distance = Math.abs(difficultyOrder.indexOf(difficulty) - preferred);
  return distance === 0 ? gameConfig.recommendations.homeDifficultyFit.appropriate : distance === 1 ? gameConfig.recommendations.homeDifficultyFit.slightMismatch : gameConfig.recommendations.homeDifficultyFit.extremeMismatch;
}
const weighted = (skills: RecommendationCandidate["skills"], values: Record<string, number>) => skills.reduce((sum, s) => sum + s.rewardPercent * values[s.skillId], 0) / 100;
export function historyModifier(candidate: RecommendationCandidate, rows: RecommendationInteraction[]) {
  const h = gameConfig.recommendations.historyModifiers;
  const relevant = rows.filter((r) => r.skillId === candidate.slotSkillId && r.primaryTagId === candidate.primaryTagId).slice(0, gameConfig.recommendations.interactionHistoryWindow);
  const modifiers = relevant.flatMap((r) => {
    if (r.interactionType === "COMPLETED") return [h.recentlyCompletedSimilar];
    if (r.interactionType === "ABANDONED") return [h.recentlyAbandonedSimilar];
    if (r.interactionType === "EXPIRED") return [h.recentlyExpiredSimilar];
    if (r.interactionType !== "REROLLED") return [];
    if (!r.feedbackReason) return [h.genericReroll];
    if (r.feedbackReason === "JUST_DIFFERENT") return [h.justDifferent];
    if (r.feedbackReason === "NOT_INTERESTED") return [h.notInterested];
    if (r.feedbackReason === "NO_TIME" && candidate.estimatedMinutes >= r.estimatedMinutes) return [h.noTime];
    if (r.feedbackReason === "TOO_HARD" && difficultyOrder.indexOf(candidate.difficulty) >= difficultyOrder.indexOf(r.difficulty)) return [h.tooHard];
    return [];
  });
  return modifiers.length ? Math.min(...modifiers) : h.none;
}
export function scoreRecommendation(candidate: RecommendationCandidate, input: RecommendationInputs, random: RandomSource): RecommendationFactors & { score: number } {
  const occurrences = input.completedPrimaryTags.slice(0, gameConfig.recommendations.varietyHistoryWindow).filter((tag) => tag === candidate.primaryTagId).length;
  const factors: RecommendationFactors = {
    difficulty: difficultyFit(input.level, candidate.difficulty),
    focus: weighted(candidate.skills, Object.fromEntries(Object.entries(input.focus).map(([id, points]) => [id, gameConfig.focus.modifiers[points]]))),
    catchUp: weighted(candidate.skills, input.catchUp),
    variety: gameConfig.recommendations.varietyModifiersByOccurrences[occurrences] ?? 1,
    history: historyModifier(candidate, input.interactions),
    randomness: gameConfig.recommendations.randomness.min + random() * (gameConfig.recommendations.randomness.max - gameConfig.recommendations.randomness.min),
  };
  return { ...factors, score: Object.values(factors).reduce((product, value) => product * value, 1) };
}
export function reasonCodes(f: RecommendationFactors) {
  const reasons: string[] = [];
  if (f.focus > 1) reasons.push("MATCHES_FOCUS");
  if (f.catchUp > 1) reasons.push("CATCH_UP");
  if (f.variety === 1) reasons.push("ADDS_VARIETY");
  if (f.difficulty === 1) reasons.push("GOOD_DIFFICULTY_FIT");
  return reasons.slice(0, 3);
}
