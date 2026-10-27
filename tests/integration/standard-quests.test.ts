import { createIntegrationDatabase } from "../support/integration-database";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadCanonicalSeed } from "../../src/modules/quests/seed/load";
import { persistCanonicalSeed } from "../../src/modules/quests/seed/persist";
import { completeOnboarding, ensurePlayerForUser, respecFocus, updateTimezone } from "../../src/modules/player/services";
import { ensureStandardQuestSlots, reconcileStandardQuestSlots } from "../../src/modules/quests/standard/slots";
import { mutateStandardQuest } from "../../src/modules/quests/standard/actions";
import { definitionInclude, previewSnapshots } from "../../src/modules/quests/standard/content";
import { createStandardApi } from "../../src/modules/quests/standard/api";
import { resolveStandardQuest } from "../../src/modules/quests/standard/resolution";
import type { StandardState } from "../../src/modules/quests/standard/view";
import { getHomeRecommendation } from "../../src/modules/recommendations/service";
import { createRecommendationApi } from "../../src/modules/recommendations/api";
import { percentRoundHalfUp } from "../../src/modules/progression/math";
import { getChallengeState, mutateChallenge, reconcilePlayerChallenges } from "../../src/modules/challenges/service";
import { challengeWindow } from "../../src/modules/challenges/windows";
import { createChallengeApi } from "../../src/modules/challenges/api";
import { transitionQuest } from "../../src/modules/admin/service";
import { runGameStateReconciliation } from "../../src/modules/jobs/reconciliation";
import { gameConfig } from "../../src/config/game";

async function requireRecommendation(...args: Parameters<typeof getHomeRecommendation>) {
  const result = await getHomeRecommendation(...args);
  expect(result).not.toBeNull();
  if (!result) throw new Error("Expected an eligible recommendation");
  return result;
}

function requireActivePools(state: Awaited<ReturnType<typeof getChallengeState>>) {
  expect(state.daily).not.toBeNull(); expect(state.weekly).not.toBeNull();
  if (!state.daily || !state.weekly) throw new Error("Expected both Challenge pools active");
  return { ...state, daily: state.daily, weekly: state.weekly };
}
async function getActiveChallengeState(...args: Parameters<typeof getChallengeState>) { return requireActivePools(await getChallengeState(...args)); }
async function mutateActiveChallenge(...args: Parameters<typeof mutateChallenge>) { return requireActivePools(await mutateChallenge(...args)); }

const fixtureDb = createIntegrationDatabase();
const { schema, pool } = fixtureDb;
const db = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });
let playerId: string; let userId: string;
const focus = () => Object.entries({ F: 6, L: 6, O: 6, U: 6, R: 6, I: 6, S: 5, H: 5 }).map(([skillCode, points]) => ({ skillCode, points }));
const flat = (s: StandardState) => s.skills.flatMap((x) => x.slots);
const read = () => reconcileStandardQuestSlots(db, playerId, () => 0.5);
const action = (id: string, kind: "accept" | "reroll" | "bump", input = {}) => mutateStandardQuest(db, playerId, id, kind, input, { random: () => 0.5 });
beforeAll(() => fixtureDb.setup());
beforeEach(async () => {
  await fixtureDb.reset(["users","skills","quest_families","quest_definitions"]);
  await persistCanonicalSeed(db, loadCanonicalSeed());
  userId = (await db.user.create({ data: { email: "standard@example.test" } })).id;
  playerId = (await ensurePlayerForUser(db, userId)).id;
  await completeOnboarding(db, userId, { timezone: "America/Denver", focus: focus() });
});
afterAll(async () => { try { await db.$disconnect(); } finally { await fixtureDb.dispose(); } });

describe("Challenge timezone transitions A05", () => {
  const start = new Date("2026-10-26T12:00:00Z");
  const readAt = (at: Date) => getChallengeState(db, playerId, { now: () => at, random: () => 0.5 });
  async function initialize(timezone = "UTC", at = start) {
    await updateTimezone(db, userId, { timezone });
    return requireActivePools(await readAt(at));
  }
  async function noOverlap() {
    for (const poolType of ["DAILY", "WEEKLY"] as const) {
      const sets = await db.challengeSet.findMany({ where: { playerId, poolType }, orderBy: { windowStartAt: "asc" } });
      for (let i = 1; i < sets.length; i++) expect(sets[i].windowStartAt.getTime()).toBeGreaterThanOrEqual(sets[i - 1].windowEndAt.getTime());
    }
  }
  async function finish(q: { id: string; completionType: string; target: number }, at: Date) {
    await mutateChallenge(db, playerId, q.id, "accept", { now: () => at });
    if (q.completionType === "SINGLE") await mutateChallenge(db, playerId, q.id, "complete", { now: () => at });
    else for (let i = 0; i < q.target; i++) await mutateChallenge(db, playerId, q.id, "increment", { now: () => at });
  }
  it.each([
    ["UTC", "America/Denver"], ["America/Denver", "UTC"],
    ["Pacific/Honolulu", "Pacific/Kiritimati"],
  ])("preserves assignments and windows across %s to %s, including local-midnight crossings", async (from, to) => {
    const original = await initialize(from);
    const rows = await db.playerQuest.findMany({ where: { playerId }, orderBy: { id: "asc" } });
    await updateTimezone(db, userId, { timezone: to });
    const state = await readAt(start);
    expect(state).toEqual({ ...original, timezone: to });
    expect(await db.playerQuest.findMany({ where: { playerId }, orderBy: { id: "asc" } })).toEqual(rows);
    expect(await db.challengeSet.count({ where: { playerId } })).toBe(2);
    await noOverlap();
  });
  it.each([["UTC", "America/Denver"], ["America/Denver", "UTC"]])("rolls Daily and Weekly independently from %s to %s with full-period gaps", async (from, to) => {
    const original = await initialize(from);
    await updateTimezone(db, userId, { timezone: to });
    const dailyEnd = new Date(original.daily.windowEndAt);
    const gap = await readAt(dailyEnd);
    const nextDaily = challengeWindow("DAILY", dailyEnd, to).end;
    expect(gap.daily).toBeNull(); expect(gap.nextDailyStartsAt).toBe(nextDaily.toISOString());
    expect(gap.weekly).toEqual(original.weekly);
    expect(await db.playerQuest.count({ where: { playerId } })).toBe(8);
    expect(await db.playerQuest.count({ where: { challengeSetId: original.daily.id, status: "EXPIRED" } })).toBe(3);
    expect((await readAt(new Date(nextDaily.getTime() - 1))).daily).toBeNull();
    const daily = requireActivePools(await readAt(nextDaily));
    expect(daily.daily.windowStartAt).toBe(nextDaily.toISOString());
    expect(daily.daily.windowEndAt).toBe(challengeWindow("DAILY", nextDaily, to).end.toISOString());
    expect(daily.weekly).toEqual(original.weekly);
    const weeklyEnd = new Date(original.weekly.windowEndAt);
    const weeklyGap = await readAt(weeklyEnd);
    const nextWeekly = challengeWindow("WEEKLY", weeklyEnd, to).end;
    expect(weeklyGap.weekly).toBeNull(); expect(weeklyGap.nextWeeklyStartsAt).toBe(nextWeekly.toISOString());
    expect((await readAt(new Date(nextWeekly.getTime() - 1))).weekly).toBeNull();
    const weekly = requireActivePools(await readAt(nextWeekly));
    expect(weekly.weekly.windowStartAt).toBe(nextWeekly.toISOString());
    expect(weekly.weekly.windowEndAt).toBe(challengeWindow("WEEKLY", nextWeekly, to).end.toISOString());
    expect(await db.xpTransaction.count({ where: { playerId } })).toBe(0);
    await noOverlap();
  });
  it("keeps accepted Challenges visible and completes them once from snapshots after repeated timezone changes", async () => {
    const original = await initialize();
    const quests = [original.daily.quests[0], original.weekly.quests[0]];
    for (const q of quests) await mutateChallenge(db, playerId, q.id, "accept", { now: () => start });
    const before = await db.playerQuest.findMany({ where: { id: { in: quests.map((q) => q.id) } }, include: { skillSnapshots: true }, orderBy: { id: "asc" } });
    for (const timezone of ["America/Denver", "Asia/Tokyo", "UTC", "Pacific/Honolulu"]) {
      await updateTimezone(db, userId, { timezone });
      const state = requireActivePools(await readAt(start));
      expect([state.daily.quests[0].id, state.weekly.quests[0].id]).toEqual(quests.map((q) => q.id));
      expect(state.daily.quests[0].status).toBe("ACCEPTED"); expect(state.weekly.quests[0].status).toBe("ACCEPTED");
      expect(await db.playerQuest.findMany({ where: { id: { in: quests.map((q) => q.id) } }, include: { skillSnapshots: true }, orderBy: { id: "asc" } })).toEqual(before);
    }
    for (const q of quests) {
      await finish(q, start);
      await expect(mutateChallenge(db, playerId, q.id, q.completionType === "SINGLE" ? "complete" : "increment", { now: () => start })).rejects.toMatchObject({ code: "INVALID_STATUS" });
    }
    const completed = requireActivePools(await readAt(start));
    expect(completed.daily.quests[0].status).toBe("COMPLETED"); expect(completed.weekly.quests[0].status).toBe("COMPLETED");
    const rewards = await db.questReward.findMany({ where: { playerQuestId: { in: quests.map((q) => q.id) } } });
    expect(rewards).toHaveLength(2);
    expect(await db.playerProgress.findUniqueOrThrow({ where: { playerId } })).toMatchObject({ overallXp: rewards.reduce((sum, r) => sum + r.finalOverallXp, 0) });
    expect(await db.challengeSet.count({ where: { playerId } })).toBe(2);
    await noOverlap();
  });
  it("does not regenerate completed pools or repeat set bonuses when timezone switching", async () => {
    const original = await initialize();
    for (const q of [...original.daily.quests, ...original.weekly.quests]) await finish(q, start);
    const ledgerCount = await db.xpTransaction.count({ where: { playerId } });
    for (const timezone of ["America/Denver", "Asia/Tokyo", "UTC"]) {
      await updateTimezone(db, userId, { timezone });
      const state = requireActivePools(await readAt(start));
      expect(state.daily.id).toBe(original.daily.id); expect(state.weekly.id).toBe(original.weekly.id);
      expect(state.daily.setBonusAwarded).toBe(true); expect(state.weekly.setBonusAwarded).toBe(true);
    }
    expect(await db.questReward.count()).toBe(8);
    expect(await db.xpTransaction.count({ where: { playerId } })).toBe(ledgerCount);
    expect(await db.xpTransaction.count({ where: { playerId, transactionType: { in: ["DAILY_SET_BONUS", "WEEKLY_SET_BONUS"] } } })).toBe(2);
    expect(await db.playerQuest.count({ where: { playerId } })).toBe(8);
  });
  it("serializes reads, timezone updates and scheduled reconciliation without extra pools", async () => {
    const original = await initialize();
    for (const timezone of ["America/Denver", "Asia/Tokyo", "Pacific/Honolulu", "UTC"]) {
      const [, a, b] = await Promise.all([updateTimezone(db, userId, { timezone }), readAt(start), readAt(start), reconcilePlayerChallenges(db, playerId, { now: start, random: () => 0.5 })]);
      expect(a.daily?.id).toBe(original.daily.id); expect(b.weekly?.id).toBe(original.weekly.id);
    }
    expect(await db.challengeSet.count({ where: { playerId } })).toBe(2);
    expect(await db.playerQuest.count({ where: { playerId } })).toBe(8);
    await noOverlap();
  });
  it("keeps gap reads and jobs idempotent, then serializes generation at the new midnight", async () => {
    const original = await initialize();
    await updateTimezone(db, userId, { timezone: "America/Denver" });
    const end = new Date(original.daily.windowEndAt);
    const gap = await readAt(end);
    for (let i = 0; i < 2; i++) {
      expect(await readAt(end)).toEqual(gap);
      expect(await reconcilePlayerChallenges(db, playerId, { now: end, random: () => 0.5 })).toMatchObject({ challengeSetsCreated: 0 });
    }
    expect(await db.playerQuest.count({ where: { playerId } })).toBe(8);
    const boundary = new Date(gap.nextDailyStartsAt!);
    const [a, b] = await Promise.all([readAt(boundary), readAt(boundary), reconcilePlayerChallenges(db, playerId, { now: boundary, random: () => 0.5 })]);
    expect(a).toEqual(b);
    expect(await db.challengeSet.count({ where: { playerId } })).toBe(3);
    expect(await db.playerQuest.count({ where: { playerId } })).toBe(11);
    await noOverlap();
  });
  it.each([-1, 1])("handles a timezone update %s ms from Daily expiry without backdating a pool", async (offset) => {
    const original = await initialize();
    const end = new Date(original.daily.windowEndAt);
    const at = new Date(end.getTime() + offset);
    await updateTimezone(db, userId, { timezone: "America/Denver" });
    const state = await readAt(at);
    if (offset < 0) expect(state.daily?.id).toBe(original.daily.id);
    else { expect(state.daily).toBeNull(); expect(state.nextDailyStartsAt).toBe("2026-10-27T06:00:00.000Z"); }
    expect(await db.challengeSet.count({ where: { playerId } })).toBe(2);
  });
  it("preserves a period already generated just after rollover when the timezone then changes", async () => {
    const original = await initialize();
    const at = new Date(new Date(original.daily.windowEndAt).getTime() + 1);
    const rolled = requireActivePools(await readAt(at));
    await updateTimezone(db, userId, { timezone: "America/Denver" });
    expect((await readAt(at)).daily).toEqual(rolled.daily);
    expect(await db.challengeSet.count({ where: { playerId } })).toBe(3);
  });
  it.each([
    { at: "2026-03-07T12:00:00Z", boundary: "2026-03-08T07:00:00Z", hours: 23 },
    { at: "2026-10-31T12:00:00Z", boundary: "2026-11-01T06:00:00Z", hours: 25 },
  ])("adopts full Denver calendar days through DST ($hours hours)", async ({ at, boundary, hours }) => {
    const original = await initialize("UTC", new Date(at));
    await updateTimezone(db, userId, { timezone: "America/Denver" });
    const gap = await readAt(new Date(original.daily.windowEndAt));
    expect(gap.daily).toBeNull(); expect(gap.nextDailyStartsAt).toBe(new Date(boundary).toISOString());
    const state = requireActivePools(await readAt(new Date(boundary)));
    expect(new Date(state.daily.windowEndAt).getTime() - new Date(state.daily.windowStartAt).getTime()).toBe(hours * 3_600_000);
    expect(state.weekly.id).toBe(original.weekly.id);
    await noOverlap();
  });
  it("allows Weekly completion directly through REST during the Daily gap and preserves the expiry error", async () => {
    const original = await initialize();
    const q = original.weekly.quests.find((q) => q.completionType === "SINGLE")!;
    await mutateChallenge(db, playerId, q.id, "accept", { now: () => start });
    await updateTimezone(db, userId, { timezone: "America/Denver" });
    const api = createChallengeApi({ getDb: () => db, resolveUser: async () => ({ id: userId, email: "standard@example.test", role: "PLAYER", playerId, onboardingCompletedAt: start.toISOString() }) });
    const request = () => new Request("http://localhost:3000/api/challenges/action", { method: "POST", headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" }, body: "{}" });
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(original.daily.windowEndAt));
    try {
      const response = await api.mutate(request(), q.id, "complete");
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ daily: null, nextDailyStartsAt: "2026-10-27T06:00:00.000Z", weekly: { id: original.weekly.id } });
      const expired = await api.mutate(request(), original.daily.quests[0].id, "accept");
      expect(expired.status).toBe(409); expect(await expired.json()).toMatchObject({ error: { code: "CHALLENGE_EXPIRED" } });
    } finally { vi.useRealTimers(); }
    expect(await db.questReward.count()).toBe(1);
    expect(await db.playerQuest.count({ where: { playerId, status: "EXPIRED" } })).toBe(3);
  });
  it.each(["retired", "unapproved"])("keeps A03 rejection for %s assignments after a timezone change", async (reason) => {
    const original = await initialize(); const q = original.daily.quests[0];
    const stored = await db.playerQuest.findUniqueOrThrow({ where: { id: q.id } });
    await updateTimezone(db, userId, { timezone: "America/Denver" });
    await db.questDefinition.update({ where: { id: stored.questDefinitionId }, data: reason === "retired" ? { active: false } : { reviewStatus: "PENDING_REVIEW" } });
    await expect(mutateChallenge(db, playerId, q.id, "accept", { now: () => start })).rejects.toMatchObject({ code: "OFFER_CHANGED" });
    expect(await db.questReward.count()).toBe(0); expect(await db.xpTransaction.count()).toBe(0);
    expect(await db.playerQuest.findUniqueOrThrow({ where: { id: q.id } })).toMatchObject({ status: "AVAILABLE", acceptedAt: null });
  });
  it("skips missed periods on a late return instead of backfilling assignments", async () => {
    await initialize();
    await updateTimezone(db, userId, { timezone: "America/Denver" });
    const at = new Date("2026-12-16T18:00:00Z");
    const state = requireActivePools(await readAt(at));
    expect(state.daily.windowStartAt).toBe(challengeWindow("DAILY", at, "America/Denver").start.toISOString());
    expect(state.weekly.windowStartAt).toBe(challengeWindow("WEEKLY", at, "America/Denver").start.toISOString());
    expect(await db.challengeSet.count({ where: { playerId } })).toBe(4);
    await noOverlap();
  });
});

