import { gameConfig } from "../../config/game";

type Curve = { base: number; linear: number; quadratic: number };
function assertXp(xp: number) {
  if (!Number.isSafeInteger(xp) || xp < 0) throw new RangeError("XP must be a non-negative safe integer.");
}
function threshold(level: number, curve: Curve) {
  if (!Number.isSafeInteger(level) || level < 1) throw new RangeError("Level must be a positive safe integer.");
  const count = level - 1;
  const sumK = count * (count - 1) / 2;
  const sumK2 = count * (count - 1) * (2 * count - 1) / 6;
  const result = count * curve.base + curve.linear * sumK + curve.quadratic * sumK2;
  if (!Number.isSafeInteger(result)) throw new RangeError("Level threshold exceeds safe integer range.");
  return result;
}
function levelForXp(xp: number, curve: Curve, cap?: number) {
  assertXp(xp);
  let low = 1, high = cap ?? 2;
  if (!cap) while (threshold(high, curve) <= xp) high *= 2;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (threshold(mid, curve) <= xp) low = mid; else high = mid - 1;
  }
  return low;
}
function progress(xp: number, level: number, curve: Curve, cap?: number) {
  const startXp = threshold(level, curve);
  if (cap && level >= cap) return { level, currentXp: xp, levelStartXp: startXp, nextLevelXp: null, xpIntoLevel: xp - startXp, xpToNextLevel: null, percent: 100 };
  const nextLevelXp = threshold(level + 1, curve);
  return { level, currentXp: xp, levelStartXp: startXp, nextLevelXp, xpIntoLevel: xp - startXp, xpToNextLevel: nextLevelXp - xp, percent: Math.floor((xp - startXp) * 100 / (nextLevelXp - startXp)) };
}
export const skillXpRequiredForLevel = (level: number) => threshold(level, gameConfig.progression.levelCurves.skill);
export const overallXpRequiredForLevel = (level: number) => threshold(level, gameConfig.progression.levelCurves.overall);
export const skillLevelForXp = (xp: number) => levelForXp(xp, gameConfig.progression.levelCurves.skill, gameConfig.progression.skillLevelCap);
export const overallLevelForXp = (xp: number) => levelForXp(xp, gameConfig.progression.levelCurves.overall);
export const skillProgressWithinLevel = (xp: number) => (assertXp(xp), progress(xp, skillLevelForXp(xp), gameConfig.progression.levelCurves.skill, gameConfig.progression.skillLevelCap));
export const overallProgressWithinLevel = (xp: number) => (assertXp(xp), progress(xp, overallLevelForXp(xp), gameConfig.progression.levelCurves.overall));
