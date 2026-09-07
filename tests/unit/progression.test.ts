import { describe, expect, it } from "vitest";
import { overallLevelForXp, overallProgressWithinLevel, overallXpRequiredForLevel, skillLevelForXp, skillProgressWithinLevel, skillXpRequiredForLevel } from "../../src/modules/progression/levels";
import { allocateLargestRemainder, percentRoundHalfUp } from "../../src/modules/progression/math";
import { advanceStreak, streakBonusPercent } from "../../src/modules/progression/streaks";

describe("level curves", () => {
  const milestones = [2, 5, 10, 25, 50, 75, 100];
  it("matches the locked cumulative milestones", () => {
    expect(milestones.map(skillXpRequiredForLevel)).toEqual([100, 548, 2028, 16568, 104468, 326118, 744018]);
    expect(milestones.map(overallXpRequiredForLevel)).toEqual([200, 1052, 3672, 27432, 165032, 506382, 1145232]);
  });
  it("handles exact boundaries, caps Skill, and leaves Overall uncapped", () => {
    expect(skillLevelForXp(0)).toBe(1); expect(skillLevelForXp(99)).toBe(1); expect(skillLevelForXp(100)).toBe(2);
    expect(skillLevelForXp(Number.MAX_SAFE_INTEGER)).toBe(100);
    expect(overallLevelForXp(overallXpRequiredForLevel(101))).toBe(101);
    expect(() => skillLevelForXp(-1)).toThrow(RangeError);
  });
  it("reports progress at normal and max boundaries", () => {
    expect(skillProgressWithinLevel(100)).toMatchObject({ level: 2, xpIntoLevel: 0 });
    expect(overallProgressWithinLevel(199)).toMatchObject({ level: 1, xpToNextLevel: 1 });
    expect(skillProgressWithinLevel(999999)).toMatchObject({ level: 100, nextLevelXp: null, percent: 100 });
  });
});
describe("integer XP math", () => {
  it("allocates exact totals with stable key tie breaking", () => {
    expect(allocateLargestRemainder(101, [{ key: "F", weight: 50 }, { key: "L", weight: 30 }, { key: "S", weight: 20 }])).toEqual({ F: 51, L: 30, S: 20 });
    expect(allocateLargestRemainder(50, [{ key: "B", weight: 1 }, { key: "A", weight: 1 }, { key: "C", weight: 1 }])).toEqual({ B: 17, A: 17, C: 16 });
    expect(Object.values(allocateLargestRemainder(101, [{ key: "A", weight: 70 }, { key: "B", weight: 30 }])).reduce((a, b) => a + b)).toBe(101);
  });
  it("rounds percentages half up with integers", () => { expect(percentRoundHalfUp(5, 10)).toBe(1); expect(percentRoundHalfUp(4, 10)).toBe(0); expect(percentRoundHalfUp(101, 20)).toBe(20); });
});
describe("streak rules", () => {
  it("maintains same-day, advances next-day, and resets after a gap", () => {
    expect(advanceStreak(2, 2, "2026-09-05", "2026-09-05").currentStreakDays).toBe(2);
    expect(advanceStreak(2, 2, "2026-09-05", "2026-09-06").currentStreakDays).toBe(3);
    expect(advanceStreak(9, 9, "2026-09-03", "2026-09-06").currentStreakDays).toBe(1);
  });
  it.each([[1,0],[3,5],[7,10],[14,15],[30,20]])("uses the post-completion day %i tier", (days, bonus) => expect(streakBonusPercent(days)).toBe(bonus));
});