describe("Challenge mutation rollover", () => {
  const monday = new Date("2026-10-26T12:00:00Z");
  async function fixture(type: "SINGLE" | "COUNT", start = monday, poolType: "DAILY" | "WEEKLY" = "WEEKLY") {
    const state = await getActiveChallengeState(db, playerId, { now: () => start, random: () => 0.5 });
    const quest = (poolType === "DAILY" ? state.daily : state.weekly).quests[0];
    const stored = await db.playerQuest.findUniqueOrThrow({ where: { id: quest.id } });
    // Keep the selected definition and allocations; make the completion mode explicit.
    await db.questDefinition.update({ where: { id: stored.questDefinitionId }, data: { completionType: type, completionTarget: type === "SINGLE" ? 1 : 3 } });
    await mutateActiveChallenge(db, playerId, quest.id, "accept", { now: () => start });
    return { state, id: quest.id, rollover: new Date(state.daily.windowEndAt) };
  }
  async function assertSettlement(id: string) {
    const reward = await db.questReward.findUniqueOrThrow({ where: { playerQuestId: id }, include: { skillRewards: true } });
    expect(reward.finalOverallXp).toBe(reward.skillRewards.reduce((total, skill) => total + skill.finalSkillXp, 0));
    expect(await db.playerProgress.findUniqueOrThrow({ where: { playerId } })).toMatchObject({ overallXp: reward.finalOverallXp });
    const ledger = await db.xpTransaction.findMany({ where: { playerQuestId: id } });
    expect(ledger.filter((row) => row.xpScope === "OVERALL").map((row) => row.amount)).toEqual([reward.finalOverallXp]);
    for (const skill of reward.skillRewards) {
      expect(await db.playerSkillProgress.findUniqueOrThrow({ where: { playerId_skillId: { playerId, skillId: skill.skillId } } })).toMatchObject({ currentXp: skill.finalSkillXp, lifetimeXp: skill.finalSkillXp });
      expect(ledger.filter((row) => row.skillId === skill.skillId).map((row) => row.amount)).toEqual([skill.finalSkillXp, skill.finalSkillXp]);
    }
    expect(await db.questReward.count({ where: { playerQuestId: id } })).toBe(1);
  }
  it.each([
    { timezone: "America/Denver", start: monday, hours: 24 },
    { timezone: "Asia/Tokyo", start: monday, hours: 24 },
    { timezone: "America/Denver", start: new Date("2026-10-31T18:00:00Z"), hours: 25 },
  ])("completes Weekly SINGLE at Daily midnight in $timezone ($hours-hour day) without a GET", async ({ timezone, start, hours }) => {
    await updateTimezone(db, userId, { timezone });
    const { state, id, rollover } = await fixture("SINGLE", start);
    expect(await db.challengeSet.count({ where: { playerId } })).toBe(2);
    const [completed, duplicate] = await Promise.allSettled([
      mutateActiveChallenge(db, playerId, id, "complete", { now: () => rollover }),
      mutateActiveChallenge(db, playerId, id, "complete", { now: () => rollover }),
    ]);
    const results = [completed, duplicate];
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "INVALID_STATUS" } });
    const result = results.find((r) => r.status === "fulfilled")!;
    if (result.status !== "fulfilled") throw new Error("Expected completion");
    expect(result.value.daily.id).not.toBe(state.daily.id);
    expect(result.value.weekly.id).toBe(state.weekly.id);
    expect(result.value.daily.quests).toHaveLength(3);
    expect(result.value.weekly.quests).toHaveLength(5);
    expect(new Date(result.value.daily.windowEndAt).getTime() - new Date(result.value.daily.windowStartAt).getTime()).toBe(hours * 3_600_000);
    expect(await db.challengeSet.count({ where: { playerId } })).toBe(3);
    expect(await db.playerQuest.count({ where: { challengeSetId: state.daily.id, status: "EXPIRED" } })).toBe(3);
    await assertSettlement(id);
    await expect(mutateActiveChallenge(db, playerId, id, "complete", { now: () => rollover })).rejects.toMatchObject({ code: "INVALID_STATUS" });
    await assertSettlement(id);
  });
  it("increments and decrements Weekly COUNT across successive Daily rollovers, then settles once", async () => {
    const { state, id, rollover } = await fixture("COUNT");
    const first = await mutateActiveChallenge(db, playerId, id, "increment", { now: () => rollover });
    expect(first.daily.id).not.toBe(state.daily.id);
    expect(first.weekly.quests.find((q) => q.id === id)).toMatchObject({ currentProgress: 1, status: "ACCEPTED" });
    expect(await db.xpTransaction.count({ where: { playerId } })).toBe(0);
    const nextDay = new Date(first.daily.windowEndAt);
    const decreased = await mutateActiveChallenge(db, playerId, id, "decrement", { now: () => nextDay });
    expect(decreased.daily.id).not.toBe(first.daily.id);
    expect(decreased.weekly.quests.find((q) => q.id === id)?.currentProgress).toBe(0);
    for (let i = 0; i < 3; i++) await mutateActiveChallenge(db, playerId, id, "increment", { now: () => nextDay });
    await assertSettlement(id);
    await expect(mutateActiveChallenge(db, playerId, id, "increment", { now: () => nextDay })).rejects.toMatchObject({ code: "INVALID_STATUS" });
    await assertSettlement(id);
  });
  it("supports direct REST completion with no current Daily preload", async () => {
    const { state, id, rollover } = await fixture("SINGLE");
    const api = createChallengeApi({ getDb: () => db, resolveUser: async () => ({ id: userId, email: "standard@example.test", role: "PLAYER", playerId, onboardingCompletedAt: monday.toISOString() }) });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(rollover);
    try {
      const response = await api.mutate(new Request("http://localhost:3000/api/challenges/complete", { method: "POST", headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" }, body: "{}" }), id, "complete");
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.daily.id).not.toBe(state.daily.id);
      expect(result.weekly.quests.find((q: { id: string }) => q.id === id)).toMatchObject({ status: "COMPLETED" });
      await assertSettlement(id);
    } finally { vi.useRealTimers(); }
  });
  it.each(["accept", "complete", "increment"] as const)("persists Daily expiration before rejecting late %s, without rewards or pool prerequisites", async (action) => {
    const { id, rollover } = await fixture(action === "increment" ? "COUNT" : "SINGLE", monday, "DAILY");
    // Even unavailable generation content must not prevent expiration from committing.
    await db.questDefinition.updateMany({ data: { active: false } });
    await expect(mutateActiveChallenge(db, playerId, id, action, { now: () => rollover })).rejects.toMatchObject({ status: 409, code: "CHALLENGE_EXPIRED" });
    expect(await db.playerQuest.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "EXPIRED", expiredAt: rollover, acceptedAt: monday, currentProgress: 0 });
    expect(await db.questReward.count()).toBe(0);
    expect(await db.xpTransaction.count()).toBe(0);
    expect(await db.challengeSet.count({ where: { playerId } })).toBe(2);
  });
  it("preserves both response pools after a timezone change while preserving stored Weekly windows", async () => {
    const { id } = await fixture("COUNT");
    const before = await db.playerQuest.findUniqueOrThrow({ where: { id } });
    await updateTimezone(db, userId, { timezone: "Asia/Tokyo" });
    const result = await mutateActiveChallenge(db, playerId, id, "increment", { now: () => monday });
    expect(result.timezone).toBe("Asia/Tokyo");
    expect(result.daily.quests).toHaveLength(3);
    expect(result.weekly.quests).toHaveLength(5);
    expect(await db.challengeSet.count({ where: { playerId } })).toBe(2);
    expect(await db.playerQuest.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "ACCEPTED", currentProgress: 1, windowStartAt: before.windowStartAt, windowEndAt: before.windowEndAt, acceptedAt: before.acceptedAt, baseXpSnapshot: before.baseXpSnapshot });
  });
  it("initializes the missing Daily response on new acceptance and on an accepted retry", async () => {
    const { state, id, rollover } = await fixture("SINGLE");
    const next = state.weekly.quests.find((q) => q.id !== id)!;
    const accepted = await mutateActiveChallenge(db, playerId, next.id, "accept", { now: () => rollover });
    expect(accepted.daily.id).not.toBe(state.daily.id);
    const retry = await mutateActiveChallenge(db, playerId, id, "accept", { now: () => new Date(accepted.daily.windowEndAt) });
    expect(retry.daily.id).not.toBe(accepted.daily.id);
    expect(await db.questInteraction.count({ where: { playerQuestId: id, interactionType: "ACCEPTED" } })).toBe(1);
  });
  it("rolls back settlement and reconciliation on genuine pool-generation failure, then safely retries", async () => {
    const { state, id, rollover } = await fixture("SINGLE");
    const progress = await db.playerSkillProgress.findMany({ where: { playerId }, orderBy: { skillId: "asc" } });
    const streaks = await db.playerSkillStreak.findMany({ where: { playerId }, orderBy: { skillId: "asc" } });
    const eligible = await db.questDefinition.findMany({ where: { dailyEligible: true }, select: { id: true } });
    await db.questDefinition.updateMany({ where: { dailyEligible: true }, data: { dailyEligible: false } });
    await expect(mutateActiveChallenge(db, playerId, id, "complete", { now: () => rollover })).rejects.toMatchObject({ status: 503, code: "NO_CHALLENGE_SET" });
    expect(await db.playerQuest.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "ACCEPTED", completedAt: null });
    expect(await db.questReward.count()).toBe(0);
    expect(await db.xpTransaction.count()).toBe(0);
    expect(await db.questInteraction.count({ where: { playerQuestId: id, interactionType: "COMPLETED" } })).toBe(0);
    expect(await db.playerProgress.findUniqueOrThrow({ where: { playerId } })).toMatchObject({ overallXp: 0 });
    expect(await db.playerSkillProgress.findMany({ where: { playerId }, orderBy: { skillId: "asc" } })).toEqual(progress);
    expect(await db.playerSkillStreak.findMany({ where: { playerId }, orderBy: { skillId: "asc" } })).toEqual(streaks);
    expect(await db.challengeSet.count({ where: { playerId } })).toBe(2);
    expect(await db.playerQuest.count({ where: { challengeSetId: state.daily.id, status: "EXPIRED" } })).toBe(0);
    await db.questDefinition.updateMany({ where: { id: { in: eligible.map((d) => d.id) } }, data: { dailyEligible: true } });
    await mutateActiveChallenge(db, playerId, id, "complete", { now: () => rollover });
    await assertSettlement(id);
  });
});

