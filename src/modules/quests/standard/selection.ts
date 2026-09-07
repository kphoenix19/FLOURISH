import { gameConfig } from "../../../config/game";
import type { Difficulty } from "../../../generated/prisma/enums";
import { ServiceError } from "../../../lib/service-error";

export const difficultyOrder: Difficulty[] = ["EASY", "MEDIUM", "HARD", "EPIC", "LEGENDARY"];
export type RandomSource = () => number;
export type Candidate = {
  id: string; difficulty: Difficulty; questFamilyId: string | null;
  skills: { skillId: string; rewardPercent: number; isPrimary: boolean }[];
  varietyTags: { varietyTagId: string; isPrimary: boolean }[];
};
export type SelectionContext = {
  level: number; focus: Record<string, number>; catchUp: Record<string, number>;
  occupied: Set<string>; excluded?: Set<string>;
  recent: { definitionId: string; primaryTagId: string | null }[];
  avoidTagId?: string | null;
};
export const primaryTag = (q: Candidate) => q.varietyTags.find((t) => t.isPrimary)?.varietyTagId ?? null;
export function difficultyWeights(level: number) {
  const band = gameConfig.difficultyDistributions.standardBySkillLevel.find((b) => level >= b.minLevel && level <= b.maxLevel);
  if (!band) throw new ServiceError(409, "INVALID_LEVEL", "Skill level is outside the supported range.");
  return band.weights;
}
export function catchUpModifiers(rows: { skillId: string; code: string; currentLevel: number; currentXp: number }[]) {
  return Object.fromEntries([...rows].sort((a, b) => a.currentLevel - b.currentLevel || a.currentXp - b.currentXp || a.code.localeCompare(b.code)).map((r, i) => [r.skillId, gameConfig.catchUp.recommendationModifiersByRank[i + 1] ?? 1]));
}
export function candidateScore(q: Candidate, context: SelectionContext, random: RandomSource) {
  const focus = q.skills.reduce((sum, s) => sum + s.rewardPercent * gameConfig.focus.modifiers[context.focus[s.skillId]], 0) / 100;
  const catchUp = q.skills.reduce((sum, s) => sum + s.rewardPercent * context.catchUp[s.skillId], 0) / 100;
  const occurrences = context.recent.filter((r) => r.primaryTagId === primaryTag(q)).length;
  const variety = gameConfig.recommendations.varietyModifiersByOccurrences[occurrences] ?? 1;
  const history = occurrences ? gameConfig.recommendations.historyModifiers.recentlyCompletedSimilar : 1;
  const { min, max } = gameConfig.recommendations.randomness;
  return difficultyWeights(context.level)[q.difficulty] * focus * catchUp * variety * history * (min + random() * (max - min));
}
export function weightedChoice<T>(items: readonly T[], weights: readonly number[], random: RandomSource): T {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!items.length || items.length !== weights.length || !Number.isFinite(total) || total <= 0 || weights.some((w) => w < 0)) throw new ServiceError(503, "NO_STANDARD_CANDIDATE", "No valid Standard quest is available. Check the curated library.");
  const roll = random();
  if (roll < 0 || roll >= 1 || !Number.isFinite(roll)) throw new Error("Random source must return a value in [0, 1).");
  let threshold = roll * total;
  for (let i = 0; i < items.length; i++) { threshold -= weights[i]; if (threshold < 0) return items[i]; }
  return items[items.length - 1];
}
export function selectCandidate<T extends Candidate>(candidates: T[], context: SelectionContext, random: RandomSource = Math.random): T {
  let pool = candidates.filter((q) => !context.occupied.has(q.id) && !context.excluded?.has(q.id));
  const fresh = pool.filter((q) => !context.recent.some((r) => r.definitionId === q.id));
  if (fresh.length) pool = fresh;
  const different = pool.filter((q) => primaryTag(q) !== context.avoidTagId);
  if (context.avoidTagId && different.length) pool = different;
  return weightedChoice(pool, pool.map((q) => candidateScore(q, context, random)), random);
}
export function nextFamilyTier<T extends Candidate>(current: Candidate, candidates: T[], occupied: Set<string>): T | undefined {
  if (!current.questFamilyId) return undefined;
  return candidates.filter((q) => q.questFamilyId === current.questFamilyId && difficultyOrder.indexOf(q.difficulty) > difficultyOrder.indexOf(current.difficulty) && !occupied.has(q.id)).sort((a, b) => difficultyOrder.indexOf(a.difficulty) - difficultyOrder.indexOf(b.difficulty))[0];
}
