import { gameConfig } from "../../../config/game";

export const FLOURISH_SKILL_CODES = ["F", "L", "O", "U", "R", "I", "S", "H"] as const;
export type FlourishSkillCode = (typeof FLOURISH_SKILL_CODES)[number];
export type FocusValidationResult = { success: true } | { success: false; errors: string[] };

export function initialFocusAllocation(): Record<FlourishSkillCode, number> {
  const { totalPoints, minPerSkill, maxPerSkill } = gameConfig.focus;
  if (minPerSkill * FLOURISH_SKILL_CODES.length > totalPoints || totalPoints > maxPerSkill * FLOURISH_SKILL_CODES.length) throw new Error("Invalid Focus configuration");
  return Object.fromEntries(FLOURISH_SKILL_CODES.map((code) => [code, minPerSkill])) as Record<FlourishSkillCode, number>;
}

export function validateFocusAllocation(
  allocation: Readonly<Partial<Record<FlourishSkillCode, number>>>,
): FocusValidationResult {
  const errors: string[] = [];
  const entries = Object.entries(allocation);
  const codes = new Set(entries.map(([code]) => code));
  const hasEverySkill = FLOURISH_SKILL_CODES.every((code) => codes.has(code));
  const hasOnlySkills = entries.every(([code]) =>
    FLOURISH_SKILL_CODES.includes(code as FlourishSkillCode),
  );
  if (!hasEverySkill || !hasOnlySkills || entries.length !== FLOURISH_SKILL_CODES.length) {
    errors.push("A complete Focus allocation must represent each of the 8 FLOURISH Skills exactly once.");
  }
  if (entries.some(([, points]) =>
    !Number.isInteger(points) ||
    points < gameConfig.focus.minPerSkill ||
    points > gameConfig.focus.maxPerSkill
  )) {
    errors.push(
      `Each Focus allocation must be an integer from ${gameConfig.focus.minPerSkill} to ${gameConfig.focus.maxPerSkill}.`,
    );
  }
  if (entries.reduce((sum, [, points]) => sum + points, 0) !== gameConfig.focus.totalPoints) {
    errors.push(`Focus allocation must total exactly ${gameConfig.focus.totalPoints} points.`);
  }
  return errors.length ? { success: false, errors } : { success: true };
}