describe("Challenge acceptance eligibility", () => {
  const request = () => new Request("http://localhost:3000/api/challenges/accept", { method: "POST", headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" }, body: "{}" });
  const api = () => createChallengeApi({ getDb: () => db, resolveUser: async () => ({ id: userId, email: "standard@example.test", role: "PLAYER", playerId, onboardingCompletedAt: new Date().toISOString() }) });
  async function offer(poolType: "DAILY" | "WEEKLY") {
    const state = await getActiveChallengeState(db, playerId, { random: () => 0.5 });
    const quest = (poolType === "DAILY" ? state.daily : state.weekly).quests[0];
    const stored = await db.playerQuest.findUniqueOrThrow({ where: { id: quest.id }, include: { questDefinition: true } });
    return { quest, definition: stored.questDefinition };
  }
  async function unchanged(id: string) {
    expect(await db.playerQuest.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "AVAILABLE", acceptedAt: null, currentProgress: 0 });
    expect(await db.playerQuestSkillSnapshot.count({ where: { playerQuestId: id } })).toBe(0);
    expect(await db.questInteraction.count({ where: { playerQuestId: id, interactionType: "ACCEPTED" } })).toBe(0);
    expect(await db.questReward.count({ where: { playerQuestId: id } })).toBe(0);
    expect(await db.xpTransaction.count({ where: { playerId } })).toBe(0);
    expect(await db.playerProgress.findUniqueOrThrow({ where: { playerId } })).toMatchObject({ overallXp: 0 });
    expect((await db.playerSkillProgress.findMany({ where: { playerId } })).every((s) => s.currentXp === 0 && s.lifetimeXp === 0)).toBe(true);
  }
  it.each(["DAILY", "WEEKLY"] as const)("accepts eligible %s content through the API", async (poolType) => {
    const { quest, definition } = await offer(poolType);
    expect((await api().mutate(request(), quest.id, "accept")).status).toBe(200);
    expect(await db.playerQuest.findUniqueOrThrow({ where: { id: quest.id } })).toMatchObject({ status: "ACCEPTED", baseXpSnapshot: definition.baseXp });
    expect(await db.playerQuestSkillSnapshot.count({ where: { playerQuestId: quest.id } })).toBeGreaterThan(0);
    expect(await db.xpTransaction.count({ where: { playerId } })).toBe(0);
  });
  const invalidCases = (["DAILY", "WEEKLY"] as const).flatMap((poolType) => ["retired", "unapproved", "wrong pool", "Legendary", "invalid skills", "invalid tags", "invalid XP", "empty title"].map((reason) => ({ poolType, reason })));
  it.each(invalidCases)("rejects stale $poolType acceptance after $reason without side effects", async ({ poolType, reason }) => {
    const { quest, definition } = await offer(poolType);
    if (reason === "retired") {
      const actor = await db.user.create({ data: { email: "a03-admin@example.test", role: "ADMIN" } });
      await transitionQuest(db, actor.id, definition.id, { action: "DEACTIVATE", expectedUpdatedAt: definition.updatedAt.toISOString() });
    } else if (reason === "invalid skills") {
      await db.questSkill.updateMany({ where: { questDefinitionId: definition.id }, data: { isPrimary: false } });
    } else if (reason === "invalid tags") {
      await db.questVarietyTag.updateMany({ where: { questDefinitionId: definition.id }, data: { isPrimary: false } });
    } else {
      await db.questDefinition.update({ where: { id: definition.id }, data: reason === "unapproved" ? { reviewStatus: "PENDING_REVIEW" } : reason === "wrong pool" ? { [poolType === "DAILY" ? "dailyEligible" : "weeklyEligible"]: false } : reason === "Legendary" ? { difficulty: "LEGENDARY", baseXp: 750, questFamilyId: null } : reason === "invalid XP" ? { baseXp: 1000 } : { title: " " } });
    }
    const response = await api().mutate(request(), quest.id, "accept");
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "OFFER_CHANGED", message: "This Challenge is no longer eligible for acceptance." } });
    await unchanged(quest.id);
  });
  it.each(["DAILY", "WEEKLY"] as const)("preserves %s accepted snapshots, retries and completion after retirement and edits", async (poolType) => {
    const { quest, definition } = await offer(poolType);
    await mutateActiveChallenge(db, playerId, quest.id, "accept");
    const before = await db.playerQuest.findUniqueOrThrow({ where: { id: quest.id }, include: { skillSnapshots: true } });
    await db.questDefinition.update({ where: { id: definition.id }, data: { active: false, reviewStatus: "PENDING_REVIEW", baseXp: 999, title: "Edited after acceptance", dailyEligible: false, weeklyEligible: false } });
    await mutateActiveChallenge(db, playerId, quest.id, "accept");
    expect(await db.playerQuest.findUniqueOrThrow({ where: { id: quest.id }, include: { skillSnapshots: true } })).toEqual(before);
    if (before.completionTypeSnapshot === "SINGLE") await mutateActiveChallenge(db, playerId, quest.id, "complete");
    else for (let i = 0; i < before.completionTargetSnapshot; i++) await mutateActiveChallenge(db, playerId, quest.id, "increment");
    expect(await db.questReward.findUniqueOrThrow({ where: { playerQuestId: quest.id } })).toMatchObject({ baseXp: before.baseXpSnapshot });
    expect(await db.playerQuest.findUniqueOrThrow({ where: { id: quest.id } })).toMatchObject({ status: "COMPLETED", titleSnapshot: before.titleSnapshot });
  });
  it("retains authentication and account isolation before eligibility validation", async () => {
    const { quest, definition } = await offer("DAILY");
    await db.questDefinition.update({ where: { id: definition.id }, data: { active: false } });
    const anonymous = createChallengeApi({ getDb: () => db, resolveUser: async () => null });
    expect((await anonymous.mutate(request(), quest.id, "accept")).status).toBe(401);
    const otherUser = await db.user.create({ data: { email: "a03-other@example.test" } });
    const other = await ensurePlayerForUser(db, otherUser.id);
    await completeOnboarding(db, otherUser.id, { timezone: "UTC", focus: focus() });
    await expect(mutateActiveChallenge(db, other.id, quest.id, "accept")).rejects.toMatchObject({ status: 404, code: "CHALLENGE_NOT_FOUND" });
    await unchanged(quest.id);
  });
  it("waits for an in-flight retirement and rejects acceptance after its commit", async () => {
    const { quest, definition } = await offer("DAILY");
    const writer = await pool.connect();
    let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
    try {
      await writer.query("BEGIN");
      await writer.query("UPDATE quest_definitions SET active = false WHERE id = $1", [definition.id]);
      pending = Promise.allSettled([mutateActiveChallenge(db, playerId, quest.id, "accept")]);
      await vi.waitFor(async () => {
        const locks = await pool.query("SELECT 1 FROM pg_locks WHERE relation = 'quest_definitions'::regclass AND mode = 'ShareLock' AND NOT granted");
        expect(locks.rowCount).toBeGreaterThan(0);
      }, { timeout: 5000 });
      await writer.query("COMMIT");
      expect(await pending).toMatchObject([{ status: "rejected", reason: { status: 409, code: "OFFER_CHANGED" } }]);
      await unchanged(quest.id);
    } finally { await writer.query("ROLLBACK"); writer.release(); await pending; }
  });
  it("serializes real curator retirement racing acceptance into a valid outcome", async () => {
    const { quest, definition } = await offer("WEEKLY");
    const actor = await db.user.create({ data: { email: "a03-race-admin@example.test", role: "ADMIN" } });
    const [acceptance, retirement] = await Promise.allSettled([
      mutateActiveChallenge(db, playerId, quest.id, "accept"),
      transitionQuest(db, actor.id, definition.id, { action: "DEACTIVATE", expectedUpdatedAt: definition.updatedAt.toISOString() }),
    ]);
    expect(retirement.status).toBe("fulfilled");
    if (acceptance.status === "rejected") { expect(acceptance.reason).toMatchObject({ status: 409, code: "OFFER_CHANGED" }); await unchanged(quest.id); }
    else {
      expect(await db.playerQuest.findUniqueOrThrow({ where: { id: quest.id } })).toMatchObject({ status: "ACCEPTED", baseXpSnapshot: definition.baseXp });
      expect(await db.questInteraction.count({ where: { playerQuestId: quest.id, interactionType: "ACCEPTED" } })).toBe(1);
    }
    expect(await db.questDefinition.findUniqueOrThrow({ where: { id: definition.id } })).toMatchObject({ active: false });
  });
});

