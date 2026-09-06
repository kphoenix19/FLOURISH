import type { PrismaClient } from "../../../generated/prisma/client";
import { validateCanonicalSeed } from "./validate";

// No runtime gameplay tables are mutated by this repository-content importer.
export async function persistCanonicalSeed(db: PrismaClient, input: unknown) {
  // Parse a complete, independent copy before opening a transaction or issuing writes.
  const seed = validateCanonicalSeed(input);
  return db.$transaction(async (tx) => {
    // Serialize cooperating seed invocations, including deactivation and join reconciliation.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('flourish.canonical-seed.v1', 0))`;
    // Prevent concurrent library edits between ownership checks and upserts.
    // Readers and runtime history tables remain available during this operational import.
    await tx.$executeRaw`LOCK TABLE skills, variety_tags, quest_families, quest_definitions, quest_skills, quest_variety_tags, quest_context_tags IN SHARE ROW EXCLUSIVE MODE`;
    const skillIds = new Map<string, string>();
    const tagIds = new Map<string, string>();
    const familyIds = new Map<string, string>();
    for (const skill of seed.skills) {
      const row = await tx.skill.upsert({ where: { code: skill.code }, create: skill, update: skill });
      skillIds.set(skill.code, row.id);
    }
    for (const { skillCode, ...tag } of seed.varietyTags) {
      const skillId = skillIds.get(skillCode)!;
      const where = { skillId_code: { skillId, code: tag.code } };
      const existing = await tx.varietyTag.findUnique({ where });
      if (existing && !existing.seedManaged) throw new Error(`Canonical tag collides with non-seed-managed content: ${skillCode}:${tag.code}`);
      const data = { ...tag, skillId, description: null, seedManaged: true };
      const row = await tx.varietyTag.upsert({ where, create: data, update: data });
      tagIds.set(`${skillCode}:${tag.code}`, row.id);
    }
    for (const family of seed.families) {
      const where = { stableKey: family.stableKey };
      const existing = await tx.questFamily.findUnique({ where });
      if (existing && !existing.seedManaged) throw new Error(`Canonical family collides with non-seed-managed content: ${family.stableKey}`);
      const data = { ...family, seedManaged: true };
      const row = await tx.questFamily.upsert({ where, create: data, update: data });
      familyIds.set(family.stableKey, row.id);
    }
    const keys = seed.quests.map((q) => q.stableKey);
    const collisions = await tx.questDefinition.findMany({ where: { stableKey: { in: keys }, seedManaged: false }, select: { stableKey: true } });
    if (collisions.length) throw new Error(`Canonical quests collide with non-seed-managed content: ${collisions.map((q) => q.stableKey).join(", ")}`);
    // Release present canonical memberships first so legitimate tier swaps do not
    // transiently violate the immediate family/difficulty unique index.
    // Removed historical definitions retain their family and continue to reserve a tier.
    await tx.questDefinition.updateMany({ where: { seedManaged: true, stableKey: { in: keys }, questFamilyId: { not: null } }, data: { questFamilyId: null } });
    const present = { questDefinition: { seedManaged: true, stableKey: { in: keys } } };
    await tx.questSkill.deleteMany({ where: present });
    await tx.questVarietyTag.deleteMany({ where: present });
    await tx.questContextTag.deleteMany({ where: present });
    const skillRows: { questDefinitionId: string; skillId: string; isPrimary: boolean; rewardPercent: number }[] = [];
    const tagRows: { questDefinitionId: string; varietyTagId: string; isPrimary: boolean }[] = [];
    for (const { skills, varietyTags, familyKey, deprecationReason, ...quest } of seed.quests) {
      const data = {
        ...quest, reviewedAt: new Date(quest.reviewedAt), reviewedById: null,
        curatorNotes: deprecationReason ? `${quest.curatorNotes}\nDeprecated: ${deprecationReason}` : quest.curatorNotes,
        questFamilyId: familyKey ? familyIds.get(familyKey)! : null, seedManaged: true,
      };
      const row = await tx.questDefinition.upsert({ where: { stableKey: quest.stableKey }, create: data, update: data });
      skillRows.push(...skills.map(({ skillCode, ...allocation }) => ({ ...allocation, questDefinitionId: row.id, skillId: skillIds.get(skillCode)! })));
      tagRows.push(...varietyTags.map(({ skillCode, code, isPrimary }) => ({ questDefinitionId: row.id, varietyTagId: tagIds.get(`${skillCode}:${code}`)!, isPrimary })));
    }
    // Batch the small canonical join sets to avoid thousands of DB round trips.
    await tx.questSkill.createMany({ data: skillRows });
    await tx.questVarietyTag.createMany({ data: tagRows });
    const removed = await tx.questDefinition.updateMany({ where: { seedManaged: true, active: true, stableKey: { notIn: keys } }, data: { active: false } });
    const retiredFamilies = await tx.questFamily.updateMany({ where: { seedManaged: true, active: true, stableKey: { notIn: seed.families.map((f) => f.stableKey) } }, data: { active: false } });
    const retiredTags = await tx.varietyTag.updateMany({ where: { seedManaged: true, active: true, id: { notIn: [...tagIds.values()] } }, data: { active: false } });
    return { seed, deactivatedQuests: removed.count, deactivatedFamilies: retiredFamilies.count, deactivatedTags: retiredTags.count };
  }, { maxWait: 120_000, timeout: 120_000 });
}
