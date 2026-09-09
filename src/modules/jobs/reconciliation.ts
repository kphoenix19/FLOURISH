import type { PrismaClient } from "../../generated/prisma/client";
import { jobConfig } from "../../config/jobs";
import { reconcilePlayerChallenges } from "../challenges/service";
import { reconcileExpiredStandardQuests } from "../quests/standard/resolution";
import type { RandomSource } from "../quests/standard/selection";

export type ReconciliationFailure = { playerId: string; stage: "standard" | "challenges"; error: string };
export type ReconciliationResult = {
  job: "game-state-reconciliation"; startedAt: string; completedAt: string; elapsedMs: number;
  candidatesScanned: number; playersProcessed: number; standardQuestsExpired: number;
  challengeQuestsExpired: number; challengeSetsCreated: number; staleRecommendationsInvalidated: number;
  failures: ReconciliationFailure[];
};

const errorMessage = (error: unknown) => error instanceof Error ? error.name : "UnknownError";

export async function runGameStateReconciliation(db: PrismaClient, options: { now?: Date; batchSize?: number; random?: RandomSource } = {}): Promise<ReconciliationResult> {
  const started = new Date(); const now = options.now ?? started; const batchSize = options.batchSize ?? jobConfig.batchSize;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) throw new Error("batchSize must be an integer from 1 to 500");
  const result: ReconciliationResult = { job: "game-state-reconciliation", startedAt: started.toISOString(), completedAt: "", elapsedMs: 0, candidatesScanned: 0, playersProcessed: 0, standardQuestsExpired: 0, challengeQuestsExpired: 0, challengeSetsCreated: 0, staleRecommendationsInvalidated: 0, failures: [] };
  let cursor: string | undefined;
  for (;;) {
    const players = await db.player.findMany({
      where: { onboardingCompletedAt: { not: null } }, select: { id: true }, orderBy: { id: "asc" }, take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!players.length) break;
    result.candidatesScanned += players.length;
    for (const player of players) {
      const beforeInvalidated = await db.playerRecommendation.count({ where: { playerId: player.id, invalidatedAt: null } });
      try { result.standardQuestsExpired += await reconcileExpiredStandardQuests(db, player.id, now); }
      catch (error) { result.failures.push({ playerId: player.id, stage: "standard", error: errorMessage(error) }); }
      try {
        const changed = await reconcilePlayerChallenges(db, player.id, { now, random: options.random });
        result.challengeQuestsExpired += changed.expiredCount; result.challengeSetsCreated += changed.challengeSetsCreated;
      } catch (error) { result.failures.push({ playerId: player.id, stage: "challenges", error: errorMessage(error) }); }
      const afterInvalidated = await db.playerRecommendation.count({ where: { playerId: player.id, invalidatedAt: null } });
      result.staleRecommendationsInvalidated += Math.max(0, beforeInvalidated - afterInvalidated);
      result.playersProcessed++;
    }
    cursor = players.at(-1)!.id;
  }
  const completed = new Date(); result.completedAt = completed.toISOString(); result.elapsedMs = completed.getTime() - started.getTime();
  return result;
}