describe("Phase 08 Challenge engine",()=>{
  const now=()=>new Date("2026-09-09T18:00:00Z");
  const finish=async(q:{id:string;completionType:string;target:number})=>{await mutateActiveChallenge(db,playerId,q.id,"accept",{now});if(q.completionType==="SINGLE")await mutateActiveChallenge(db,playerId,q.id,"complete",{now});else for(let i=0;i<q.target;i++)await mutateActiveChallenge(db,playerId,q.id,"increment",{now});};
  it("generates stable Daily/Weekly sets with unique Skills and no overlap under concurrency",async()=>{const states=await Promise.all([getActiveChallengeState(db,playerId,{now,random:()=>0.5}),getActiveChallengeState(db,playerId,{now,random:()=>0.1})]);expect(states[0]).toEqual(states[1]);expect(states[0].daily.quests).toHaveLength(3);expect(states[0].weekly.quests).toHaveLength(5);for(const set of [states[0].daily,states[0].weekly]){expect(new Set(set.quests.map(q=>q.primarySkill)).size).toBe(set.quests.length);expect(set.quests.every(q=>q.difficulty!=="LEGENDARY")).toBe(true);}const dailyIds=await db.playerQuest.findMany({where:{challengeSetId:states[0].daily.id},select:{questDefinitionId:true}});const weeklyIds=await db.playerQuest.findMany({where:{challengeSetId:states[0].weekly.id},select:{questDefinitionId:true}});expect(weeklyIds.some(w=>dailyIds.some(d=>d.questDefinitionId===w.questDefinitionId))).toBe(false);expect(await db.challengeSet.count({where:{playerId}})).toBe(2);});
  it("accepts immutably and completes SINGLE with Daily bonus, ledger, and Skill streak",async()=>{const state=await getActiveChallengeState(db,playerId,{now,random:()=>0.5});const q=state.daily.quests.find(x=>x.completionType==="SINGLE")!;await mutateActiveChallenge(db,playerId,q.id,"accept",{now});const accepted=await db.playerQuest.findUniqueOrThrow({where:{id:q.id},include:{skillSnapshots:true}});await db.questDefinition.update({where:{id:accepted.questDefinitionId},data:{baseXp:999,title:"edited"}});await mutateActiveChallenge(db,playerId,q.id,"complete",{now});const reward=await db.questReward.findUniqueOrThrow({where:{playerQuestId:q.id},include:{skillRewards:true}});expect(reward.baseXp).toBe(q.baseXp);expect(reward.challengeBonusXp).toBe(reward.skillRewards.reduce((n,r)=>n+percentRoundHalfUp(r.baseSkillXp,10),0));expect(await db.xpTransaction.count({where:{playerQuestId:q.id}})).toBe(1+reward.skillRewards.length*2);expect(await db.playerSkillStreak.count({where:{playerId,currentStreakDays:1}})).toBe(reward.skillRewards.length);});
  it("supports COUNT correction, no partial XP, atomic target completion, and immutability",async()=>{const state=await getActiveChallengeState(db,playerId,{now,random:()=>0.5});let q=[...state.daily.quests,...state.weekly.quests].find(x=>x.completionType==="COUNT");if(!q){const definition=await db.questDefinition.findFirstOrThrow({where:{completionType:"COUNT",weeklyEligible:true,active:true,reviewStatus:"APPROVED"}});const target=state.weekly.quests[0];await db.playerQuest.update({where:{id:target.id},data:{questDefinitionId:definition.id,difficultySnapshot:definition.difficulty,baseXpSnapshot:definition.baseXp,completionTypeSnapshot:"COUNT",completionTargetSnapshot:definition.completionTarget}});q={...target,completionType:"COUNT",target:definition.completionTarget,currentProgress:0};}await mutateActiveChallenge(db,playerId,q.id,"accept",{now});await mutateActiveChallenge(db,playerId,q.id,"decrement",{now});await mutateActiveChallenge(db,playerId,q.id,"increment",{now});expect(await db.questReward.count({where:{playerQuestId:q.id}})).toBe(0);await mutateActiveChallenge(db,playerId,q.id,"decrement",{now});const results=await Promise.allSettled(Array.from({length:q.target+1},()=>mutateActiveChallenge(db,playerId,q.id,"increment",{now})));expect(results.some(r=>r.status==="fulfilled")).toBe(true);expect(await db.questReward.count({where:{playerQuestId:q.id}})).toBe(1);expect((await db.playerQuest.findUniqueOrThrow({where:{id:q.id}})).currentProgress).toBe(q.target);await expect(mutateActiveChallenge(db,playerId,q.id,"decrement",{now})).rejects.toMatchObject({status:409});});
  it("expires unfinished challenges without penalty and generates rollover sets",async()=>{const old=await getActiveChallengeState(db,playerId,{now,random:()=>0.5});const later=()=>new Date("2026-09-10T18:00:00Z");const next=await getActiveChallengeState(db,playerId,{now:later,random:()=>0.5});expect(next.daily.id).not.toBe(old.daily.id);expect(await db.playerQuest.count({where:{challengeSetId:old.daily.id,status:"EXPIRED"}})).toBe(3);expect(await db.xpTransaction.count()).toBe(0);expect(await db.playerQuestFailurePenaltySkill.count()).toBe(0);});
  it("commits lazy expiration before rejecting late progress and enforces ownership",async()=>{const state=await getActiveChallengeState(db,playerId,{now,random:()=>0.5});const q=state.daily.quests[0];await mutateActiveChallenge(db,playerId,q.id,"accept",{now});await expect(mutateActiveChallenge(db,playerId,q.id,q.completionType==="SINGLE"?"complete":"increment",{now:()=>new Date("2026-09-10T18:00:00Z")})).rejects.toMatchObject({code:"CHALLENGE_EXPIRED"});expect(await db.playerQuest.findUniqueOrThrow({where:{id:q.id}})).toMatchObject({status:"EXPIRED",failurePenaltyXp:null});const otherUser=await db.user.create({data:{email:"challenge-other@example.test"}});const other=await ensurePlayerForUser(db,otherUser.id);await completeOnboarding(db,otherUser.id,{timezone:"UTC",focus:focus()});await expect(mutateActiveChallenge(db,other.id,q.id,"accept",{now})).rejects.toMatchObject({status:404});});
  it("awards Daily and Weekly set bonuses once and Overall-only",async()=>{const state=await getActiveChallengeState(db,playerId,{now,random:()=>0.5});for(const q of state.daily.quests)await finish(q);for(const q of state.weekly.quests)await finish(q);const sets=await db.challengeSet.findMany({where:{playerId}});expect(sets.every(s=>s.setBonusAwardedAt)).toBe(true);expect(await db.xpTransaction.count({where:{transactionType:"DAILY_SET_BONUS",xpScope:"OVERALL",skillId:null,amount:100}})).toBe(1);expect(await db.xpTransaction.count({where:{transactionType:"WEEKLY_SET_BONUS",xpScope:"OVERALL",skillId:null,amount:300}})).toBe(1);expect(await db.xpTransaction.count({where:{transactionType:{in:["DAILY_SET_BONUS","WEEKLY_SET_BONUS"]},skillId:{not:null}}})).toBe(0);});
});

describe("Phase 11 scheduled reconciliation", () => {
  it("reconciles Standard and Challenge state idempotently without XP or streak mutation", async () => {
    const now = () => new Date("2026-09-09T18:00:00Z");
    const overdue = new Date("2026-09-10T19:00:00Z");
    const standard = await fixtureOffer("F-WALK-01");
    await mutateStandardQuest(db, playerId, standard.q.id, "accept", {}, { now });
    // Recommendation reads also reconcile expiration: keep all setup calls on
    // the same clock so the scheduled job performs the first expiration.
    await requireRecommendation(db, playerId, () => 0.5, now);
    await getActiveChallengeState(db, playerId, { now, random: () => 0.5 });
    expect(await db.playerQuest.findUniqueOrThrow({ where: { id: standard.q.id } })).toMatchObject({ status: "ACCEPTED", deadlineAt: new Date("2026-09-10T18:00:00Z"), expiredAt: null });
    const progressBefore = await db.playerSkillProgress.findMany({ where: { playerId }, orderBy: { skillId: "asc" } });
    const streaksBefore = await db.playerSkillStreak.findMany({ where: { playerId }, orderBy: { skillId: "asc" } });
    const first = await runGameStateReconciliation(db, { now: overdue, batchSize: 1, random: () => 0.5 });
    expect(first).toMatchObject({ candidatesScanned: 1, playersProcessed: 1, standardQuestsExpired: 1, challengeQuestsExpired: 3, challengeSetsCreated: 1, staleRecommendationsInvalidated: 1, failures: [] });
    expect(await db.playerQuest.findUniqueOrThrow({ where: { id: standard.q.id } })).toMatchObject({ status: "EXPIRED", failurePenaltyAppliedAt: null, clearedAt: null });
    expect(await db.playerQuestSlot.findUniqueOrThrow({ where: { id: standard.slot.id } })).toMatchObject({ currentPlayerQuestId: standard.q.id });
    expect(await db.xpTransaction.count({ where: { playerId } })).toBe(0);
    expect(await db.playerSkillProgress.findMany({ where: { playerId }, orderBy: { skillId: "asc" } })).toEqual(progressBefore);
    expect(await db.playerSkillStreak.findMany({ where: { playerId }, orderBy: { skillId: "asc" } })).toEqual(streaksBefore);
    const second = await runGameStateReconciliation(db, { now: overdue, batchSize: 1, random: () => 0.5 });
    expect(second).toMatchObject({ standardQuestsExpired: 0, challengeQuestsExpired: 0, challengeSetsCreated: 0, staleRecommendationsInvalidated: 0, failures: [] });
  });

  it("converges safely when two workers overlap", async () => {
    await getActiveChallengeState(db, playerId, { now: () => new Date("2026-09-09T18:00:00Z"), random: () => 0.5 });
    const results = await Promise.all([runGameStateReconciliation(db, { now: new Date("2026-09-10T18:00:00Z"), random: () => 0.5 }), runGameStateReconciliation(db, { now: new Date("2026-09-10T18:00:00Z"), random: () => 0.5 })]);
    expect(results.reduce((sum, result) => sum + result.challengeQuestsExpired, 0)).toBe(3);
    expect(await db.challengeSet.count({ where: { playerId, poolType: "DAILY" } })).toBe(2);
    expect(await db.challengeSet.count({ where: { playerId, poolType: "WEEKLY" } })).toBe(1);
    expect(await db.xpTransaction.count({ where: { playerId } })).toBe(0);
  });

  it("converges in both job-first and lazy-first orders", async () => {
    const first = await fixtureOffer("F-WALK-01"); await action(first.q.id, "accept");
    await db.playerQuest.update({ where: { id: first.q.id }, data: { deadlineAt: new Date("2026-09-10T00:00:00Z") } });
    const at = new Date("2026-09-10T18:00:00Z");
    expect((await runGameStateReconciliation(db, { now: at, random: () => 0.5 })).standardQuestsExpired).toBe(1);
    await reconcileStandardQuestSlots(db, playerId, () => 0.5, () => at);
    expect((await db.playerQuest.findUniqueOrThrow({ where: { id: first.q.id } })).status).toBe("EXPIRED");

    const second = await fixtureOfferInSlot("F-MOB-01", 2); await action(second.q.id, "accept");
    await db.playerQuest.update({ where: { id: second.q.id }, data: { deadlineAt: new Date("2026-09-10T00:00:00Z") } });
    await reconcileStandardQuestSlots(db, playerId, () => 0.5, () => at);
    expect((await runGameStateReconciliation(db, { now: at, random: () => 0.5 })).standardQuestsExpired).toBe(0);
    expect((await db.playerQuest.findUniqueOrThrow({ where: { id: second.q.id } })).status).toBe("EXPIRED");
    expect(await db.questInteraction.count({ where: { playerQuestId: { in: [first.q.id, second.q.id] }, interactionType: "EXPIRED" } })).toBe(2);
  });
});

