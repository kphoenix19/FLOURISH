// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadCanonicalSeed } from "../../src/modules/quests/seed/load";
import { validateCanonicalSeed } from "../../src/modules/quests/seed/validate";
import { seedReport } from "../../src/modules/quests/seed/report";
import { skillCodes, taxonomy } from "../../src/modules/quests/seed/taxonomy";
import type { CanonicalSeed } from "../../src/modules/quests/seed/schema";

const canonical = validateCanonicalSeed(loadCanonicalSeed());
const copy = () => structuredClone(canonical);
const first = (s: CanonicalSeed) => s.quests.find((q) => q.stableKey === "F-WALK-01")!;

describe("canonical Build 1 content", () => {
  it("validates the whole library and exact taxonomy", () => {
    expect(canonical.skills.map((s) => s.code)).toEqual(skillCodes);
    expect(canonical.varietyTags).toHaveLength(76);
    for (const code of skillCodes) {
      expect(canonical.varietyTags.filter((t) => t.skillCode === code).map((t) => t.code)).toEqual(taxonomy[code]);
      expect(canonical.quests.some((q) => q.skills.some((s) => s.isPrimary && s.skillCode === code))).toBe(true);
    }
    expect(canonical.quests).toHaveLength(275);
    expect(canonical.families).toHaveLength(15);
  });
  it("preserves approved baseline values and the owner's HARD correction", () => {
    expect(first(canonical)).toMatchObject({ title: "Take a 10-Minute Walk", difficulty: "EASY", baseXp: 75, estimatedMinutes: 10, completionWindowHours: 24, standardEligible: true, dailyEligible: true, weeklyEligible: true, familyKey: "WALK_TIME" });
    expect(canonical.quests.find((q) => q.stableKey === "L-WEEK-03")).toMatchObject({ difficulty: "HARD", baseXp: 275, completionType: "COUNT", completionTarget: 3, completionWindowHours: null, standardEligible: false, dailyEligible: false, weeklyEligible: true });
    expect(canonical.quests.find((q) => q.stableKey === "F-STR-05")).toMatchObject({ difficulty: "EPIC", baseXp: 600, estimatedMinutes: 90, completionWindowHours: 72 });
    expect(canonical.quests.some((q) => q.stableKey === "L-WEEK-01")).toBe(false);
  });
  it("has approved active content, reconciled rewards, valid windows, and safe family membership", () => {
    for (const q of canonical.quests) {
      expect(q.active).toBe(true);
      expect(q.reviewStatus).toBe("APPROVED");
      expect(q.skills.reduce((sum, s) => sum + s.rewardPercent, 0)).toBe(100);
      if (q.standardEligible) expect([24, 48, 72]).toContain(q.completionWindowHours);
      if (q.dailyEligible || q.weeklyEligible) expect(q.difficulty).not.toBe("LEGENDARY");
      if (q.completionType === "COUNT") expect(q.completionTarget).toBeGreaterThan(1);
      if (q.stableKey.startsWith("H-") && q.varietyTags[0].code === "gaming") expect(q.familyKey).toBeNull();
      if (q.stableKey.startsWith("H-") && q.varietyTags[0].code === "outdoors") expect(q.skills.some((s) => s.skillCode === "F")).toBe(false);
    }
  });
  it("reports distribution, concentration, Us titles, and deterministic similarity candidates", () => {
    const report = seedReport(canonical, true);
    expect(report).toContain("Occupation: 36 (outside approximate 30-35 target");
    expect(report).toContain("U:communication: 6");
    expect(report).toContain("U-COM-05: Set a Respectful Boundary");
    expect(report).toContain("Title similarity review candidates");
    expect(seedReport(canonical)).not.toContain("U-COM-05:");
  });
});

