import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { encode } from "next-auth/jwt";
import type { Pool } from "pg";
import { openE2eDatabase } from "../support/database-safety";
import { challengeWindow } from "../../src/modules/challenges/windows";
import type { ChallengeState } from "../../src/modules/challenges/service";

const origin = "http://127.0.0.1:3103";

// Pick real calendar boundaries that are safely away from the current instant.
// The fixture represents a previous period in one zone, followed by a preference
// change whose current local period overlaps it. No application clock is mocked.
function transition(pool: "DAILY" | "WEEKLY") {
  const now = new Date();
  const zones = ["UTC", "Pacific/Kiritimati", "Pacific/Honolulu", "America/Denver", "Asia/Kathmandu"];
  for (const from of zones) for (const to of zones) {
    const end = challengeWindow(pool, now, from).start;
    const next = challengeWindow(pool, now, to);
    const other = challengeWindow(pool === "DAILY" ? "WEEKLY" : "DAILY", now, from);
    if (next.start < end && end.getTime() < now.getTime() - 120_000
      && Math.min(next.end.getTime(), other.end.getTime()) > now.getTime() + 120_000) {
      return { from, to, previous: challengeWindow(pool, new Date(end.getTime() - 1), from), next: next.end };
    }
  }
  throw new Error("No timezone-gap fixture safely away from a period boundary.");
}