describe("Home recommendations", () => {
  it.each([false, true])("returns an empty API state with all 24 slots occupied and recovers after resolution (expired: %s)", async (expired) => {
    const slots = flat(await read());
    expect(slots).toHaveLength(24);
    await requireRecommendation(db, playerId);
    for (const slot of slots) await action(slot.quest.id, "accept");
    if (expired) await db.playerQuest.updateMany({ where: { playerId, status: "ACCEPTED" }, data: { deadlineAt: new Date(Date.now() - 1000) } });
    const api = createRecommendationApi({ getDb: () => db, resolveUser: async () => ({ id: userId, email: "standard@example.test", role: "PLAYER", playerId, onboardingCompletedAt: new Date().toISOString() }) });
    const response = await api.get();
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
    expect(await getHomeRecommendation(db, playerId)).toBeNull();
    expect(await db.playerQuest.count({ where: { playerId, status: expired ? "EXPIRED" : "ACCEPTED" } })).toBe(24);
    expect(await db.xpTransaction.count({ where: { playerId } })).toBe(0);
    expect((await db.playerRecommendation.findUniqueOrThrow({ where: { playerId } })).invalidatedAt).not.toBeNull();
    const result = await resolveStandardQuest(db, playerId, slots[0].quest.id, expired ? "clear" : "complete", { random: () => 0.5 });
    if (!expired) expect(result.overallXp).toBeGreaterThan(0);
    const recovered = await requireRecommendation(db, playerId);
    expect(recovered.playerQuestId).not.toBe(slots[0].quest.id);
    expect(flat(result).find((slot) => slot.id === recovered.slotId)?.quest.status).toBe("AVAILABLE");
  });

  it("preserves actual library failures instead of treating them as empty recommendations", async () => {
    await db.questDefinition.updateMany({ data: { active: false } });
    await expect(getHomeRecommendation(db, playerId)).rejects.toMatchObject({ code: "NO_STANDARD_CANDIDATE" });
  });

  it("persists one recommendation from existing AVAILABLE slots without changing progression", async () => {
    const state = await read(); const existing = new Set(flat(state).map((s) => s.quest.id));
    const first = await requireRecommendation(db, playerId, () => 0.5); const second = await requireRecommendation(db, playerId, () => 0.99);
    expect(second).toEqual(first); expect(existing.has(first.playerQuestId)).toBe(true);
    expect(await db.playerRecommendation.count({ where: { playerId } })).toBe(1);
    expect(await db.playerQuest.count({ where: { playerId } })).toBe(24);
    expect(await db.xpTransaction.count({ where: { playerId } })).toBe(0);
    expect(await db.playerProgress.findUniqueOrThrow({ where: { playerId } })).toMatchObject({ overallXp: 0, overallLevel: 1 });
  });
  it("serializes concurrent generation and isolates ownership", async () => {
    await read(); const results = await Promise.all([0, 1, 2].map(() => requireRecommendation(db, playerId, () => 0.5)));
    expect(new Set(results.map((r) => r.playerQuestId)).size).toBe(1); expect(await db.playerRecommendation.count({ where: { playerId } })).toBe(1);
    const otherUser = await db.user.create({ data: { email: "recommendation-other@example.test" } }); const other = await ensurePlayerForUser(db, otherUser.id); await completeOnboarding(db, otherUser.id, { timezone: "UTC", focus: focus() });
    const theirs = await requireRecommendation(db, other.id, () => 0.5); expect(theirs.playerQuestId).not.toBe(results[0].playerQuestId);
    expect((await db.playerQuest.findUniqueOrThrow({ where: { id: theirs.playerQuestId } })).playerId).toBe(other.id);
  });
  it("invalidates on Focus change and target mutation, then recalculates", async () => {
    await read(); const original = await requireRecommendation(db, playerId, () => 0.5); const changed = focus(); changed[0].points--; changed[7].points++;
    await respecFocus(db, userId, { focus: changed }); expect((await db.playerRecommendation.findUniqueOrThrow({ where: { playerId } })).invalidatedAt).not.toBeNull();
    await requireRecommendation(db, playerId, () => 0.5); await mutateStandardQuest(db, playerId, original.playerQuestId, "reroll", {}, { random: () => 0.5 });
    const next = await requireRecommendation(db, playerId, () => 0.5); expect(next.playerQuestId).not.toBe(original.playerQuestId);
  });
  it("serializes generation racing a target reroll without retaining a stale target", async () => {
    await read(); const original = await requireRecommendation(db, playerId, () => 0.5);
    await Promise.all([requireRecommendation(db, playerId, () => 0.1), mutateStandardQuest(db, playerId, original.playerQuestId, "reroll", {}, { random: () => 0.5 })]);
    const final = await requireRecommendation(db, playerId, () => 0.5); const quest = await db.playerQuest.findUniqueOrThrow({ where: { id: final.playerQuestId } });
    expect(final.playerQuestId).not.toBe(original.playerQuestId); expect(quest).toMatchObject({ playerId, status: "AVAILABLE", poolType: "STANDARD" });
    expect(await db.playerRecommendation.count({ where: { playerId } })).toBe(1);
  });
  it("refreshes to a different persisted existing slot without changing assignments", async () => {
    const state = await read(); const before = flat(state).map((slot) => [slot.id, slot.quest.id]);
    const original = await requireRecommendation(db, playerId, () => 0.5);
    const different = await requireRecommendation(db, playerId, () => 0.5, () => new Date(), original.playerQuestId);
    expect(different.playerQuestId).not.toBe(original.playerQuestId); expect(different.differentAvailable).toBe(true);
    expect((await db.playerRecommendation.findUniqueOrThrow({ where: { playerId } })).playerQuestId).toBe(different.playerQuestId);
    expect(flat(await read()).map((slot) => [slot.id, slot.quest.id])).toEqual(before);
    expect(await db.playerQuest.count({ where: { playerId } })).toBe(24);
  });
  it("serializes repeated refreshes and rejects the stale displayed recommendation", async () => {
    await read(); const original = await requireRecommendation(db, playerId, () => 0.5);
    const results = await Promise.allSettled([requireRecommendation(db, playerId, () => 0.1, () => new Date(), original.playerQuestId), requireRecommendation(db, playerId, () => 0.9, () => new Date(), original.playerQuestId)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "STALE_RECOMMENDATION" } });
    const persisted = await db.playerRecommendation.findUniqueOrThrow({ where: { playerId } });
    expect(persisted.playerQuestId).not.toBe(original.playerQuestId); expect(persisted.invalidatedAt).toBeNull();
  });
  it("retains the only available recommendation and reports no alternative", async () => {
    const initial = flat(await read());
    for (const slot of initial.slice(0, -1)) await mutateStandardQuest(db, playerId, slot.quest.id, "accept");
    const only = await requireRecommendation(db, playerId, () => 0.5);
    const result = await requireRecommendation(db, playerId, () => 0.5, () => new Date(), only.playerQuestId);
    expect(result).toMatchObject({ playerQuestId: only.playerQuestId, differentAvailable: false });
  });
  it("accepts the exact recommendation through the existing Standard service and invalidates it", async () => {
    await read(); const recommended = await requireRecommendation(db, playerId, () => 0.5); const at = new Date("2026-09-09T12:00:00Z");
    const result = await mutateStandardQuest(db, playerId, recommended.playerQuestId, "accept", {}, { now: () => at });
    const accepted = flat(result).find((slot) => slot.quest.id === recommended.playerQuestId)!.quest;
    expect(accepted).toMatchObject({ status: "ACCEPTED", acceptedAt: at.toISOString() }); expect(new Date(accepted.deadlineAt!).getTime()).toBeGreaterThan(at.getTime());
    expect((await db.playerRecommendation.findUniqueOrThrow({ where: { playerId } })).invalidatedAt).not.toBeNull();
  });
});

async function fixtureOfferInSlot(key: string, slotNumber: number) {
  await read();
  const d = await db.questDefinition.findUniqueOrThrow({ where: { stableKey: key }, include: definitionInclude });
  const skillId = d.skills.find((s) => s.isPrimary)!.skillId;
  // Only test-owned fixture state is changed, before exercising production operations.
  const slot = await db.playerQuestSlot.findFirstOrThrow({ where: { playerId, skillId, slotNumber } });
  const existing = await db.playerQuestSlot.findFirst({ where: { playerId, currentPlayerQuest: { questDefinitionId: d.id } } });
  if (existing && existing.id !== slot.id) await db.playerQuestSlot.update({ where: { id: existing.id }, data: { currentPlayerQuestId: null } });
  const q = await db.playerQuest.create({ data: { playerId, questDefinitionId: d.id, poolType: "STANDARD", status: "AVAILABLE", ...previewSnapshots(d) } });
  await db.playerQuestSlot.update({ where: { id: slot.id }, data: { currentPlayerQuestId: q.id } });
  await read();
  return { q, d, slot };
}
const fixtureOffer = (key: string) => fixtureOfferInSlot(key, 1);
async function familyKey(family: string, difficulty: "EASY" | "MEDIUM" | "HARD" | "EPIC") {
  return (await db.questDefinition.findFirstOrThrow({ where: { family: { stableKey: family }, difficulty } })).stableKey;
}
async function invariant() {
  const slots = await db.playerQuestSlot.findMany({ where: { playerId }, include: { currentPlayerQuest: true } });
  expect(slots).toHaveLength(24);
  expect(new Set(slots.map((s) => s.currentPlayerQuest?.questDefinitionId)).size).toBe(24);
  expect(slots.every((s) => s.currentPlayerQuest?.playerId === playerId && s.currentPlayerQuest.poolType === "STANDARD")).toBe(true);
  expect(await db.questReward.count()).toBe(0); expect(await db.xpTransaction.count()).toBe(0);
  expect(await db.playerProgress.findUnique({ where: { playerId } })).toMatchObject({ overallXp: 0, overallLevel: 1 });
}

describe("Standard bootstrap and reconciliation", () => {
  it("creates exactly 24 persistent primary-matching offers under concurrent first access", async () => {
    const states = await Promise.all([read(), read(), read()]);
    expect(states[0]).toEqual(states[1]); expect(states[1]).toEqual(states[2]);
    expect(states[0].skills.every((s) => s.slots.length === 3 && s.slots.every((x) => x.quest.skills.find((a) => a.isPrimary)?.skillCode === s.code && x.quest.deadlineAt === null))).toBe(true);
    expect(await db.playerQuest.count()).toBe(24);
    expect(await db.questInteraction.count({ where: { interactionType: "SHOWN" } })).toBe(24);
    await invariant();
  });
  it("ensures missing slots only and rejects incomplete/missing seed state", async () => {
    const before = flat(await read());
    await db.playerQuestSlot.delete({ where: { id: before[0].id } });
    expect(await ensureStandardQuestSlots(db, playerId)).toHaveLength(24);
    const after = flat(await read());
    expect(after.slice(1)).toEqual(before.slice(1));
    await db.player.update({ where: { id: playerId }, data: { onboardingCompletedAt: null } });
    await expect(read()).rejects.toMatchObject({ code: "ONBOARDING_INTEGRITY" });
    await db.skill.update({ where: { code: "H" }, data: { active: false } });
    await expect(read()).rejects.toMatchObject({ code: "SEED_REQUIRED" });
  });
  it.each(["inactive", "unapproved", "ineligible", "allocation"])("replaces %s AVAILABLE content and preserves history", async (kind) => {
    const before = flat(await read())[0];
    if (kind === "allocation") await db.questSkill.updateMany({ where: { questDefinitionId: before.quest.definitionId }, data: { rewardPercent: 1 } });
    else await db.questDefinition.update({ where: { id: before.quest.definitionId }, data: kind === "inactive" ? { active: false } : kind === "unapproved" ? { reviewStatus: "DRAFT" } : { standardEligible: false } });
    const after = flat(await read())[0];
    expect(after.id).toBe(before.id); expect(after.quest.id).not.toBe(before.quest.id);
    expect(await db.playerQuest.findUnique({ where: { id: before.quest.id } })).toMatchObject({ status: "REROLLED" });
    expect(await read()).toEqual(await read()); await invariant();
  });
  it("preserves active ACCEPTED and EXPIRED blockers and repairs terminal pointers", async () => {
    const before = flat(await read());
    await mutateStandardQuest(db, playerId, before[0].quest.id, "accept", {}, { now: () => new Date("2099-01-01T12:00:00Z") });
    await action(before[1].quest.id, "accept");
    await db.playerQuest.update({ where: { id: before[1].quest.id }, data: { status: "EXPIRED", expiredAt: new Date() } });
    await db.questDefinition.update({ where: { id: before[0].quest.definitionId }, data: { active: false } });
    await db.playerQuest.update({ where: { id: before[2].quest.id }, data: { status: "REROLLED" } });
    const after = flat(await read());
    expect(after[0].quest).toMatchObject({ id: before[0].quest.id, status: "ACCEPTED" });
    expect(after[1].quest).toMatchObject({ id: before[1].quest.id, status: "EXPIRED" });
    expect(after[2].quest.id).not.toBe(before[2].quest.id); await invariant();
  });
  it("rolls back the entire population if any Skill has no eligible content", async () => {
    await db.questDefinition.updateMany({ where: { skills: { some: { skill: { code: "H" }, isPrimary: true } } }, data: { active: false } });
    await expect(read()).rejects.toMatchObject({ code: "NO_STANDARD_CANDIDATE" });
    expect(await db.playerQuestSlot.count()).toBe(0); expect(await db.playerQuest.count()).toBe(0);
  });
  it("leaves all assignments unchanged after Focus respec", async () => {
    const before = await read(); const changed = focus(); changed[0].points--; changed[7].points++;
    await respecFocus(db, userId, { focus: changed }); expect(await read()).toEqual(before);
  });
});

