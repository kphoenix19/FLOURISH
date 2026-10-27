import { loadRecentHistory, recentHistoryQuery } from "../src/modules/quests/standard/history";
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { createIntegrationDatabase } from "../tests/support/integration-database";
import { insertHistory } from "../tests/support/standard-history-fixture";
import { loadCanonicalSeed } from "../src/modules/quests/seed/load";
import { persistCanonicalSeed } from "../src/modules/quests/seed/persist";
import { ensurePlayerForUser, completeOnboarding } from "../src/modules/player/services";
import { reconcileStandardQuestSlots } from "../src/modules/quests/standard/slots";
import { getHomeRecommendation } from "../src/modules/recommendations/service";

async function main() {
  const fixture = createIntegrationDatabase();
  const db = new PrismaClient({ adapter: new PrismaPg(fixture.pool, { schema: fixture.schema }), log: [{ emit: "event", level: "query" }] });
  let statements: string[] = [];
  db.$on("query", (event) => statements.push(event.query));
  const results = [];
  try {
    mkdirSync("test-results", { recursive: true });
    await fixture.setup();
    await persistCanonicalSeed(db, loadCanonicalSeed());
    for (const count of [0, 1000, 10000]) {
      const user = await db.user.create({ data: { email: `history-${count}@example.test` } });
      const player = await ensurePlayerForUser(db, user.id);
      await completeOnboarding(db, user.id, { timezone: "America/Denver", focus: Object.entries({ F: 6, L: 6, O: 6, U: 6, R: 6, I: 6, S: 5, H: 5 }).map(([skillCode, points]) => ({ skillCode, points })) });
      await insertHistory(db, player.id, count);
      await fixture.pool.query("ANALYZE");
      const standard = () => reconcileStandardQuestSlots(db, player.id, () => 0.5);
      const recommendation = () => getHomeRecommendation(db, player.id, () => 0.5, () => new Date("2026-10-27T18:00:00Z"));
      await standard(); await recommendation();
      for (const operation of ["standard", "hit", "recompute"]) {
        const times: number[] = []; const counts: number[] = [];
        for (let i = 0; i < 23; i++) {
          if (operation === "recompute") await db.playerRecommendation.updateMany({ where: { playerId: player.id }, data: { invalidatedAt: new Date() } });
          statements = [];
          const start = performance.now();
          await (operation === "standard" ? standard() : recommendation());
          const elapsed = performance.now() - start;
          if (i >= 3) { times.push(elapsed); counts.push(statements.length); }
        }
        times.sort((a, b) => a - b);
        const result = { count, operation, samples: times.length, medianMs: +((times[9] + times[10]) / 2).toFixed(2), p95Ms: +times[18].toFixed(2), sqlMin: Math.min(...counts), sqlMax: Math.max(...counts) };
        results.push(result); console.log(result);
      }
      const skills = await db.skill.findMany();
      const history = await loadRecentHistory(db, player.id, skills.map((s) => s.id));
      const plan = await db.$queryRaw(Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${recentHistoryQuery(player.id, skills.map((s) => s.id))}`);
      writeFileSync(`test-results/a07-plan-${count}.json`, JSON.stringify({ historyRows: [...history.values()].flat().length, plan }, null, 2));
    }
    const label = process.argv[2] === "before" ? "before" : "after";
    writeFileSync(`test-results/a07-${label}.json`, JSON.stringify(results, null, 2));
  } finally { try { await db.$disconnect(); } finally { await fixture.dispose(); } }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
