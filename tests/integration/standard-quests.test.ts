import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadCanonicalSeed } from "../../src/modules/quests/seed/load";
import { persistCanonicalSeed } from "../../src/modules/quests/seed/persist";
import { completeOnboarding, ensurePlayerForUser, respecFocus } from "../../src/modules/player/services";
import { initialFocusAllocation } from "../../src/modules/player/domain/focus";
import { ensureStandardQuestSlots, reconcileStandardQuestSlots } from "../../src/modules/quests/standard/slots";
import { mutateStandardQuest } from "../../src/modules/quests/standard/actions";
import { definitionInclude, previewSnapshots } from "../../src/modules/quests/standard/content";
import { createStandardApi } from "../../src/modules/quests/standard/api";
import type { StandardState } from "../../src/modules/quests/standard/view";

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

async function fixtureOffer(key: string) {
  await read();
  const d = await db.questDefinition.findUniqueOrThrow({ where: { stableKey: key }, include: definitionInclude });
  const skillId = d.skills.find((s) => s.isPrimary)!.skillId;
  // Only test-owned fixture state is changed, before exercising production operations.
  const slot = await db.playerQuestSlot.findFirstOrThrow({ where: { playerId, skillId, slotNumber: 1 } });
  const existing = await db.playerQuestSlot.findFirst({ where: { playerId, currentPlayerQuest: { questDefinitionId: d.id } } });
  if (existing && existing.id !== slot.id) await db.playerQuestSlot.update({ where: { id: existing.id }, data: { currentPlayerQuestId: null } });
  const q = await db.playerQuest.create({ data: { playerId, questDefinitionId: d.id, poolType: "STANDARD", status: "AVAILABLE", ...previewSnapshots(d) } });
  await db.playerQuestSlot.update({ where: { id: slot.id }, data: { currentPlayerQuestId: q.id } });
  await read();
  return { q, d, slot };
}
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
  it("preserves ACCEPTED and EXPIRED blockers, repairs terminal pointers, and never auto-expires", async () => {
    const before = flat(await read());
    await mutateStandardQuest(db, playerId, before[0].quest.id, "accept", {}, { now: () => new Date("2020-01-01T12:00:00Z") });
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