describe("Standard acceptance", () => {
  it.each([24, 48, 72])("snapshots current values and exact %i-hour deadline once under concurrency", async (hours) => {
    const before = flat(await read())[0];
    await db.questDefinition.update({ where: { id: before.quest.definitionId }, data: { completionWindowHours: hours, completionType: "COUNT", completionTarget: 3 } });
    const now = new Date("2026-11-01T07:37:00Z"); // crosses a Denver DST boundary
    await Promise.all([0, 1].map(() => mutateStandardQuest(db, playerId, before.quest.id, "accept", {}, { now: () => now })));
    const q = await db.playerQuest.findUniqueOrThrow({ where: { id: before.quest.id }, include: { skillSnapshots: true } });
    expect(q).toMatchObject({ status: "ACCEPTED", acceptedAt: now, deadlineAt: new Date(now.getTime() + hours * 3_600_000), completionWindowHoursSnapshot: hours, completionTypeSnapshot: "COUNT", completionTargetSnapshot: 3, currentProgress: 0 });
    expect(q.skillSnapshots.reduce((n, s) => n + s.rewardPercent, 0)).toBe(100);
    expect(await db.questInteraction.count({ where: { playerQuestId: q.id, interactionType: "ACCEPTED" } })).toBe(1);
    await db.questDefinition.update({ where: { id: q.questDefinitionId }, data: { baseXp: 999, difficulty: "LEGENDARY", active: false, title: "Changed after acceptance", shortDescription: "Different instructions", estimatedMinutes: 999 } });
    const after = flat(await read())[0].quest;
    expect(after.baseXp).toBe(q.baseXpSnapshot); expect(after.difficulty).toBe(q.difficultySnapshot);
    expect(after.title).toBe(q.titleSnapshot); expect(after.description).toBe(q.descriptionSnapshot); expect(after.estimatedMinutes).toBe(q.estimatedMinutesSnapshot);
    await expect(action(q.id, "reroll")).rejects.toMatchObject({ status: 409 });
    await expect(action(q.id, "bump")).rejects.toMatchObject({ status: 409 }); await invariant();
  });
  it("rolls back snapshots and acceptance on a late interaction failure", async () => {
    const before = flat(await read())[0];
    await pool.query("ALTER TABLE quest_interactions ADD CONSTRAINT test_reject_accept CHECK (interaction_type <> 'ACCEPTED')");
    try { await expect(action(before.quest.id, "accept")).rejects.toThrow(); }
    finally { await pool.query("ALTER TABLE quest_interactions DROP CONSTRAINT test_reject_accept"); }
    expect(await db.playerQuestSkillSnapshot.count()).toBe(0);
    expect(await db.playerQuest.findUnique({ where: { id: before.quest.id } })).toMatchObject({ status: "AVAILABLE", deadlineAt: null });
  });
});

describe("Standard replacement", () => {
  it.each([null, "TOO_HARD", "NO_TIME", "NOT_INTERESTED", "JUST_DIFFERENT"])("rerolls atomically and stores optional feedback %s", async (feedbackReason) => {
    const before = flat(await read())[0];
    const after = flat(await action(before.quest.id, "reroll", { feedbackReason }))[0];
    expect(after.id).toBe(before.id); expect(after.quest.definitionId).not.toBe(before.quest.definitionId);
    expect(after.quest).toMatchObject({ status: "AVAILABLE", acceptedAt: null, deadlineAt: null });
    expect(await db.playerQuest.findUnique({ where: { id: before.quest.id } })).toMatchObject({ status: "REROLLED" });
    const interaction = await db.questInteraction.findFirstOrThrow({ where: { playerQuestId: before.quest.id, interactionType: "REROLLED" } });
    expect(interaction.feedbackReason).toBe(feedbackReason);
    expect(await db.questInteraction.count({ where: { operationId: interaction.operationId } })).toBe(2); await invariant();
  });
  it.each([["accept", "reroll"], ["reroll", "reroll"], ["bump", "bump"], ["reroll", "bump"]] as const)("serializes %s versus %s", async (a, b) => {
    const { q } = await fixtureOffer(await familyKey("WALK_TIME", "EASY"));
    const results = await Promise.allSettled([action(q.id, a), action(q.id, b)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1); await invariant();
  });
  it("rolls back old status and replacement if slot update fails", async () => {
    const before = flat(await read())[0];
    await pool.query(`CREATE FUNCTION reject_slot_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$`);
    await pool.query("CREATE TRIGGER reject_slot_update BEFORE UPDATE ON player_quest_slots FOR EACH ROW EXECUTE FUNCTION reject_slot_update()");
    try { await expect(action(before.quest.id, "reroll")).rejects.toThrow(); }
    finally { await pool.query("DROP TRIGGER reject_slot_update ON player_quest_slots"); await pool.query("DROP FUNCTION reject_slot_update()"); }
    expect(await db.playerQuest.count()).toBe(24); expect(flat(await read())[0]).toEqual(before);
  });
  it("bumps WALK_TIME Easy to Medium to Hard, then stops", async () => {
    const { q, d } = await fixtureOffer(await familyKey("WALK_TIME", "EASY"));
    // Free other family tiers if initial random fixtures occupy them.
    const siblings = await db.playerQuestSlot.findMany({ where: { playerId, currentPlayerQuest: { questDefinition: { questFamilyId: d.questFamilyId }, id: { not: q.id } } } });
    for (const slot of siblings) await action(slot.currentPlayerQuestId!, "reroll");
    const bumped = flat(await action(q.id, "bump"));
    const current = await db.playerQuestSlot.findFirstOrThrow({ where: { playerId, currentPlayerQuest: { questDefinition: { questFamilyId: d.questFamilyId, difficulty: "MEDIUM" } } } });
    expect(bumped.find((s) => s.id === current.id)?.quest).toMatchObject({ status: "AVAILABLE", difficulty: "MEDIUM" });
    const hardState = await action(current.currentPlayerQuestId!, "bump");
    const hard = flat(hardState).find((s) => s.id === current.id)!;
    expect(hard.quest.difficulty).toBe("HARD"); expect(hard.quest.nextDifficulty).toBeNull();
    await expect(action(hard.quest.id, "bump")).rejects.toMatchObject({ code: "NO_HIGHER_TIER" });
    expect(await db.questInteraction.count({ where: { interactionType: "UPGRADED" } })).toBe(2); await invariant();
  });
  it.each(["inactive", "unapproved", "occupied", "missing"])("skips %s intermediate STRENGTH_WORKOUT tier", async (kind) => {
    const { q, d, slot: originalSlot } = await fixtureOffer(await familyKey("STRENGTH_WORKOUT", "EASY"));
    const medium = await db.questDefinition.findFirstOrThrow({ where: { questFamilyId: d.questFamilyId, difficulty: "MEDIUM" } });
    if (kind === "occupied") {
      const targetSlot = await db.playerQuestSlot.findFirstOrThrow({ where: { playerId, skillId: d.skills.find((s) => s.isPrimary)!.skillId, slotNumber: 2 } });
      const offer = await db.playerQuest.create({ data: { playerId, questDefinitionId: medium.id, poolType: "STANDARD", ...previewSnapshots({ ...d, ...medium }) } });
      const prior = await db.playerQuestSlot.findFirst({ where: { playerId, currentPlayerQuest: { questDefinitionId: medium.id } } });
      if (prior && prior.id !== targetSlot.id) await db.playerQuestSlot.update({ where: { id: prior.id }, data: { currentPlayerQuestId: null } });
      await db.playerQuestSlot.update({ where: { id: targetSlot.id }, data: { currentPlayerQuestId: offer.id } });
      await read();
    } else await db.questDefinition.update({ where: { id: medium.id }, data: kind === "inactive" ? { active: false } : kind === "missing" ? { questFamilyId: null } : { reviewStatus: "DRAFT" } });
    const result = await action(q.id, "bump");
    const replacement = flat(result).find((s) => s.id === originalSlot.id)!;
    expect(["HARD", "EPIC"]).toContain(replacement.quest.difficulty);
    expect(replacement.quest.status).toBe("AVAILABLE");
    expect(await db.questDefinition.findUnique({ where: { id: replacement.quest.definitionId } })).toMatchObject({ questFamilyId: d.questFamilyId });
    const upgraded = await db.questInteraction.findFirstOrThrow({ where: { interactionType: "UPGRADED", playerQuestId: q.id } });
    expect(upgraded.feedbackReason).toBeNull(); await invariant();
  });
});

describe("Standard REST", () => {
  const principal = async () => ({ id: userId, email: "standard@example.test", role: "PLAYER" as const, playerId, onboardingCompletedAt: new Date().toISOString() });
  const api = createStandardApi({ getDb: () => db, resolveUser: principal });
  const req = (body = {}, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/quests/standard", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  it("returns the existing expired completion response after committing expiration", async () => {
    const { q } = await fixtureOffer("F-WALK-01");
    await mutateStandardQuest(db, playerId, q.id, "accept", {}, { now: () => new Date(Date.now() - 7 * 86_400_000) });
    const response = await api.resolve(req(), q.id, "complete");
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "QUEST_EXPIRED", message: "This quest expired and must be cleared without a reward." } });
    expect(await db.playerQuest.findUniqueOrThrow({ where: { id: q.id } })).toMatchObject({ status: "EXPIRED", expiredAt: expect.any(Date), failurePenaltyAppliedAt: null });
    expect(await db.playerQuestFailurePenaltySkill.count({ where: { playerQuestId: q.id } })).toBe(1);
    expect(await db.questReward.count({ where: { playerQuestId: q.id } })).toBe(0);
    expect(await db.xpTransaction.count({ where: { playerQuestId: q.id } })).toBe(0);
  });

  it("guards identity/onboarding, rejects forged inputs and returns stable state", async () => {
    const anonymous = createStandardApi({ getDb: () => db, resolveUser: async () => null });
    expect((await anonymous.get()).status).toBe(401); expect((await anonymous.mutate(req(), randomUUID(), "accept")).status).toBe(401);
    const incomplete = createStandardApi({ getDb: () => db, resolveUser: async () => ({ ...await principal(), onboardingCompletedAt: null }) });
    expect((await incomplete.get()).status).toBe(409);
    const state = await (await api.get()).json() as StandardState;
    expect(await (await api.get()).json()).toEqual(state);
    const id = flat(state)[0].quest.id;
    expect((await api.mutate(req({ playerId: randomUUID() }), id, "accept")).status).toBe(400);
    expect((await api.mutate(req({ feedbackReason: "BAD" }), id, "reroll")).status).toBe(400);
    expect((await api.mutate(req({}, "https://attacker.example"), id, "accept")).status).toBe(403);
    expect((await api.mutate(req(), randomUUID(), "accept")).status).toBe(404);
    const otherUser = await db.user.create({ data: { email: "other@example.test" } });
    const otherPlayer = await ensurePlayerForUser(db, otherUser.id);
    await completeOnboarding(db, otherUser.id, { timezone: "UTC", focus: focus() });
    const other = createStandardApi({ getDb: () => db, resolveUser: async () => ({ ...await principal(), id: otherUser.id, playerId: otherPlayer.id }) });
    expect((await other.mutate(req(), id, "accept")).status).toBe(404);
    expect((await api.mutate(req(), id, "accept")).status).toBe(200);
    expect((await api.mutate(req(), id, "reroll")).status).toBe(409);
    expect((await api.mutate(req(), id, "bump")).status).toBe(409);
  });
  it("exposes authenticated recommendation refresh with strict input and ownership", async () => {
    const recommendationApi = createRecommendationApi({ getDb: () => db, resolveUser: principal });
    await read(); const current = await requireRecommendation(db, playerId, () => 0.5);
    expect((await recommendationApi.refresh(req({ playerQuestId: current.playerQuestId }))).status).toBe(200);
    expect((await recommendationApi.refresh(req({ playerQuestId: current.playerQuestId, playerId }))).status).toBe(400);
    expect((await recommendationApi.refresh(req({ playerQuestId: current.playerQuestId }, "https://attacker.example"))).status).toBe(403);
    const anonymous = createRecommendationApi({ getDb: () => db, resolveUser: async () => null });
    expect((await anonymous.refresh(req({ playerQuestId: current.playerQuestId }))).status).toBe(401);
  });
});