test.describe("Challenge acceptance and timezone gaps", () => {
  test.skip(!process.env.E2E_DATABASE_URL, "Requires guarded disposable E2E infrastructure.");
  let db: Pool;
  const users: string[] = [];
  test.beforeAll(async () => { db = await openE2eDatabase(); });
  test.afterAll(async () => {
    if (!db) return;
    try {
      await db.query("DELETE FROM quest_skill_rewards WHERE quest_reward_id IN (SELECT qr.id FROM quest_rewards qr JOIN player_quests pq ON pq.id=qr.player_quest_id WHERE pq.player_id IN (SELECT id FROM players WHERE user_id=ANY($1::uuid[])))", [users]);
      await db.query("DELETE FROM quest_rewards WHERE player_quest_id IN (SELECT id FROM player_quests WHERE player_id IN (SELECT id FROM players WHERE user_id=ANY($1::uuid[])))", [users]);
      await db.query("DELETE FROM xp_transactions WHERE player_id IN (SELECT id FROM players WHERE user_id=ANY($1::uuid[]))", [users]);
      await db.query("DELETE FROM quest_interactions WHERE player_id IN (SELECT id FROM players WHERE user_id=ANY($1::uuid[]))", [users]);
      await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [users]);
    } finally { await db.end(); }
  });

  for (const gapPool of ["DAILY", "WEEKLY"] as const) {
    test(`keeps ${gapPool} gap nullable while the other pool accepts and settles once`, async ({ page, context }) => {
      const clock = transition(gapPool);
      const userId = randomUUID(), playerId = randomUUID();
      users.push(userId);
      await db.query("INSERT INTO users (id,email,created_at,updated_at) VALUES ($1,$2,now(),now())", [userId, `${userId}@challenge.example.test`]);
      await db.query("INSERT INTO players (id,user_id,created_at,updated_at) VALUES ($1,$2,now(),now())", [playerId, userId]);
      const token = await encode({ secret: process.env.AUTH_SECRET!, token: { sub: userId }, maxAge: 3600 });
      await context.addCookies([{ name: "next-auth.session-token", value: token, domain: "127.0.0.1", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
      const onboard = await context.request.post("/api/onboarding/complete", { headers: { Origin: origin }, data: { timezone: clock.from, focus: ["F", "L", "O", "U", "R", "I", "S", "H"].map((skillCode, i) => ({ skillCode, points: i < 6 ? 6 : 5 })) } });
      expect(onboard.status()).toBe(200);
      const initial = await context.request.get("/api/challenges");
      expect(initial.status()).toBe(200);
      const state = await initial.json() as ChallengeState;
      const gap = gapPool === "DAILY" ? state.daily! : state.weekly!;
      const active = gapPool === "DAILY" ? state.weekly! : state.daily!;
      const activeName = gapPool === "DAILY" ? "Weekly" : "Daily";
      const gapName = gapPool === "DAILY" ? "Daily" : "Weekly";
      const questId = active.quests[0].id;
      // Select a real approved SINGLE definition for this player's offer only.
      // Avoid depending on the randomized pool containing a particular type.
      const definition = await db.query(`SELECT d.id FROM quest_definitions d WHERE d.active AND d.review_status='APPROVED' AND d.completion_type='SINGLE' AND d.difficulty<>'LEGENDARY'
        AND CASE WHEN $1='DAILY' THEN d.daily_eligible ELSE d.weekly_eligible END
        AND NOT EXISTS (SELECT 1 FROM player_quests q WHERE q.player_id=$2 AND q.quest_definition_id=d.id AND q.id<>$3 AND q.status IN ('AVAILABLE','ACCEPTED') AND q.pool_type IN ('DAILY','WEEKLY')) ORDER BY d.stable_key LIMIT 1`, [active.poolType, playerId, questId]);
      expect(definition.rowCount).toBe(1);
      await db.query(`UPDATE player_quests q SET quest_definition_id=d.id,difficulty_snapshot=d.difficulty,base_xp_snapshot=d.base_xp,completion_type_snapshot=d.completion_type,completion_target_snapshot=d.completion_target FROM quest_definitions d WHERE q.id=$1 AND d.id=$2`, [questId, definition.rows[0].id]);
      const fixture = await db.connect();
      try {
        await fixture.query("BEGIN");
        await fixture.query("UPDATE challenge_sets SET window_start_at=$2,window_end_at=$3 WHERE id=$1 AND player_id=$4", [gap.id, clock.previous.start, clock.previous.end, playerId]);
        await fixture.query("UPDATE player_quests SET window_start_at=$2,window_end_at=$3,assigned_at=$2 WHERE challenge_set_id=$1 AND player_id=$4", [gap.id, clock.previous.start, clock.previous.end, playerId]);
        await fixture.query("COMMIT");
      } catch (error) { await fixture.query("ROLLBACK"); throw error; }
      finally { fixture.release(); }
      const changed = await context.request.put("/api/me/timezone", { headers: { Origin: origin }, data: { timezone: clock.to } });
      expect(changed.status()).toBe(200);
      await page.goto("/home");
      await expect(page.getByRole("heading", { name: "Overall Level 1" })).toBeVisible();
      await expect(page.locator("[data-slot-id]")).toHaveCount(24);
      const empty = page.getByRole("region", { name: `${gapName} Challenges`, exact: true });
      await expect(empty.getByText(`No active ${gapName.toLowerCase()} period.`)).toBeVisible();
      await expect(empty.locator("time")).toHaveAttribute("dateTime", clock.next.toISOString());
      await expect(empty.getByRole("button")).toHaveCount(0);
      const region = page.getByRole("region", { name: `${activeName} Challenges`, exact: true });
      await region.getByRole("button", { name: new RegExp(`${activeName} Challenges`) }).click();
      const quest = region.locator(`[data-challenge-id="${questId}"]`);
      const accepted = page.waitForResponse(r => new URL(r.url()).pathname === `/api/challenges/${questId}/accept` && r.request().method() === "POST");
      await quest.getByRole("button", { name: "Accept", exact: true }).click();
      expect((await accepted).status()).toBe(200);
      await expect(page.locator(`[data-active-quest-id="${questId}"]`)).toContainText(`${activeName} Challenge`);
      const repeatAccept = await context.request.post(`/api/challenges/${questId}/accept`, { headers: { Origin: origin }, data: {} });
      expect(repeatAccept.status()).toBe(200);
      expect((await db.query("SELECT count(*)::int AS count FROM quest_interactions WHERE player_quest_id=$1 AND interaction_type='ACCEPTED'", [questId])).rows[0].count).toBe(1);
      expect((await db.query("SELECT count(*)::int AS count FROM quest_rewards WHERE player_quest_id=$1", [questId])).rows[0].count).toBe(0);
      const completion = page.waitForResponse(r => new URL(r.url()).pathname === `/api/challenges/${questId}/complete` && r.request().method() === "POST");
      await quest.getByRole("button", { name: "Complete", exact: true }).click();
      expect((await completion).status()).toBe(200);
      await expect(page.getByText("Challenge completed and rewards applied.", { exact: true })).toBeVisible();
      await expect(page.locator(`[data-active-quest-id="${questId}"]`)).toHaveCount(0);
      await expect(empty.getByText(`No active ${gapName.toLowerCase()} period.`)).toBeVisible();
      const settlement = async () => (await db.query("SELECT (SELECT count(*)::int FROM quest_rewards WHERE player_quest_id=$1) AS rewards, (SELECT sum(amount)::int FROM xp_transactions WHERE player_quest_id=$1 AND xp_scope='OVERALL') AS xp", [questId])).rows[0];
      const settled = await settlement();
      expect(settled.rewards).toBe(1); expect(settled.xp).toBeGreaterThan(0);
      const repeatComplete = await context.request.post(`/api/challenges/${questId}/complete`, { headers: { Origin: origin }, data: {} });
      expect(repeatComplete.status()).toBe(409);
      expect(await settlement()).toEqual(settled);
      await page.reload();
      await expect(empty.getByText(`No active ${gapName.toLowerCase()} period.`)).toBeVisible();
      const final = await (await context.request.get("/api/challenges")).json() as ChallengeState;
      expect(gapPool === "DAILY" ? final.daily : final.weekly).toBeNull();
      expect((gapPool === "DAILY" ? final.weekly : final.daily)!.quests.find(q => q.id === questId)!.status).toBe("COMPLETED");
    });
  }
});
