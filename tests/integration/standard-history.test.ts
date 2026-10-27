import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client";
import { createIntegrationDatabase } from "../support/integration-database";
import { insertHistory } from "../support/standard-history-fixture";
import { loadCanonicalSeed } from "../../src/modules/quests/seed/load";
import { persistCanonicalSeed } from "../../src/modules/quests/seed/persist";
import { completeOnboarding, ensurePlayerForUser } from "../../src/modules/player/services";
import { currentSlots, occupiedDefinitions, standardTransaction } from "../../src/modules/quests/standard/context";
import { definitionInclude, previewSnapshots } from "../../src/modules/quests/standard/content";
import { loadRecentHistory } from "../../src/modules/quests/standard/history";
import { catchUpModifiers, primaryTag, selectCandidate, weightedChoice } from "../../src/modules/quests/standard/selection";
import { reconcileStandardQuestSlots } from "../../src/modules/quests/standard/slots";
import { mutateStandardQuest } from "../../src/modules/quests/standard/actions";
import { resolveStandardQuest, reconcileExpiredStandardQuests } from "../../src/modules/quests/standard/resolution";
import { getHomeRecommendation } from "../../src/modules/recommendations/service";
import { reasonCodes, scoreRecommendation } from "../../src/modules/recommendations/scoring";
import { gameConfig } from "../../src/config/game";

const fixture = createIntegrationDatabase();
const db = new PrismaClient({ adapter: new PrismaPg(fixture.pool, { schema: fixture.schema }), log: [{ emit: "event", level: "query" }] });
let queries: string[] = [];
db.$on("query", (event) => queries.push(event.query));
const historyQueries = () => queries.filter((q) => q.includes("CROSS JOIN LATERAL"));
let playerId: string;
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });
beforeAll(() => fixture.setup());
beforeEach(async () => {
  await fixture.reset(["users", "skills", "quest_families", "quest_definitions"]);
  await persistCanonicalSeed(db, loadCanonicalSeed());
  const user = await db.user.create({ data: { email: "history@example.test" } });
  playerId = (await ensurePlayerForUser(db, user.id)).id;
  await completeOnboarding(db, user.id, { timezone: "America/Denver", focus: Object.entries({ F: 6, L: 6, O: 6, U: 6, R: 6, I: 6, S: 5, H: 5 }).map(([skillCode, points]) => ({ skillCode, points })) });
});
afterAll(async () => { try { await db.$disconnect(); } finally { await fixture.dispose(); } });

it("A08 constructs one Standard view and no discarded view on recommendation hits", async () => {
  const now = () => new Date("2026-10-27T18:00:00Z");
  const first = await reconcileStandardQuestSlots(db, playerId, () => 0.5, now);
  const recommendation = await getHomeRecommendation(db, playerId, () => 0.5, now);
  queries = [];
  expect(await reconcileStandardQuestSlots(db, playerId, () => 0.5, now)).toEqual(first);
  const selects = (table: string) => queries.filter((q) => q.startsWith("SELECT") && q.includes(`"${table}"`));
  expect(selects("player_quest_slots")).toHaveLength(2); // Expiration and reconciliation snapshots.
  expect(selects("player_progress")).toHaveLength(2); // Integrity validation and one view.
  expect(historyQueries()).toHaveLength(0);
  queries = [];
  expect(await getHomeRecommendation(db, playerId, () => { throw new Error("Unexpected recomputation"); }, now)).toEqual(recommendation);
  expect(selects("player_quest_slots")).toHaveLength(2);
  expect(selects("player_progress")).toHaveLength(1); // Integrity validation only.
  expect(historyQueries()).toHaveLength(0);
});