describe("Standard Phase 05 resolution", () => {
  const at = (value: string) => () => new Date(value);
  it.each(["F-WALK-01", "F-WALK-04"])("persists late completion expiration before rejecting, and clears its penalty only once (%s)", async (key) => {
    const { q, d, slot } = await fixtureOffer(key);
    await db.playerSkillProgress.updateMany({ where: { playerId }, data: { currentXp: 100, lifetimeXp: 100 } });
    await db.playerProgress.update({ where: { playerId }, data: { overallXp: 800 } });
    await mutateStandardQuest(db, playerId, q.id, "accept", {}, { now: at("2026-09-06T12:00:00Z") });
    const accepted = await db.playerQuest.findUniqueOrThrow({ where: { id: q.id } });
    const overdue = new Date(accepted.deadlineAt!.getTime() + 1);
    const penalty = percentRoundHalfUp(accepted.baseXpSnapshot, gameConfig.quests.failurePenaltyPercent);
    const overallBefore = await db.playerProgress.findUniqueOrThrow({ where: { playerId } });
    const skillsBefore = await db.playerSkillProgress.findMany({ where: { playerId }, orderBy: { skillId: "asc" } });
    const streaksBefore = await db.playerSkillStreak.findMany({ where: { playerId }, orderBy: { skillId: "asc" } });

    // No Home read or reconciliation job between the rejected request and these
    // direct database reads: the rejected completion itself must commit expiry.
    for (const delay of [0, 1000]) {
      await expect(resolveStandardQuest(db, playerId, q.id, "complete", { now: () => new Date(overdue.getTime() + delay) })).rejects.toMatchObject({
        status: 409, code: "QUEST_EXPIRED", message: "This quest expired and must be cleared without a reward.",
      });
      const expired = await db.playerQuest.findUniqueOrThrow({ where: { id: q.id }, include: { failurePenaltySkills: true } });
      expect(expired).toMatchObject({ status: "EXPIRED", expiredAt: overdue, failurePenaltyXp: penalty, failurePenaltyAppliedAt: null, clearedAt: null, completedAt: null });
      expect(expired.failurePenaltySkills).toHaveLength(d.skills.length);
      expect(expired.failurePenaltySkills.reduce((sum, detail) => sum + detail.intendedPenaltyXp, 0)).toBe(penalty);
      expect(expired.failurePenaltySkills.every((detail) => detail.actualAppliedPenaltyXp === null)).toBe(true);
      expect(await db.playerQuestSlot.findUniqueOrThrow({ where: { id: slot.id } })).toMatchObject({ currentPlayerQuestId: q.id });
      expect(await db.questInteraction.count({ where: { playerQuestId: q.id, interactionType: "EXPIRED" } })).toBe(1);
      expect(await db.questReward.count({ where: { playerQuestId: q.id } })).toBe(0);
      expect(await db.xpTransaction.count({ where: { playerQuestId: q.id } })).toBe(0);
      expect(await db.playerProgress.findUniqueOrThrow({ where: { playerId } })).toEqual(overallBefore);
      expect(await db.playerSkillProgress.findMany({ where: { playerId }, orderBy: { skillId: "asc" } })).toEqual(skillsBefore);
      expect(await db.playerSkillStreak.findMany({ where: { playerId }, orderBy: { skillId: "asc" } })).toEqual(streaksBefore);
    }

    const clearedAt = new Date(overdue.getTime() + 2000);
    await resolveStandardQuest(db, playerId, q.id, "clear", { now: () => clearedAt, random: () => 0.5 });
    const cleared = await db.playerQuest.findUniqueOrThrow({ where: { id: q.id }, include: { failurePenaltySkills: true } });
    expect(cleared).toMatchObject({ status: "EXPIRED", expiredAt: overdue, clearedAt, failurePenaltyAppliedAt: clearedAt });
    const skillsAfter = await db.playerSkillProgress.findMany({ where: { playerId }, orderBy: { skillId: "asc" } });
    for (const skill of skillsAfter) {
      const detail = cleared.failurePenaltySkills.find((item) => item.skillId === skill.skillId);
      const applied = Math.min(100, detail?.intendedPenaltyXp ?? 0);
      expect(skill).toMatchObject({ currentXp: 100 - applied, lifetimeXp: 100 });
      if (detail) expect(detail.actualAppliedPenaltyXp).toBe(applied);
    }
    const ledger = await db.xpTransaction.findMany({ where: { playerQuestId: q.id }, orderBy: { skillId: "asc" } });
    expect(ledger).toHaveLength(cleared.failurePenaltySkills.filter((detail) => detail.actualAppliedPenaltyXp! > 0).length);
    for (const entry of ledger) {
      const detail = cleared.failurePenaltySkills.find((item) => item.skillId === entry.skillId)!;
      expect(entry).toMatchObject({ xpScope: "SKILL", transactionType: "QUEST_FAILURE", amount: -detail.actualAppliedPenaltyXp! });
    }
    expect(await db.playerProgress.findUniqueOrThrow({ where: { playerId } })).toEqual(overallBefore);
    expect((await db.playerQuestSlot.findUniqueOrThrow({ where: { id: slot.id } })).currentPlayerQuestId).not.toBe(q.id);
    for (const action of ["clear", "complete"] as const) {
      await expect(resolveStandardQuest(db, playerId, q.id, action, { now: () => clearedAt })).rejects.toMatchObject({ status: 409, code: "QUEST_NOT_CURRENT" });
    }
    expect(await db.playerQuest.findUniqueOrThrow({ where: { id: q.id }, include: { failurePenaltySkills: true } })).toEqual(cleared);
    expect(await db.playerSkillProgress.findMany({ where: { playerId }, orderBy: { skillId: "asc" } })).toEqual(skillsAfter);
    expect(await db.xpTransaction.findMany({ where: { playerQuestId: q.id }, orderBy: { skillId: "asc" } })).toEqual(ledger);
    expect(await db.questReward.count({ where: { playerQuestId: q.id } })).toBe(0);
    expect(await db.questInteraction.count({ where: { playerQuestId: q.id, interactionType: "CLEARED" } })).toBe(1);
  });

  it("completes exactly once from snapshots, awards reconciled XP/streaks, and refills", async () => {
    const before = flat(await read())[0]; const acceptedAt = "2026-09-06T12:00:00Z";
    await mutateStandardQuest(db, playerId, before.quest.id, "accept", {}, { now: at(acceptedAt) });
    await db.questDefinition.update({ where: { id: before.quest.definitionId }, data: { baseXp: 999 } });
    const result = await resolveStandardQuest(db, playerId, before.quest.id, "complete", { now: at("2026-09-06T13:00:00Z"), random: () => 0.5 });
    expect(flat(result).find((s) => s.id === before.id)!.quest.id).not.toBe(before.quest.id);
    const quest = await db.playerQuest.findUniqueOrThrow({ where: { id: before.quest.id }, include: { reward: { include: { skillRewards: true } }, xpTransactions: true } });
    expect(quest.status).toBe("COMPLETED"); expect(quest.reward!.baseXp).toBe(before.quest.baseXp);
    expect(quest.reward!.skillRewards.reduce((n, r) => n + r.finalSkillXp, 0)).toBe(quest.reward!.finalOverallXp);
    expect(quest.xpTransactions.filter((x) => x.xpScope === "OVERALL")).toHaveLength(1);
    await expect(resolveStandardQuest(db, playerId, before.quest.id, "complete")).rejects.toMatchObject({ status: 409 });
    expect(await db.questReward.count({ where: { playerQuestId: before.quest.id } })).toBe(1);
  });
  it("expires lazily without applying XP, then clears the stored penalty once", async () => {
    const before = flat(await read())[0]; await mutateStandardQuest(db, playerId, before.quest.id, "accept", {}, { now: at("2026-09-01T00:00:00Z") });
    const expired = await reconcileStandardQuestSlots(db, playerId, () => 0.5, at("2026-09-10T00:00:00Z"));
    expect(flat(expired).find((s) => s.id === before.id)!.quest).toMatchObject({ status: "EXPIRED", failurePenaltyXp: Math.floor((before.quest.baseXp! * 20 + 50) / 100) });
    expect(await db.xpTransaction.count({ where: { playerQuestId: before.quest.id } })).toBe(0);
    const after = await resolveStandardQuest(db, playerId, before.quest.id, "clear", { now: at("2026-09-10T01:00:00Z"), random: () => 0.5 });
    expect(flat(after).find((s) => s.id === before.id)!.quest.id).not.toBe(before.quest.id);
    const quest = await db.playerQuest.findUniqueOrThrow({ where: { id: before.quest.id }, include: { failurePenaltySkills: true } });
    expect(quest.clearedAt).not.toBeNull(); expect(quest.failurePenaltySkills.every((x) => x.actualAppliedPenaltyXp === 0)).toBe(true);
    await expect(resolveStandardQuest(db, playerId, before.quest.id, "clear")).rejects.toMatchObject({ status: 409 });
  });
  it("abandons pre-deadline with a Current-only floor and replacement", async () => {
    const before = flat(await read())[0]; await mutateStandardQuest(db, playerId, before.quest.id, "accept", {}, { now: at("2026-09-06T00:00:00Z") });
    await resolveStandardQuest(db, playerId, before.quest.id, "abandon", { now: at("2026-09-06T01:00:00Z"), random: () => 0.5 });
    const quest = await db.playerQuest.findUniqueOrThrow({ where: { id: before.quest.id }, include: { failurePenaltySkills: true } });
    expect(quest).toMatchObject({ status: "ABANDONED", failurePenaltyAppliedAt: expect.any(Date) });
    expect(quest.failurePenaltySkills.every((x) => x.actualAppliedPenaltyXp === 0)).toBe(true);
    expect(await db.xpTransaction.count({ where: { playerQuestId: quest.id } })).toBe(0);
  });
});