const invalidCases: [string, (s: CanonicalSeed) => void, RegExp][] = [
  ["missing Skill", (s) => { s.skills.pop(); }, /Exactly 8/],
  ["duplicate Skill", (s) => { s.skills.push(s.skills[0]); }, /Duplicate Skill/],
  ["unknown Skill", (s) => { Object.assign(first(s).skills[0], { skillCode: "X" }); }, /Invalid option/],
  ["duplicate tag", (s) => { s.varietyTags.push(s.varietyTags[0]); }, /Duplicate Variety Tag/],
  ["unknown taxonomy", (s) => { s.varietyTags[0].code = "general_learning"; }, /Unknown taxonomy/],
  ["missing taxonomy", (s) => { s.varietyTags.pop(); }, /Missing canonical tag/],
  ["duplicate key", (s) => { s.quests.push(first(s)); }, /Duplicate quest stable key/],
  ["blank key", (s) => { first(s).stableKey = ""; }, /Too small/],
  ["duplicate normalized title", (s) => { s.quests.find((q) => q.stableKey === "F-WALK-02")!.title = " TAKE A 10 MINUTE WALK!! "; }, /Duplicate normalized title/],
  ["duplicate action description", (s) => { s.quests.find((q) => q.stableKey === "F-WALK-02")!.shortDescription = first(s).shortDescription; }, /Duplicate normalized action/],
  ["XP outside band", (s) => { first(s).baseXp = 100; }, /XP outside EASY band/],
  ["Legendary Daily", (s) => { Object.assign(first(s), { difficulty: "LEGENDARY", baseXp: 800, weeklyEligible: false }); }, /Legendary/],
  ["Legendary Weekly", (s) => { Object.assign(first(s), { difficulty: "LEGENDARY", baseXp: 800, dailyEligible: false }); }, /Legendary/],
  ["invalid Standard window", (s) => { first(s).completionWindowHours = 36; }, /Invalid Standard window/],
  ["null Standard window", (s) => { first(s).completionWindowHours = null; }, /Invalid Standard window/],
  ["nonstandard window", (s) => { first(s).standardEligible = false; }, /Non-Standard/],
  ["no pool", (s) => { Object.assign(first(s), { standardEligible: false, dailyEligible: false, weeklyEligible: false, completionWindowHours: null }); }, /At least one pool/],
  ["SINGLE target", (s) => { first(s).completionTarget = 2; }, /Invalid completion target/],
  ["COUNT target", (s) => { first(s).completionType = "COUNT"; }, /Invalid completion target/],
  ["bad percentages", (s) => { first(s).skills[0].rewardPercent = 90; }, /total exactly 100/],
  ["fractional percentage", (s) => { first(s).skills[0].rewardPercent = 99.5; }, /expected int/],
  ["no primary Skill", (s) => { first(s).skills[0].isPrimary = false; }, /Exactly one/],
  ["duplicate Skill allocation", (s) => { first(s).skills.push(first(s).skills[0]); }, /Skill IDs must be unique/],
  ["four Skills", (s) => { first(s).skills = ["F", "L", "O", "U"].map((skillCode, i) => ({ skillCode: skillCode as "F", isPrimary: i === 0, rewardPercent: 25 })); }, /between 1 and 3/],
  ["missing tag reference", (s) => { first(s).varietyTags[0].code = "missing"; }, /Missing Variety Tag/],
  ["no primary tag", (s) => { first(s).varietyTags[0].isPrimary = false; }, /Exactly one/],
  ["duplicate tag allocation", (s) => { first(s).varietyTags.push(first(s).varietyTags[0]); }, /Variety Tag IDs must be unique/],
  ["four tags", (s) => { first(s).varietyTags = ["walking", "strength", "cardio", "mobility"].map((code, i) => ({ skillCode: "F", code, isPrimary: i === 0 })); }, /between 1 and 3/],
  ["incompatible primary tag", (s) => { first(s).varietyTags[0] = { skillCode: "L", code: "reading", isPrimary: true }; }, /Primary tag must belong/],
  ["unrewarded secondary tag", (s) => { first(s).varietyTags.push({ skillCode: "L", code: "reading", isPrimary: false }); }, /must belong to a rewarded Skill/],
  ["missing family", (s) => { first(s).familyKey = "MISSING"; }, /Missing family/],
  ["duplicate family", (s) => { s.families.push(s.families[0]); }, /Duplicate family key/],
  ["duplicate family tier", (s) => { s.quests.find((q) => q.stableKey === "F-STR-01")!.familyKey = "WALK_TIME"; }, /Duplicate family tier/],
  ["cross-Skill family", (s) => { const q = s.quests.find((q) => q.stableKey === "L-READ-01")!; q.familyKey = "WALK_TIME"; q.difficulty = "LEGENDARY"; q.baseXp = 800; q.dailyEligible = false; q.weeklyEligible = false; }, /Family must preserve/],
  ["inactive family", (s) => { s.families.find((f) => f.stableKey === "WALK_TIME")!.active = false; }, /Active quest requires active family/],
  ["unapproved review", (s) => { Object.assign(first(s), { reviewStatus: "DRAFT" }); }, /Invalid input/],
  ["missing review date", (s) => { Object.assign(first(s), { reviewedAt: null }); }, /Invalid input/],
  ["invalid metadata", (s) => { Object.assign(first(s), { safetyCategory: "MEDICAL" }); }, /Invalid option/],
  ["invalid curator score", (s) => { first(s).curatorValueScore = 6; }, /Too big/],
  ["missing deprecation rationale", (s) => { first(s).active = false; }, /deprecation reason/],
  ["excess primary-tag density", (s) => {
    for (let i = 0; i < 6; i++) s.quests.push({ ...structuredClone(first(s)), stableKey: `F-TEST-${i}`, title: `Distinct test activity ${i}`, shortDescription: `Distinct test action ${i}`, familyKey: null });
  }, /exceeds primary-tag limit 10/],
];

describe("seed validation rejects invalid authoring", () => {
  it.each(invalidCases)("%s", (_name, mutate, message) => {
    const seed = copy(); mutate(seed);
    expect(() => validateCanonicalSeed(seed)).toThrow(message);
  });
  it("allows explicit deprecation with a reason", () => {
    const seed = copy(); first(seed).active = false; first(seed).deprecationReason = "Replaced after curator review";
    expect(() => validateCanonicalSeed(seed)).not.toThrow();
  });
  it("accepts all difficulty band boundaries without coercion", () => {
    for (const [difficulty, min, max] of [["EASY", 50, 99], ["MEDIUM", 100, 249], ["HARD", 250, 499], ["EPIC", 500, 749], ["LEGENDARY", 750, 1000]] as const) {
      for (const baseXp of [min, max]) {
        const seed = copy(); Object.assign(first(seed), { difficulty, baseXp, familyKey: null, dailyEligible: false, weeklyEligible: false });
        expect(validateCanonicalSeed(seed).quests.find((q) => q.stableKey === "F-WALK-01")!.baseXp).toBe(baseXp);
      }
    }
  });
});