it("A08 returns fresh replacement relations and expired blockers after reconciliation", async () => {
  const now = new Date("2026-10-27T18:00:00Z");
  const first = await reconcileStandardQuestSlots(db, playerId, () => 0.5, () => now);
  const slots = first.skills.flatMap((skill) => skill.slots);
  const replaced = slots[0]; const accepted = slots[1];
  await mutateStandardQuest(db, playerId, accepted.quest.id, "accept", {}, { now: () => now });
  await db.questDefinition.update({ where: { id: replaced.quest.definitionId }, data: { active: false } });
  const later = new Date("2026-11-10T18:00:00Z");
  const result = await reconcileStandardQuestSlots(db, playerId, () => 0.5, () => later);
  const updated = result.skills.flatMap((skill) => skill.slots);
  expect(updated).toHaveLength(24);
  expect(updated.find((slot) => slot.id === replaced.id)!.quest.definitionId).not.toBe(replaced.quest.definitionId);
  expect(updated.find((slot) => slot.id === accepted.id)!.quest).toMatchObject({ id: accepted.quest.id, status: "EXPIRED" });
  expect(result.overallXp).toBe(first.overallXp);
  const recommendation = await getHomeRecommendation(db, playerId, () => 0.5, () => later);
  expect(recommendation).not.toBeNull();
  expect(updated.some((slot) => slot.quest.id === recommendation!.playerQuestId && slot.quest.status === "AVAILABLE")).toBe(true);
});

it.each([0, 9, 1000, 10000])("matches original full-history filtering and selection with %i completions", async (count) => {
  await insertHistory(db, playerId, count);
  await reconcileStandardQuestSlots(db, playerId, () => 0.5);
  const expected = await standardTransaction(db, playerId, async (context) => {
    // Original implementation is the parity oracle, including tied timestamps.
    const full = await context.tx.playerQuest.findMany({ where: { playerId, status: "COMPLETED" }, orderBy: [{ completedAt: "desc" }, { id: "asc" }], include: { skillSnapshots: true, questDefinition: { include: definitionInclude } } });
    const bounded = await context.history();
    const slots = await currentSlots(context);
    const occupied = occupiedDefinitions(slots);
    const scored = [];
    for (const skill of context.state.skills) {
      const relevant = full.filter((q) => q.skillSnapshots.some((s) => s.skillId === skill.id));
      const recent = relevant.slice(0, gameConfig.recommendations.varietyHistoryWindow).map((q) => ({ definitionId: q.questDefinitionId, primaryTagId: primaryTag(q.questDefinition) }));
      expect(bounded.get(skill.id)).toEqual(recent);
      const selection = await context.selection(skill.id, occupied);
      for (const roll of [0, 0.17, 0.5, 0.99]) expect(selectCandidate(context.candidates(skill.id), selection, () => roll).id).toBe(selectCandidate(context.candidates(skill.id), { ...selection, recent }, () => roll).id);
    }
    const focus = Object.fromEntries(context.state.rows.map((r) => [r.skillId, r.focusPoints]));
    const catchUp = catchUpModifiers(context.progress.map((p) => ({ ...p, code: context.state.skills.find((s) => s.id === p.skillId)!.code })));
    for (const slot of slots) {
      const q = slot.currentPlayerQuest!;
      const candidate = { id: slot.id, playerQuestId: q.id, slotSkillId: slot.skillId, difficulty: q.questDefinition.difficulty, estimatedMinutes: q.questDefinition.estimatedMinutes, skills: q.questDefinition.skills, primaryTagId: primaryTag(q.questDefinition) };
      const inputs = { level: context.progress.find((p) => p.skillId === slot.skillId)!.currentLevel, focus, catchUp, interactions: [], completedPrimaryTags: full.filter((q) => q.skillSnapshots.some((s) => s.skillId === slot.skillId)).map((q) => primaryTag(q.questDefinition)) };
      const factors = scoreRecommendation(candidate, inputs, () => 0.37);
      expect(scoreRecommendation(candidate, { ...inputs, completedPrimaryTags: bounded.get(slot.skillId)!.map((q) => q.primaryTagId) }, () => 0.37)).toEqual(factors);
      scored.push({ candidate, factors });
    }
    const winner = weightedChoice(scored, scored.map((s) => s.factors.score), () => 0.37);
    return { id: winner.candidate.playerQuestId, reasons: reasonCodes(winner.factors) };
  });
  const result = await getHomeRecommendation(db, playerId, () => 0.37);
  expect(result?.playerQuestId).toBe(expected.id);
  expect((await db.playerRecommendation.findUniqueOrThrow({ where: { playerId } })).reasonCodes).toEqual(expected.reasons);
});

