export type SkillAllocation = { skillId: string; isPrimary: boolean; rewardPercent: number };
export type VarietyTagAllocation = { varietyTagId: string; isPrimary: boolean };
export type AllocationValidationResult = { success: true } | { success: false; errors: string[] };

function validateUniqueIds(ids: string[], label: string, errors: string[]) {
  if (new Set(ids).size !== ids.length) errors.push(`${label} IDs must be unique.`);
}

function validatePrimaryCount(rows: { isPrimary: boolean }[], errors: string[]) {
  if (rows.filter((row) => row.isPrimary).length !== 1) {
    errors.push("Exactly one allocation must be primary.");
  }
}

export function validateQuestSkillAllocation(
  allocations: readonly SkillAllocation[],
): AllocationValidationResult {
  const errors: string[] = [];
  if (allocations.length < 1 || allocations.length > 3) {
    errors.push("A quest must reward between 1 and 3 Skills.");
  }
  validateUniqueIds(allocations.map(({ skillId }) => skillId), "Skill", errors);
  validatePrimaryCount([...allocations], errors);
  for (const { rewardPercent } of allocations) {
    if (!Number.isInteger(rewardPercent) || rewardPercent < 1 || rewardPercent > 100) {
      errors.push("Each Skill reward percentage must be an integer from 1 to 100.");
    }
  }
  if (allocations.reduce((sum, { rewardPercent }) => sum + rewardPercent, 0) !== 100) {
    errors.push("Skill reward percentages must total exactly 100.");
  }
  return errors.length ? { success: false, errors } : { success: true };
}

export function validateQuestVarietyTags(
  allocations: readonly VarietyTagAllocation[],
): AllocationValidationResult {
  const errors: string[] = [];
  if (allocations.length < 1 || allocations.length > 3) {
    errors.push("A quest must have between 1 and 3 Variety Tags.");
  }
  validateUniqueIds(allocations.map(({ varietyTagId }) => varietyTagId), "Variety Tag", errors);
  validatePrimaryCount([...allocations], errors);
  return errors.length ? { success: false, errors } : { success: true };
}
