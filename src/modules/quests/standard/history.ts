import { Prisma } from "../../../generated/prisma/client";
import { gameConfig } from "../../../config/game";
import type { SelectionContext } from "./selection";

// Caller holds the Player and library locks. Limit each snapshot Skill separately:
// a global limit loses sparse Skills, and definition membership can change later.
export function recentHistoryQuery(playerId: string, skillIds: string[]) {
  return Prisma.sql`
    SELECT skill.id AS "skillId", recent.quest_definition_id AS "definitionId",
           tag.variety_tag_id AS "primaryTagId"
    FROM unnest(ARRAY[${Prisma.join(skillIds)}]::uuid[]) AS skill(id)
    CROSS JOIN LATERAL (
      SELECT q.id, q.quest_definition_id, q.completed_at
      FROM player_quests q
      WHERE q.player_id = ${playerId}::uuid AND q.status = 'COMPLETED'
        AND EXISTS (SELECT 1 FROM player_quest_skill_snapshots snapshot
                    WHERE snapshot.player_quest_id = q.id AND snapshot.skill_id = skill.id)
      ORDER BY q.completed_at DESC, q.id ASC
      LIMIT ${gameConfig.recommendations.varietyHistoryWindow}
    ) recent
    LEFT JOIN quest_variety_tags tag
      ON tag.quest_definition_id = recent.quest_definition_id AND tag.is_primary
    ORDER BY skill.id, recent.completed_at DESC, recent.id ASC`;
}

export async function loadRecentHistory(tx: Prisma.TransactionClient, playerId: string, skillIds: string[]) {
  const history = new Map<string, SelectionContext["recent"]>(skillIds.map((id) => [id, []]));
  if (!skillIds.length) return history;
  const rows = await tx.$queryRaw<({ skillId: string } & SelectionContext["recent"][number])[]>(recentHistoryQuery(playerId, skillIds));
  for (const { skillId, definitionId, primaryTagId } of rows) history.get(skillId)!.push({ definitionId, primaryTagId });
  return history;
}