it("uses snapshot membership for multi-Skill completions when current definition membership differs", async () => {
  const skills = await db.skill.findMany({ orderBy: { code: "asc" } });
  const definition = await db.questDefinition.findFirstOrThrow({ where: { standardEligible: true }, include: definitionInclude });
  const q = await db.playerQuest.create({ data: { playerId, questDefinitionId: definition.id, poolType: "DAILY", status: "COMPLETED", completedAt: new Date(), ...previewSnapshots(definition), skillSnapshots: { create: [{ skillId: skills[6].id, isPrimary: true, rewardPercent: 60 }, { skillId: skills[7].id, isPrimary: false, rewardPercent: 40 }] } } });
  const history = await loadRecentHistory(db, playerId, skills.map((s) => s.id));
  for (const skill of skills.slice(0, 6)) expect(history.get(skill.id)).toEqual([]);
  for (const skill of skills.slice(6)) expect(history.get(skill.id)).toEqual([{ definitionId: q.questDefinitionId, primaryTagId: primaryTag(definition) }]);
});

it("breaks equal-timestamp ties by quest ID before applying each Skill's limit", async () => {
  const skill = await db.skill.findFirstOrThrow({ where: { code: "F" } });
  const definitions = await db.questDefinition.findMany({ where: { standardEligible: true, skills: { some: { skillId: skill.id, isPrimary: true } } }, include: definitionInclude, orderBy: { stableKey: "asc" }, take: 6 });
  expect(definitions).toHaveLength(6);
  // Reverse insertion order makes a missing ID tie-break observable at the cutoff.
  for (let i = 5; i >= 0; i--) {
    await db.playerQuest.create({ data: { id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, playerId, questDefinitionId: definitions[i].id, poolType: "STANDARD", status: "COMPLETED", completedAt: new Date("2026-01-01T00:00:00Z"), ...previewSnapshots(definitions[i]), skillSnapshots: { create: { skillId: skill.id, isPrimary: true, rewardPercent: 100 } } } });
  }
  const history = await loadRecentHistory(db, playerId, [skill.id]);
  expect(history.get(skill.id)).toEqual(definitions.slice(0, 5).map((q) => ({ definitionId: q.id, primaryTagId: primaryTag(q) })));
});

it("skips history on reads, persisted hits, concurrent accepts and expiration; recomputes after invalidation", async () => {
  await insertHistory(db, playerId, 1000);
  await reconcileStandardQuestSlots(db, playerId, () => 0.5);
  const first = await getHomeRecommendation(db, playerId, () => 0.5);
  queries = [];
  await reconcileStandardQuestSlots(db, playerId, () => 0.5);
  expect(await getHomeRecommendation(db, playerId, () => { throw new Error("Unexpected recomputation"); })).toEqual(first);
  expect(historyQueries()).toHaveLength(0);
  const now = new Date("2026-10-27T12:00:00Z");
  await Promise.all([1, 2].map(() => mutateStandardQuest(db, playerId, first!.playerQuestId, "accept", {}, { now: () => now })));
  expect(historyQueries()).toHaveLength(0);
  queries = [];
  expect((await getHomeRecommendation(db, playerId, () => 0.5, () => now))?.playerQuestId).not.toBe(first!.playerQuestId);
  expect(historyQueries()).toHaveLength(1);
  queries = [];
  await reconcileExpiredStandardQuests(db, playerId, new Date("2026-11-10T12:00:00Z"));
  expect(historyQueries()).toHaveLength(0);
  expect((await db.playerQuest.findUniqueOrThrow({ where: { id: first!.playerQuestId } })).status).toBe("EXPIRED");
});

it("captures history before completion and reuses it for atomic refill", async () => {
  await insertHistory(db, playerId, 9);
  const state = await reconcileStandardQuestSlots(db, playerId, () => 0.5);
  const id = state.skills[0].slots[0].quest!.id;
  const now = new Date("2026-10-27T12:00:00Z");
  await mutateStandardQuest(db, playerId, id, "accept", {}, { now: () => now });
  queries = [];
  await resolveStandardQuest(db, playerId, id, "complete", { random: () => 0.5, now: () => now });
  expect(historyQueries()).toHaveLength(1);
  const historyIndex = queries.findIndex((q) => q.includes("CROSS JOIN LATERAL"));
  const completionIndex = queries.findIndex((q) => q.includes('UPDATE') && q.includes('completed_at'));
  expect(historyIndex).toBeLessThan(completionIndex);
  expect(await db.questReward.count({ where: { playerQuestId: id } })).toBe(1);
});
