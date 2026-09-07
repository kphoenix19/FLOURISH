import { gameConfig } from "../../config/game";
import type { Difficulty } from "../../generated/prisma/enums";
import { weightedChoice, type RandomSource } from "../quests/standard/selection";

export type ChallengeCandidate = { id: string; difficulty: Difficulty; primarySkillId: string; skills: { skillId: string; rewardPercent: number }[] };
export function challengeCandidateScore(candidate: ChallengeCandidate, poolType: "DAILY" | "WEEKLY", focus: Record<string, number>, catchUp: Record<string, number>, random: RandomSource) {
  const distribution = poolType === "DAILY" ? gameConfig.difficultyDistributions.daily : gameConfig.difficultyDistributions.weekly;
  const focusFactor = candidate.skills.reduce((sum, s) => sum + s.rewardPercent * gameConfig.focus.modifiers[focus[s.skillId]], 0) / 100;
  const catchUpFactor = candidate.skills.reduce((sum, s) => sum + s.rewardPercent * catchUp[s.skillId], 0) / 100;
  const { min, max } = gameConfig.recommendations.randomness;
  return distribution[candidate.difficulty] * focusFactor * catchUpFactor * (min + random() * (max - min));
}
export function selectChallengeSet<T extends ChallengeCandidate>(candidates: T[], count: number, poolType: "DAILY" | "WEEKLY", focus: Record<string, number>, catchUp: Record<string, number>, excluded: Set<string>, random: RandomSource) {
  const selected: T[] = []; const skills = new Set<string>();
  while (selected.length < count) {
    const pool = candidates.filter((q) => !excluded.has(q.id) && !selected.some((x) => x.id === q.id) && !skills.has(q.primarySkillId) && q.difficulty !== "LEGENDARY");
    if (!pool.length) return null;
    const choice = weightedChoice(pool, pool.map((q) => challengeCandidateScore(q, poolType, focus, catchUp, random)), random);
    selected.push(choice); skills.add(choice.primarySkillId);
  }
  return selected;
}
