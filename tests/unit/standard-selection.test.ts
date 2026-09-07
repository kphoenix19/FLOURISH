import { describe, expect, it } from "vitest";
import { candidateScore, catchUpModifiers, difficultyWeights, nextFamilyTier, selectCandidate, weightedChoice, type Candidate, type SelectionContext } from "../../src/modules/quests/standard/selection";
import { gameConfig } from "../../src/config/game";
const candidate = (id: string, difficulty: Candidate["difficulty"] = "EASY", tag = "walk"): Candidate => ({ id, difficulty, questFamilyId: "walk", skills: [{ skillId: "F", rewardPercent: 100, isPrimary: true }], varietyTags: [{ varietyTagId: tag, isPrimary: true }] });
const context = (): SelectionContext => ({ level: 1, focus: { F: 6, H: 5 }, catchUp: { F: 1.3, H: 1 }, occupied: new Set(), recent: [] });
describe("Standard weighted selection", () => {
  it.each([1, 10, 11, 25, 26, 50, 51, 75, 76, 100])("uses centralized level band for %i", (level) => {
    expect(difficultyWeights(level)).toEqual(gameConfig.difficultyDistributions.standardBySkillLevel.find((b) => level >= b.minLevel && level <= b.maxLevel)!.weights);
  });
  it("uses weighted boundaries without flaky sampling", () => {
    expect(weightedChoice(["E", "M", "H", "EP", "L"], [60, 25, 10, 4, 1], () => 0.59999)).toBe("E");
    expect(weightedChoice(["E", "M", "H", "EP", "L"], [60, 25, 10, 4, 1], () => 0.6)).toBe("M");
    expect(weightedChoice(["E", "M", "H", "EP", "L"], [60, 25, 10, 4, 1], () => 0.999)).toBe("L");
    expect(() => weightedChoice([], [], () => 0)).toThrow();
  });
  it("combines reward-weighted Focus and Catch-Up and reads changed Focus", () => {
    const q = candidate("multi"); q.skills = [{ skillId: "F", isPrimary: true, rewardPercent: 70 }, { skillId: "H", isPrimary: false, rewardPercent: 30 }];
    const c = context();
    expect(candidateScore(q, c, () => 0.5)).toBeCloseTo(60 * 1.07 * 1.21);
    c.focus.H = 10;
    expect(candidateScore(q, c, () => 0.5)).toBeCloseTo(60 * 1.22 * 1.21);
  });
  it("ranks Catch-Up by level, XP, then code", () => {
    expect(catchUpModifiers([{ skillId: "F", code: "F", currentLevel: 1, currentXp: 0 }, { skillId: "H", code: "H", currentLevel: 1, currentXp: 0 }, { skillId: "I", code: "I", currentLevel: 1, currentXp: 10 }, { skillId: "L", code: "L", currentLevel: 2, currentXp: 0 }])).toEqual({ F: 1.3, H: 1.2, I: 1.1, L: 1 });
  });
  it("excludes current/replaced definitions, avoids recent five and relaxes only soft history", () => {
    const c = context(); c.occupied.add("current"); c.excluded = new Set(["old"]); c.recent = [{ definitionId: "recent", primaryTagId: "walk" }];
    expect(selectCandidate([candidate("current"), candidate("old"), candidate("recent"), candidate("fresh")], c, () => 0).id).toBe("fresh");
    expect(selectCandidate([candidate("recent")], c, () => 0).id).toBe("recent");
    expect(() => selectCandidate([candidate("current"), candidate("old")], c, () => 0)).toThrow();
  });
  it("prefers different primary variety and permits same variety as fallback", () => {
    const c = context(); c.avoidTagId = "walk";
    expect(selectCandidate([candidate("same"), candidate("different", "EASY", "strength")], c, () => 0).id).toBe("different");
    expect(selectCandidate([candidate("same")], c, () => 0).id).toBe("same");
  });
  it("skips absent and occupied higher tiers without leaving the family", () => {
    const current = candidate("easy"); const hard = candidate("hard", "HARD"); const epic = candidate("epic", "EPIC");
    expect(nextFamilyTier(current, [epic, hard], new Set())?.id).toBe("hard");
    expect(nextFamilyTier(current, [epic, hard], new Set(["hard"]))?.id).toBe("epic");
    expect(nextFamilyTier(epic, [hard, epic], new Set())).toBeUndefined();
    expect(nextFamilyTier({ ...current, questFamilyId: null }, [hard], new Set())).toBeUndefined();
  });
});