describe("Phase 07 Skill streak integration", () => {
  const at = (value: string) => () => new Date(value);
  it.each([[3, 5], [7, 10], [14, 15], [30, 20]])("awards the exact bonus immediately on entering day %i", async (target, percent) => {
    const { q, d } = await fixtureOffer("F-WALK-01"); const skillId = d.skills.find((s) => s.isPrimary)!.skillId;
    await db.playerSkillStreak.update({ where: { playerId_skillId: { playerId, skillId } }, data: { currentStreakDays: target - 1, longestStreakDays: target - 1, lastQualifyingDate: new Date("2026-09-06T00:00:00Z") } });
    await mutateStandardQuest(db, playerId, q.id, "accept", {}, { now: at("2026-09-07T06:00:00Z") });
    await resolveStandardQuest(db, playerId, q.id, "complete", { now: at("2026-09-07T12:00:00Z"), random: () => 0.5 });
    const reward = await db.questSkillReward.findFirstOrThrow({ where: { questReward: { playerQuestId: q.id }, skillId } });
    expect(reward.streakBonusXp).toBe(percentRoundHalfUp(reward.baseSkillXp, percent));
    expect(await db.playerSkillStreak.findUniqueOrThrow({ where: { playerId_skillId: { playerId, skillId } } })).toMatchObject({ currentStreakDays: target, longestStreakDays: target });
  });
  it("evaluates multi-Skill streaks independently and keeps Catch-Up additive", async () => {
    const { q, d } = await fixtureOffer("F-WALK-04"); const ordered = [...d.skills].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
    await db.playerSkillStreak.update({ where: { playerId_skillId: { playerId, skillId: ordered[0].skillId } }, data: { currentStreakDays: 2, longestStreakDays: 2, lastQualifyingDate: new Date("2026-09-06T00:00:00Z") } });
    await db.playerSkillStreak.update({ where: { playerId_skillId: { playerId, skillId: ordered[1].skillId } }, data: { currentStreakDays: 6, longestStreakDays: 6, lastQualifyingDate: new Date("2026-09-06T00:00:00Z") } });
    await mutateStandardQuest(db, playerId, q.id, "accept", {}, { now: at("2026-09-07T06:00:00Z") });
    await resolveStandardQuest(db, playerId, q.id, "complete", { now: at("2026-09-07T12:00:00Z"), random: () => 0.5 });
    const rewards = await db.questSkillReward.findMany({ where: { questReward: { playerQuestId: q.id } } });
    expect(rewards.find((r) => r.skillId === ordered[0].skillId)!.streakBonusXp).toBe(percentRoundHalfUp(rewards.find((r) => r.skillId === ordered[0].skillId)!.baseSkillXp, 5));
    expect(rewards.find((r) => r.skillId === ordered[1].skillId)!.streakBonusXp).toBe(percentRoundHalfUp(rewards.find((r) => r.skillId === ordered[1].skillId)!.baseSkillXp, 10));
    expect(rewards.every((r) => r.finalSkillXp === r.baseSkillXp + r.catchUpBonusXp + r.streakBonusXp)).toBe(true);
    expect(await db.playerSkillStreak.count({ where: { playerId, currentStreakDays: { gt: 0 } } })).toBe(2);
  });
  it("returns effective stale state without write-on-read and applies timezone changes only prospectively", async () => {
    await read(); const skill = await db.skill.findUniqueOrThrow({ where: { code: "F" } }); const storedDate = new Date("2026-09-05T00:00:00Z");
    await db.playerSkillStreak.update({ where: { playerId_skillId: { playerId, skillId: skill.id } }, data: { currentStreakDays: 8, longestStreakDays: 8, lastQualifyingDate: storedDate } });
    const stale = await reconcileStandardQuestSlots(db, playerId, () => 0.5, at("2026-09-07T12:00:00Z")); const fitness = stale.skills.find((s) => s.code === "F")!;
    expect(fitness).toMatchObject({ currentStreakDays: 0, streakActive: false, streakBonusPercent: 0 });
    expect(await db.playerSkillStreak.findUniqueOrThrow({ where: { playerId_skillId: { playerId, skillId: skill.id } } })).toMatchObject({ currentStreakDays: 8, lastQualifyingDate: storedDate });
    await updateTimezone(db, userId, { timezone: "Pacific/Honolulu" });
    const shifted = await reconcileStandardQuestSlots(db, playerId, () => 0.5, at("2026-09-07T05:00:00Z"));
    expect(shifted.skills.find((s) => s.code === "F")!.currentStreakDays).toBe(8);
  });
});

describe("Standard Phase 05 concurrency", () => {
  const acceptedAt = new Date("2026-09-06T12:00:00Z");
  const onTime = new Date("2026-09-06T13:00:00Z");
  const accept = (id: string) => mutateStandardQuest(db, playerId, id, "accept", {}, { now: () => acceptedAt });
  const resolve = (id: string, kind: "complete" | "abandon" | "clear", now = onTime) => resolveStandardQuest(db, playerId, id, kind, { now: () => now, random: () => 0.5 });
  async function ledgerCurrent(skillId: string) {
    const rows = await db.xpTransaction.findMany({ where: { playerId, skillId, xpScope: "SKILL" } });
    return rows.reduce((sum, row) => sum + row.amount, 0);
  }
  it("serializes double completion without duplicate reward or XP", async () => {
    const { q } = await fixtureOffer("F-WALK-01"); await accept(q.id);
    const results = await Promise.allSettled([resolve(q.id, "complete"), resolve(q.id, "complete")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.questReward.count({ where: { playerQuestId: q.id } })).toBe(1);
    expect(await db.xpTransaction.count({ where: { playerQuestId: q.id, xpScope: "OVERALL" } })).toBe(1);
  });
  it("serializes complete versus abandon to one terminal outcome", async () => {
    const { q } = await fixtureOffer("F-WALK-01"); await accept(q.id);
    const results = await Promise.allSettled([resolve(q.id, "complete"), resolve(q.id, "abandon")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const row = await db.playerQuest.findUniqueOrThrow({ where: { id: q.id } });
    expect(["COMPLETED", "ABANDONED"]).toContain(row.status);
    expect(await db.questReward.count({ where: { playerQuestId: q.id } })).toBe(row.status === "COMPLETED" ? 1 : 0);
  });
  it("completion racing overdue reconciliation expires with no hidden penalty", async () => {
    const { q } = await fixtureOffer("F-WALK-01"); await accept(q.id); const overdue = new Date("2026-09-10T13:00:00Z");
    await Promise.allSettled([resolve(q.id, "complete", overdue), reconcileStandardQuestSlots(db, playerId, () => 0.5, () => overdue)]);
    expect(await db.playerQuest.findUnique({ where: { id: q.id } })).toMatchObject({ status: "EXPIRED", failurePenaltyAppliedAt: null });
    expect(await db.questReward.count({ where: { playerQuestId: q.id } })).toBe(0);
    expect(await db.xpTransaction.count({ where: { playerQuestId: q.id } })).toBe(0);
  });
  it("abandon racing expiration remains one unacknowledged expiration", async () => {
    const { q } = await fixtureOffer("F-WALK-01"); await accept(q.id); const overdue = new Date("2026-09-10T13:00:00Z");
    await Promise.allSettled([resolve(q.id, "abandon", overdue), reconcileStandardQuestSlots(db, playerId, () => 0.5, () => overdue)]);
    expect(await db.playerQuest.findUnique({ where: { id: q.id } })).toMatchObject({ status: "EXPIRED", failurePenaltyAppliedAt: null });
    expect(await db.questInteraction.count({ where: { playerQuestId: q.id, interactionType: "EXPIRED" } })).toBe(1);
    expect(await db.xpTransaction.count({ where: { playerQuestId: q.id } })).toBe(0);
  });
  it("serializes double expired clear and applies at most once", async () => {
    const { q } = await fixtureOffer("F-WALK-01"); await accept(q.id); const overdue = new Date("2026-09-10T13:00:00Z");
    await reconcileStandardQuestSlots(db, playerId, () => 0.5, () => overdue);
    const results = await Promise.allSettled([resolve(q.id, "clear", overdue), resolve(q.id, "clear", overdue)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.questInteraction.count({ where: { playerQuestId: q.id, interactionType: "CLEARED" } })).toBe(1);
    expect(await db.xpTransaction.count({ where: { playerQuestId: q.id, transactionType: "QUEST_FAILURE" } })).toBeLessThanOrEqual(1);
  });
  it("preserves both rewards when two quests complete concurrently into one Skill", async () => {
    const first = await fixtureOfferInSlot("F-WALK-01", 1); const second = await fixtureOfferInSlot("F-MOB-01", 2); await accept(first.q.id); await accept(second.q.id);
    await Promise.all([resolve(first.q.id, "complete"), resolve(second.q.id, "complete")]);
    const skillId = first.d.skills.find((s) => s.isPrimary)!.skillId; const progress = await db.playerSkillProgress.findUniqueOrThrow({ where: { playerId_skillId: { playerId, skillId } } });
    expect(await db.questReward.count({ where: { playerQuestId: { in: [first.q.id, second.q.id] } } })).toBe(2);
    expect(progress.currentXp).toBe(await ledgerCurrent(skillId));
    expect(await db.playerSkillStreak.findUniqueOrThrow({ where: { playerId_skillId: { playerId, skillId } } })).toMatchObject({ currentStreakDays: 1, longestStreakDays: 1 });
    expect(await db.questSkillReward.count({ where: { questReward: { playerQuestId: { in: [first.q.id, second.q.id] } }, streakBonusXp: { gt: 0 } } })).toBe(0);
  });
  it("preserves overlapping multi-Skill completion totals", async () => {
    const first = await fixtureOfferInSlot("F-WALK-04", 1); const second = await fixtureOfferInSlot("F-NUT-03", 2); await accept(first.q.id); await accept(second.q.id);
    await Promise.all([resolve(first.q.id, "complete"), resolve(second.q.id, "complete")]);
    for (const skillId of new Set([...first.d.skills, ...second.d.skills].map((s) => s.skillId))) {
      const progress = await db.playerSkillProgress.findUniqueOrThrow({ where: { playerId_skillId: { playerId, skillId } } });
      expect(progress.currentXp).toBe(await ledgerCurrent(skillId));
      expect(progress.lifetimeXp).toBe((await db.xpTransaction.findMany({ where: { playerId, skillId, xpScope: "LIFETIME_SKILL" } })).reduce((sum, row) => sum + row.amount, 0));
      expect((await db.playerSkillStreak.findUniqueOrThrow({ where: { playerId_skillId: { playerId, skillId } } })).currentStreakDays).toBe(1);
    }
  });
  it("serializes expired clear against positive completion with no lost Skill XP", async () => {
    const expired = await fixtureOfferInSlot("F-WALK-01", 1); const positive = await fixtureOfferInSlot("F-MOB-01", 2); await accept(expired.q.id); await accept(positive.q.id);
    const overdue = new Date("2026-09-10T13:00:00Z");
    await reconcileStandardQuestSlots(db, playerId, () => 0.5, () => overdue);
    // Give the positive quest a still-valid deadline while retaining the other quest's stored expiration facts.
    await db.playerQuest.update({ where: { id: positive.q.id }, data: { status: "ACCEPTED", deadlineAt: new Date("2026-09-11T13:00:00Z"), expiredAt: null, failurePenaltyXp: null } });
    await db.playerQuestFailurePenaltySkill.deleteMany({ where: { playerQuestId: positive.q.id } });
    await db.questInteraction.deleteMany({ where: { playerQuestId: positive.q.id, interactionType: "EXPIRED" } });
    await Promise.all([resolve(expired.q.id, "clear", overdue), resolve(positive.q.id, "complete", overdue)]);
    const skillId = expired.d.skills.find((s) => s.isPrimary)!.skillId; const progress = await db.playerSkillProgress.findUniqueOrThrow({ where: { playerId_skillId: { playerId, skillId } } });
    expect(progress.currentXp).toBe(await ledgerCurrent(skillId));
    expect(progress.currentXp).toBeGreaterThanOrEqual(0);
    expect(await db.questReward.count({ where: { playerQuestId: positive.q.id } })).toBe(1);
    expect(await db.questInteraction.count({ where: { playerQuestId: expired.q.id, interactionType: "CLEARED" } })).toBe(1);
    const slots = await db.playerQuestSlot.findMany({ where: { playerId }, include: { currentPlayerQuest: true } });
    expect(slots).toHaveLength(24); expect(slots.every((s) => s.currentPlayerQuest?.playerId === playerId)).toBe(true);
  });
});
