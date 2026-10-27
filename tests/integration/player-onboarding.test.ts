import { createIntegrationDatabase } from "../support/integration-database";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ensurePlayerForUser, completeOnboarding, respecFocus, updateTimezone, assertOnboardingIntegrity } from "../../src/modules/player/services";
import { createPlayerApi } from "../../src/modules/player/api";
import { flourishAdapter } from "../../src/modules/auth/adapter";
import skills from "../../data/seeds/skills.json";

const fixtureDb = createIntegrationDatabase();
const { schema, pool } = fixtureDb;
const db = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
const input = () => ({ timezone: "America/Denver", focus: Object.entries({ F: 6, L: 6, O: 6, U: 6, R: 6, I: 6, S: 5, H: 5 }).map(([skillCode, points]) => ({ skillCode, points })) });
let userId: string;
let playerId: string;

beforeAll(() => fixtureDb.setup());
beforeEach(async () => {
  await fixtureDb.reset(["users","skills"]);
  await db.skill.createMany({ data: skills });
  const user = await db.user.create({ data: { email: "player@example.test" } });
  userId = user.id; playerId = (await ensurePlayerForUser(db, userId)).id;
});
afterAll(async () => { try { await db.$disconnect(); } finally { await fixtureDb.dispose(); } });

async function counts() {
  return { focus: await db.playerSkillFocus.count(), history: await db.playerSkillFocusHistory.count(), progress: await db.playerProgress.count(), skillProgress: await db.playerSkillProgress.count(), streaks: await db.playerSkillStreak.count(), slots: await db.playerQuestSlot.count(), quests: await db.playerQuest.count() };
}
const principal = async () => {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { player: true } });
  return { id: user.id, email: user.email, role: user.role, playerId: user.player?.id ?? null, onboardingCompletedAt: user.player?.onboardingCompletedAt?.toISOString() ?? null };
};
const api = createPlayerApi({ getDb: () => db, resolveUser: principal });
const request = (body: unknown, method = "POST", origin = "http://localhost:3000") => new Request("http://localhost:3000/api/onboarding/complete", { method, headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("Player bootstrap and onboarding transactions", () => {
  it("creates one unset-timezone Player and handles concurrent bootstrap", async () => {
    const rows = await Promise.all(Array.from({ length: 5 }, () => ensurePlayerForUser(db, userId)));
    expect(new Set(rows.map((p) => p.id))).toEqual(new Set([playerId]));
    expect(rows[0]).toMatchObject({ timezone: null, onboardingCompletedAt: null });
    expect(await db.player.count()).toBe(1);
    expect((await counts()).slots).toBe(0);
  });
  it("establishes all state with eight truthful initial history entries", async () => {
    await completeOnboarding(db, userId, input());
    expect(await counts()).toEqual({ focus: 8, history: 8, progress: 1, skillProgress: 8, streaks: 8, slots: 0, quests: 0 });
    const state = await assertOnboardingIntegrity(db, playerId);
    expect(state.player.timezone).toBe("America/Denver");
    const history = await db.playerSkillFocusHistory.findMany();
    expect(history.every((h) => h.oldFocusPoints === null)).toBe(true);
    expect(new Set(history.map((h) => h.allocationChangeId)).size).toBe(1);
    expect(await db.playerProgress.findUnique({ where: { playerId } })).toMatchObject({ overallXp: 0, overallLevel: 1 });
    expect((await db.playerSkillProgress.findMany()).every((p) => p.currentXp === 0 && p.lifetimeXp === 0 && p.currentLevel === 1)).toBe(true);
    expect((await db.playerSkillStreak.findMany()).every((s) => s.currentStreakDays === 0 && s.longestStreakDays === 0 && s.lastQualifyingDate === null)).toBe(true);
  });
  it("serializes duplicate completion and preserves progressed state on retry", async () => {
    const results = await Promise.all([completeOnboarding(db, userId, input()), completeOnboarding(db, userId, input())]);
    expect(results.filter((r) => r.alreadyCompleted)).toHaveLength(1);
    await db.playerProgress.update({ where: { playerId }, data: { overallXp: 123, overallLevel: 2 } });
    await completeOnboarding(db, userId, input());
    expect((await counts()).history).toBe(8);
    expect(await db.playerProgress.findUnique({ where: { playerId } })).toMatchObject({ overallXp: 123, overallLevel: 2 });
    await expect(completeOnboarding(db, userId, { ...input(), timezone: "UTC" })).rejects.toMatchObject({ code: "ALREADY_ONBOARDED" });
  });
  it("preserves preexisting progression and streak rows", async () => {
    const skill = await db.skill.findUniqueOrThrow({ where: { code: "F" } });
    await db.playerProgress.create({ data: { playerId, overallXp: 50 } });
    await db.playerSkillProgress.create({ data: { playerId, skillId: skill.id, currentXp: 40, lifetimeXp: 50 } });
    await db.playerSkillStreak.create({ data: { playerId, skillId: skill.id, currentStreakDays: 2, longestStreakDays: 3 } });
    await completeOnboarding(db, userId, input());
    expect(await db.playerSkillProgress.findUnique({ where: { playerId_skillId: { playerId, skillId: skill.id } } })).toMatchObject({ currentXp: 40, lifetimeXp: 50 });
    expect(await db.playerSkillStreak.findUnique({ where: { playerId_skillId: { playerId, skillId: skill.id } } })).toMatchObject({ currentStreakDays: 2, longestStreakDays: 3 });
  });
  it.each(["total", "below", "above", "missing", "unknown", "duplicate", "timezone"])("rejects %s without writes", async (kind) => {
    const data = input();
    if (kind === "total") data.focus[0].points = 5;
    if (kind === "below") data.focus[0].points = 0;
    if (kind === "above") data.focus[0].points = 11;
    if (kind === "missing") data.focus.pop();
    if (kind === "unknown") data.focus[0].skillCode = "X";
    if (kind === "duplicate") data.focus.push(data.focus[0]);
    if (kind === "timezone") data.timezone = "Denver";
    await expect(completeOnboarding(db, userId, data)).rejects.toThrow();
    expect((await counts()).focus).toBe(0);
    expect((await counts()).progress).toBe(0);
    expect(await db.player.findUnique({ where: { id: playerId } })).toMatchObject({ timezone: null, onboardingCompletedAt: null });
  });
  it("requires all eight active seeded Skills", async () => {
    await db.skill.update({ where: { code: "H" }, data: { active: false } });
    await expect(completeOnboarding(db, userId, input())).rejects.toMatchObject({ code: "SEED_REQUIRED" });
    expect((await counts()).history).toBe(0);
  });
  it("rolls back even when a late progression insert fails", async () => {
    await pool.query("ALTER TABLE player_skill_streaks ADD CONSTRAINT forced_test_failure CHECK (current_streak_days > 0)");
    try { await expect(completeOnboarding(db, userId, input())).rejects.toThrow(); } finally { await pool.query("ALTER TABLE player_skill_streaks DROP CONSTRAINT forced_test_failure"); }
    expect(await counts()).toEqual({ focus: 0, history: 0, progress: 0, skillProgress: 0, streaks: 0, slots: 0, quests: 0 });
    expect(await db.player.findUnique({ where: { id: playerId } })).toMatchObject({ onboardingCompletedAt: null, timezone: null });
  });
  it("rejects timestamp-only completed state", async () => {
    await db.player.update({ where: { id: playerId }, data: { timezone: "UTC", onboardingCompletedAt: new Date() } });
    await expect(completeOnboarding(db, userId, { ...input(), timezone: "UTC" })).rejects.toMatchObject({ code: "ONBOARDING_INTEGRITY" });
  });
  it("writes changed-Skill respec history only and leaves progression intact", async () => {
    await completeOnboarding(db, userId, input());
    const before = await db.playerSkillProgress.findMany({ orderBy: { skillId: "asc" } });
    const data = input(); data.focus[0].points--; data.focus[7].points++;
    expect(await respecFocus(db, userId, { focus: data.focus })).toMatchObject({ changed: 2 });
    const changes = await db.playerSkillFocusHistory.findMany({ where: { oldFocusPoints: { not: null } } });
    expect(changes).toHaveLength(2);
    expect(changes.map((h) => [h.oldFocusPoints, h.newFocusPoints]).sort()).toEqual([[5, 6], [6, 5]]);
    expect(new Set(changes.map((h) => h.allocationChangeId)).size).toBe(1);
    expect(await respecFocus(db, userId, { focus: data.focus })).toEqual({ changed: 0, allocationChangeId: null });
    expect((await counts()).history).toBe(10);
    expect(await db.playerSkillProgress.findMany({ orderBy: { skillId: "asc" } })).toEqual(before);
    await updateTimezone(db, userId, { timezone: "Europe/London" });
    expect((await assertOnboardingIntegrity(db, playerId)).player.timezone).toBe("Europe/London");
    await expect(respecFocus(db, userId, { focus: [] })).rejects.toThrow();
    await expect(updateTimezone(db, userId, { timezone: "UTC-7" })).rejects.toThrow();
    expect((await counts()).history).toBe(10);
  });
  it("serializes concurrent respecs with accurate old values", async () => {
    await completeOnboarding(db, userId, input());
    const a = input(); a.focus[0].points--; a.focus[7].points++;
    const b = input(); b.focus[1].points--; b.focus[6].points++;
    await Promise.all([respecFocus(db, userId, { focus: a.focus }), respecFocus(db, userId, { focus: b.focus })]);
    await assertOnboardingIntegrity(db, playerId);
    // First respec changes 2; second changes 4 relative to the first, regardless of order.
    expect((await counts()).history).toBe(14);
  });
});

describe("REST and Auth.js adapter boundaries", () => {
  it("returns 401 before reading mutation bodies without a session", async () => {
    const anonymous = createPlayerApi({ getDb: () => db, resolveUser: async () => null });
    expect((await anonymous.complete(request(input()))).status).toBe(401);
    expect((await anonymous.me()).status).toBe(401);
    expect((await anonymous.focus(request({}))).status).toBe(401);
  });
  it("completes and retries through REST, reads me, respecs and updates timezone", async () => {
    expect((await api.complete(request(input()))).status).toBe(200);
    expect(await (await api.complete(request(input()))).json()).toMatchObject({ alreadyCompleted: true });
    const me = await api.me(); expect(me.headers.get("cache-control")).toBe("no-store");
    expect(await me.json()).toMatchObject({ email: "player@example.test", role: "PLAYER", player: { id: playerId, timezone: "America/Denver" } });
    expect((await api.focus(request({ focus: input().focus }, "PUT"))).status).toBe(200);
    expect((await api.timezone(request({ timezone: "UTC" }, "PUT"))).status).toBe(200);
    expect((await api.timezone(request({ timezone: "Denver" }, "PUT"))).status).toBe(400);
  });
  it("rejects invalid input, forged identity, cross-origin mutations, and admin access", async () => {
    expect((await api.focus(request({ focus: input().focus }, "PUT"))).status).toBe(409);
    expect((await api.complete(request({ ...input(), playerId: randomUUID(), role: "ADMIN" }))).status).toBe(400);
    expect((await api.complete(request({ ...input(), focus: [] }))).status).toBe(400);
    expect((await api.complete(request({ ...input(), timezone: "Denver" }))).status).toBe(400);
    expect((await api.complete(request(input(), "POST", "https://attacker.example"))).status).toBe(403);
    expect((await api.admin()).status).toBe(403);
    await db.user.update({ where: { id: userId }, data: { role: "ADMIN" } });
    expect((await api.admin()).status).toBe(200);
    expect((await counts()).focus).toBe(0);
  });
  it("maps existing models without storing tokens or merging matching-email identities", async () => {
    const adapter = flourishAdapter(() => db);
    const created = await adapter.createUser!({ email: " New.User+Tag@Example.test ", emailVerified: new Date(), name: "New", image: null });
    expect(created.email).toBe("new.user+tag@example.test");
    expect(await db.player.count({ where: { userId: created.id } })).toBe(1);
    const account = { userId: created.id, type: "oauth" as const, provider: "google", providerAccountId: "google-test-subject", access_token: "TEST_TOKEN_NOT_TO_PERSIST" };
    await adapter.linkAccount!(account); await adapter.linkAccount!(account);
    expect(await db.authAccount.count()).toBe(1);
    expect(await adapter.getUserByAccount!({ provider: "google", providerAccountId: account.providerAccountId })).toMatchObject({ id: created.id });
    expect(JSON.stringify(await db.authAccount.findMany())).not.toContain("TEST_TOKEN_NOT_TO_PERSIST");
    await expect(adapter.linkAccount!({ ...account, userId })).rejects.toThrow("already linked");
    await expect(adapter.createUser!({ email: created.email, emailVerified: null })).rejects.toThrow();
    expect(await db.player.count({ where: { userId: created.id } })).toBe(1);
  });
});
