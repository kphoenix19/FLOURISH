import { describe, expect, it } from "vitest";
import { validateQuestSkillAllocation, validateQuestVarietyTags } from "@/modules/quests/domain/allocations";
import { validateFocusAllocation } from "@/modules/player/domain/focus";

const validFocus = { F: 6, L: 6, O: 6, U: 6, R: 6, I: 6, S: 5, H: 5 } as const;

describe("validateQuestSkillAllocation", () => {
  it("accepts a valid allocation", () => {
    expect(validateQuestSkillAllocation([
      { skillId: "fitness", isPrimary: true, rewardPercent: 70 },
      { skillId: "us", isPrimary: false, rewardPercent: 30 },
    ])).toEqual({ success: true });
  });
  it("rejects an invalid total", () => {
    expect(validateQuestSkillAllocation([
      { skillId: "fitness", isPrimary: true, rewardPercent: 60 },
      { skillId: "us", isPrimary: false, rewardPercent: 30 },
    ]).success).toBe(false);
  });
  it("rejects multiple primaries", () => {
    expect(validateQuestSkillAllocation([
      { skillId: "fitness", isPrimary: true, rewardPercent: 50 },
      { skillId: "us", isPrimary: true, rewardPercent: 50 },
    ]).success).toBe(false);
  });
  it("rejects more than three Skills", () => {
    expect(validateQuestSkillAllocation([
      { skillId: "a", isPrimary: true, rewardPercent: 25 },
      { skillId: "b", isPrimary: false, rewardPercent: 25 },
      { skillId: "c", isPrimary: false, rewardPercent: 25 },
      { skillId: "d", isPrimary: false, rewardPercent: 25 },
    ]).success).toBe(false);
  });
});

describe("validateQuestVarietyTags", () => {
  it("accepts one primary plus secondary tags", () => {
    expect(validateQuestVarietyTags([
      { varietyTagId: "walking", isPrimary: true },
      { varietyTagId: "outdoors", isPrimary: false },
    ])).toEqual({ success: true });
  });
  it("rejects multiple primaries", () => {
    expect(validateQuestVarietyTags([
      { varietyTagId: "walking", isPrimary: true },
      { varietyTagId: "outdoors", isPrimary: true },
    ]).success).toBe(false);
  });
});

describe("validateFocusAllocation", () => {
  it("accepts all eight Skills totaling 46", () => {
    expect(validateFocusAllocation(validFocus)).toEqual({ success: true });
  });
  it("rejects a total other than 46", () => {
    expect(validateFocusAllocation({ ...validFocus, H: 4 }).success).toBe(false);
  });
  it("rejects values outside 1 through 10", () => {
    expect(validateFocusAllocation({ ...validFocus, H: 0 }).success).toBe(false);
  });
});
