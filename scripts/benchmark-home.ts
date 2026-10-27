import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { createIntegrationDatabase } from "../tests/support/integration-database";
import { loadCanonicalSeed } from "../src/modules/quests/seed/load";
import { persistCanonicalSeed } from "../src/modules/quests/seed/persist";
import { completeOnboarding, ensurePlayerForUser } from "../src/modules/player/services";
import { reconcileStandardQuestSlots } from "../src/modules/quests/standard/slots";
import { mutateStandardQuest } from "../src/modules/quests/standard/actions";
import { getHomeRecommendation } from "../src/modules/recommendations/service";
import { getChallengeState } from "../src/modules/challenges/service";

async function main() {
  const label = process.argv[2];
  if (label !== "before" && label !== "after") throw new Error("Specify before or after; run against the corresponding source revision.");
  const fixture = createIntegrationDatabase();
  const db = new PrismaClient({ adapter: new PrismaPg(fixture.pool, { schema: fixture.schema }), log: [{ emit: "event", level: "query" }] });
  let count = 0;
  db.$on("query", () => count++);
  const now = () => new Date("2026-10-27T18:00:00Z");
  const random = () => 0.5;
  const results = [];
  try {
    await fixture.setup(); await persistCanonicalSeed(db, loadCanonicalSeed());
    async function player(email: string) {
      const user = await db.user.create({ data: { email } });
      const p = await ensurePlayerForUser(db, user.id);
      await completeOnboarding(db, user.id, { timezone: "America/Denver", focus: Object.entries({ F: 6, L: 6, O: 6, U: 6, R: 6, I: 6, S: 5, H: 5 }).map(([skillCode, points]) => ({ skillCode, points })) });
      await reconcileStandardQuestSlots(db, p.id, random, now);
      await getHomeRecommendation(db, p.id, random, now);
      await getChallengeState(db, p.id, { random, now });
      return p.id;
    }
    const id = await player("home-benchmark@example.test");
    const acceptId = await player("accept-benchmark@example.test");
    for (const operation of ["standard", "warmHome", "recommendationAcceptance"]) {
      const times: number[] = []; const counts: number[] = [];
      for (let i = 0; i < 23; i++) {
        const recommendation = operation === "recommendationAcceptance" ? await getHomeRecommendation(db, acceptId, random, now) : null;
        count = 0; const start = performance.now();
        if (operation === "recommendationAcceptance") {
          await mutateStandardQuest(db, acceptId, recommendation!.playerQuestId, "accept", {}, { random, now });
          await getHomeRecommendation(db, acceptId, random, now);
          // Model the old UI's redundant refresh, serially to avoid lock contention.
          if (label === "before") { await reconcileStandardQuestSlots(db, acceptId, random, now); await getHomeRecommendation(db, acceptId, random, now); }
        } else {
          await reconcileStandardQuestSlots(db, id, random, now);
          if (operation === "warmHome") { await getHomeRecommendation(db, id, random, now); await getChallengeState(db, id, { random, now }); }
        }
        const elapsed = performance.now() - start;
        if (i >= 3) { times.push(elapsed); counts.push(count); }
      }
      times.sort((a, b) => a - b);
      results.push({ operation, samples: times.length, medianMs: +((times[9] + times[10]) / 2).toFixed(2), p95Ms: +times[18].toFixed(2), sqlMin: Math.min(...counts), sqlMax: Math.max(...counts) });
    }
    mkdirSync("test-results", { recursive: true });
    writeFileSync(`test-results/a08-${label}.json`, JSON.stringify(results, null, 2));
    console.log(results);
  } finally { try { await db.$disconnect(); } finally { await fixture.dispose(); } }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
