import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadCanonicalSeed } from "../../src/modules/quests/seed/load";
import { persistCanonicalSeed } from "../../src/modules/quests/seed/persist";
import { completeOnboarding, ensurePlayerForUser, respecFocus, updateTimezone } from "../../src/modules/player/services";
import { initialFocusAllocation } from "../../src/modules/player/domain/focus";
import { ensureStandardQuestSlots, reconcileStandardQuestSlots } from "../../src/modules/quests/standard/slots";
import { mutateStandardQuest } from "../../src/modules/quests/standard/actions";
import { definitionInclude, previewSnapshots } from "../../src/modules/quests/standard/content";
import { createStandardApi } from "../../src/modules/quests/standard/api";
import { resolveStandardQuest } from "../../src/modules/quests/standard/resolution";
import type { StandardState } from "../../src/modules/quests/standard/view";
import { getHomeRecommendation } from "../../src/modules/recommendations/service";
import { percentRoundHalfUp } from "../../src/modules/progression/math";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL must point to a disposable test database.");
const schema = `standard_test_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({ connectionString });
const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
const db = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });
let playerId: string; let userId: string;
const focus = () => Object.entries(initialFocusAllocation()).map(([skillCode, points]) => ({ skillCode, points }));
const flat = (s: StandardState) => s.skills.flatMap((x) => x.slots);
const read = () => reconcileStandardQuestSlots(db, playerId, () => 0.5);
const action = (id: string, kind: "accept" | "reroll" | "bump", input = {}) => mutateStandardQuest(db, playerId, id, kind, input, { random: () => 0.5 });
beforeAll(async () => {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  for (const name of readdirSync(resolve("prisma/migrations")).sort()) if (/^\d/.test(name)) await pool.query(readFileSync(resolve("prisma/migrations", name, "migration.sql"), "utf8"));
});
beforeEach(async () => {
  await pool.query("TRUNCATE users, skills, quest_families, quest_definitions CASCADE");
  await persistCanonicalSeed(db, loadCanonicalSeed());
  userId = (await db.user.create({ data: { email: "standard@example.test" } })).id;
  playerId = (await ensurePlayerForUser(db, userId)).id;
  await completeOnboarding(db, userId, { timezone: "America/Denver", focus: focus() });
});
afterAll(async () => { await db.$disconnect(); await pool.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end(); });

describe("Home recommendations", () => {
  it("persists one recommendation from existing AVAILABLE slots without changing progression", async () => {
    const state = await read(); const existing = new Set(flat(state).map((s) => s.quest.id));
    const first = await getHomeRecommendation(db, playerId, () => 0.5); const second = await getHomeRecommendation(db, playerId, () => 0.99);
    expect(second).toEqual(first); expect(existing.has(first.playerQuestId)).toBe(true);
    expect(await db.playerRecommendation.count({ where: { playerId } })).toBe(1);
    expect(await db.playerQuest.count({ where: { playerId } })).toBe(24);
    expect(await db.xpTransaction.count({ where: { playerId } })).toBe(0);
    expect(await db.playerProgress.findUniqueOrThrow({ where: { playerId } })).toMatchObject({ overallXp: 0, overallLevel: 1 });
  });
  it("serializes concurrent generation and isolates ownership", async () => {
    await read(); const results = await Promise.all([0, 1, 2].map(() => getHomeRecommendation(db, playerId, () => 0.5)));
    expect(new Set(results.map((r) => r.playerQuestId)).size).toBe(1); expect(await db.playerRecommendation.count({ where: { playerId } })).toBe(1);
    const otherUser = await db.user.create({ data: { email: "recommendation-other@example.test" } }); const other = await ensurePlayerForUser(db, otherUser.id); await completeOnboarding(db, otherUser.id, { timezone: "UTC", focus: focus() });
    const theirs = await getHomeRecommendation(db, other.id, () => 0.5); expect(theirs.playerQuestId).not.toBe(results[0].playerQuestId);
    expect((await db.playerQuest.findUniqueOrThrow({ where: { id: theirs.playerQuestId } })).playerId).toBe(other.id);
  });
  it("invalidates on Focus change and target mutation, then recalculates", async () => {
    await read(); const original = await getHomeRecommendation(db, playerId, () => 0.5); const changed = focus(); changed[0].points--; changed[7].points++;
    await respecFocus(db, userId, { focus: changed }); expect((await db.playerRecommendation.findUniqueOrThrow({ where: { playerId } })).invalidatedAt).not.toBeNull();
    await getHomeRecommendation(db, playerId, () => 0.5); await mutateStandardQuest(db, playerId, original.playerQuestId, "reroll", {}, { random: () => 0.5 });
    const next = await getHomeRecommendation(db, playerId, () => 0.5); expect(next.playerQuestId).not.toBe(original.playerQuestId);
  });
  it("serializes generation racing a target reroll without retaining a stale target", async () => {
    await read(); const original = await getHomeRecommendation(db, playerId, () => 0.5);
    await Promise.all([getHomeRecommendation(db, playerId, () => 0.1), mutateStandardQuest(db, playerId, original.playerQuestId, "reroll", {}, { random: () => 0.5 })]);
    const final = await getHomeRecommendation(db, playerId, () => 0.5); const quest = await db.playerQuest.findUniqueOrThrow({ where: { id: final.playerQuestId } });
    expect(final.playerQuestId).not.toBe(original.playerQuestId); expect(quest).toMatchObject({ playerId, status: "AVAILABLE", poolType: "STANDARD" });
    expect(await db.playerRecommendation.count({ where: { playerId } })).toBe(1);
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
});

describe("Standard Phase 05 resolution", () => {
  const at = (value: string) => () => new Date(value);
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
