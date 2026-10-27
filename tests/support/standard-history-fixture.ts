import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { definitionInclude, previewSnapshots } from "../../src/modules/quests/standard/content";

// Synthetic completion history, intentionally without a reward ledger. Membership
// is uneven and includes multi-Skill snapshots; timestamps deliberately tie.
export async function insertHistory(db: PrismaClient, playerId: string, count: number) {
  const definitions = await db.questDefinition.findMany({ where: { standardEligible: true, active: true, reviewStatus: "APPROVED" }, include: definitionInclude, orderBy: { stableKey: "asc" } });
  for (let offset = 0; offset < count; offset += 500) {
    const rows = Array.from({ length: Math.min(500, count - offset) }, (_, j) => {
      const i = offset + j;
      const definition = definitions[i % 10 < 8 ? 0 : i % definitions.length];
      return { id: randomUUID(), definition, completedAt: new Date(Date.UTC(2026, 0, 1) + Math.floor(i / 3) * 1000) };
    });
    await db.playerQuest.createMany({ data: rows.map(({ id, definition, completedAt }) => ({ id, playerId, questDefinitionId: definition.id, poolType: "STANDARD", status: "COMPLETED", completedAt, ...previewSnapshots(definition) })) });
    await db.playerQuestSkillSnapshot.createMany({ data: rows.flatMap(({ id, definition }) => definition.skills.map((s) => ({ playerQuestId: id, skillId: s.skillId, isPrimary: s.isPrimary, rewardPercent: s.rewardPercent }))) });
  }
}
