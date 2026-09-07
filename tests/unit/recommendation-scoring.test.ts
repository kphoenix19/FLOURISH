import { describe, expect, it } from "vitest";
import { catchUpModifiers } from "@/modules/quests/standard/selection";
import { difficultyFit, historyModifier, reasonCodes, scoreRecommendation, type RecommendationCandidate, type RecommendationInteraction } from "@/modules/recommendations/scoring";

const candidate: RecommendationCandidate = { id: "slot", playerQuestId: "quest", slotSkillId: "fitness", difficulty: "EASY", estimatedMinutes: 30, primaryTagId: "walking", skills: [{ skillId: "fitness", rewardPercent: 70 }, { skillId: "reflection", rewardPercent: 30 }] };
const interaction = (interactionType: RecommendationInteraction["interactionType"], feedbackReason: RecommendationInteraction["feedbackReason"] = null, overrides: Partial<RecommendationInteraction> = {}): RecommendationInteraction => ({ interactionType, feedbackReason, skillId: "fitness", primaryTagId: "walking", difficulty: "EASY", estimatedMinutes: 30, ...overrides });
const inputs = { level: 1, focus: { fitness: 10, reflection: 1 }, catchUp: { fitness: 1.3, reflection: 1 }, completedPrimaryTags: [] as (string | null)[], interactions: [] as RecommendationInteraction[] };

describe("Home recommendation scoring", () => {
  it("uses reward-weighted multi-Skill Focus and Catch-Up", () => {
    const scored = scoreRecommendation(candidate, inputs, () => 0.5);
    expect(scored.focus).toBeCloseTo(1.26); expect(scored.catchUp).toBeCloseTo(1.21);
    expect(reasonCodes(scored)).toContain("MATCHES_FOCUS"); expect(reasonCodes(scored)).toContain("CATCH_UP");
  });
  it("ranks bottom three deterministically by level, XP, then FLOURISH code", () => {
    expect(catchUpModifiers([
      { skillId: "u", code: "U", currentLevel: 1, currentXp: 0 }, { skillId: "f", code: "F", currentLevel: 1, currentXp: 0 },
      { skillId: "l", code: "L", currentLevel: 1, currentXp: 0 }, { skillId: "o", code: "O", currentLevel: 2, currentXp: 0 },
    ])).toEqual({ f: 1.3, l: 1.2, u: 1.1, o: 1 });
  });
  it("uses the primary tag across the last five completed activities", () => {
    const scored = scoreRecommendation(candidate, { ...inputs, completedPrimaryTags: ["walking", "other", "walking", "walking", "other", "walking"] }, () => 0.5);
    expect(scored.variety).toBe(0.85);
  });
  it.each([
    ["COMPLETED", null, 0.95], ["REROLLED", null, 0.9], ["REROLLED", "JUST_DIFFERENT", 0.98],
    ["REROLLED", "NO_TIME", 0.9], ["REROLLED", "TOO_HARD", 0.85], ["REROLLED", "NOT_INTERESTED", 0.75],
    ["ABANDONED", null, 0.85], ["EXPIRED", null, 0.9],
  ] as const)("applies %s/%s history", (type, feedback, expected) => expect(historyModifier(candidate, [interaction(type, feedback)])).toBe(expected));
  it("scopes time and difficulty feedback to matching candidate characteristics", () => {
    expect(historyModifier({ ...candidate, estimatedMinutes: 10 }, [interaction("REROLLED", "NO_TIME", { estimatedMinutes: 30 })])).toBe(1);
    expect(historyModifier(candidate, [interaction("REROLLED", "TOO_HARD", { difficulty: "HARD" })])).toBe(1);
  });
  it("applies configured difficulty fit and bounded injectable randomness deterministically", () => {
    expect(difficultyFit(1, "EASY")).toBe(1); expect(difficultyFit(1, "MEDIUM")).toBe(0.95); expect(difficultyFit(1, "LEGENDARY")).toBe(0.85);
    expect(scoreRecommendation(candidate, inputs, () => 0).randomness).toBe(0.9);
    expect(scoreRecommendation(candidate, inputs, () => 0.999999).randomness).toBeLessThanOrEqual(1.1);
    expect(scoreRecommendation(candidate, inputs, () => 0.25)).toEqual(scoreRecommendation(candidate, inputs, () => 0.25));
  });
});
