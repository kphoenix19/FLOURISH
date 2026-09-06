import { gameConfig } from "../../../config/game";
import { validateQuestSkillAllocation, validateQuestVarietyTags } from "../domain/allocations";
import { seedSchema, type CanonicalSeed } from "./schema";
import { initialPrimaryTagLimit, skillCodes, taxonomy } from "./taxonomy";

export function normalizeTitle(title: string) {
  return title.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function validateCanonicalSeed(input: unknown): CanonicalSeed {
  const seed = seedSchema.parse(input);
  const errors: string[] = [];
  function unique(values: string[], label: string) {
    const seen = new Set<string>();
    for (const value of values) {
      if (seen.has(value)) errors.push(`Duplicate ${label}: ${value}`);
      seen.add(value);
    }
  }
  unique(seed.skills.map((s) => s.code), "Skill code");
  if (seed.skills.length !== 8 || skillCodes.some((code) => !seed.skills.some((s) => s.code === code))) errors.push("Exactly 8 canonical Skills are required");
  const tagKey = (t: { skillCode: string; code: string }) => `${t.skillCode}:${t.code}`;
  unique(seed.varietyTags.map(tagKey), "Variety Tag");
  const tags = new Set(seed.varietyTags.map(tagKey));
  for (const tag of seed.varietyTags) {
    if (!(taxonomy[tag.skillCode] as readonly string[]).includes(tag.code)) errors.push(`Unknown taxonomy tag ${tagKey(tag)}`);
  }
  for (const code of skillCodes) for (const tag of taxonomy[code]) {
    if (!tags.has(`${code}:${tag}`)) errors.push(`Missing canonical tag ${code}:${tag}`);
  }
  unique(seed.families.map((f) => f.stableKey), "family key");
  unique(seed.quests.map((q) => q.stableKey), "quest stable key");
  const families = new Map(seed.families.map((f) => [f.stableKey, f]));
  const familySkills = new Map<string, string>();
  const tiers: string[] = [];
  const titles: string[] = [];
  const descriptions: string[] = [];
  const primaryCounts = new Map<string, number>();
  for (const q of seed.quests) {
    const fail = (message: string) => errors.push(`${q.stableKey}: ${message}`);
    const band = gameConfig.quests.difficultyXpBands[q.difficulty];
    if (q.baseXp < band.min || q.baseXp > band.max) fail(`XP outside ${q.difficulty} band ${band.min}-${band.max}`);
    if (q.completionType === "SINGLE" ? q.completionTarget !== 1 : q.completionTarget <= 1) fail("Invalid completion target");
    if (q.standardEligible && !gameConfig.quests.standardCompletionWindowsHours.includes(q.completionWindowHours ?? 0)) fail("Invalid Standard window");
    if (!q.standardEligible && q.completionWindowHours !== null) fail("Non-Standard content must use a null Standard window");
    if (!(q.standardEligible || q.dailyEligible || q.weeklyEligible)) fail("At least one pool is required");
    if (q.difficulty === "LEGENDARY" && (q.dailyEligible || q.weeklyEligible)) fail("Legendary cannot be Daily/Weekly eligible");
    if (!q.active && !q.deprecationReason) fail("Inactive canonical content requires a deprecation reason");
    if (q.active && q.deprecationReason) fail("Active content cannot have a deprecation reason");
    const skillResult = validateQuestSkillAllocation(q.skills.map((s) => ({ ...s, skillId: s.skillCode })));
    if (!skillResult.success) skillResult.errors.forEach(fail);
    const tagResult = validateQuestVarietyTags(q.varietyTags.map((t) => ({ ...t, varietyTagId: tagKey(t) })));
    if (!tagResult.success) tagResult.errors.forEach(fail);
    for (const s of q.skills) if (!seed.skills.some((row) => row.code === s.skillCode)) fail(`Missing Skill ${s.skillCode}`);
    for (const t of q.varietyTags) {
      if (!tags.has(tagKey(t))) fail(`Missing Variety Tag ${tagKey(t)}`);
      if (!q.skills.some((s) => s.skillCode === t.skillCode)) fail(`Tag ${tagKey(t)} must belong to a rewarded Skill`);
    }
    const primary = q.skills.find((s) => s.isPrimary)?.skillCode;
    const primaryTag = q.varietyTags.find((t) => t.isPrimary);
    if (primaryTag?.skillCode !== primary) fail("Primary tag must belong to primary Skill");
    if (primaryTag) primaryCounts.set(tagKey(primaryTag), (primaryCounts.get(tagKey(primaryTag)) ?? 0) + 1);
    titles.push(`${primary}:${normalizeTitle(q.title)}`);
    descriptions.push(`${primary}:${q.completionType}:${q.completionTarget}:${normalizeTitle(q.shortDescription)}`);
    if (q.familyKey) {
      const family = families.get(q.familyKey);
      if (!family) fail(`Missing family ${q.familyKey}`);
      if (q.active && !family?.active) fail("Active quest requires active family");
      tiers.push(`${q.familyKey}:${q.difficulty}`);
      if (primary) {
        if (familySkills.has(q.familyKey) && familySkills.get(q.familyKey) !== primary) fail("Family must preserve primary Skill");
        familySkills.set(q.familyKey, primary);
      }
    }
  }
  unique(tiers, "family tier");
  unique(titles, "normalized title within Skill");
  unique(descriptions, "normalized action description within Skill/completion target");
  for (const [tag, count] of primaryCounts) if (count > initialPrimaryTagLimit) errors.push(`${tag}: ${count} exceeds primary-tag limit ${initialPrimaryTagLimit}`);
  for (const code of skillCodes) if (!seed.quests.some((q) => q.skills.some((s) => s.isPrimary && s.skillCode === code))) errors.push(`No content for Skill ${code}`);
  if (errors.length) throw new Error(`Canonical seed validation failed:\n${errors.join("\n")}`);
  return seed;
}
