import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { Pool } from "pg";
import type { StandardState } from "../../src/modules/quests/standard/view";

test.describe("Standard quest experience", () => {
  test.setTimeout(240_000);
  test.skip(!process.env.E2E_DATABASE_URL, "Set E2E_DATABASE_URL to a migrated, seeded disposable database.");
  let db: Pool; const users: string[] = [];
  test.beforeAll(() => { db = new Pool({ connectionString: process.env.E2E_DATABASE_URL! }); });
  test.afterAll(async () => { if (db) {
    await db.query("DELETE FROM quest_skill_rewards WHERE quest_reward_id IN (SELECT qr.id FROM quest_rewards qr JOIN player_quests pq ON pq.id=qr.player_quest_id WHERE pq.player_id IN (SELECT id FROM players WHERE user_id=ANY($1::uuid[])))", [users]);
    await db.query("DELETE FROM quest_rewards WHERE player_quest_id IN (SELECT id FROM player_quests WHERE player_id IN (SELECT id FROM players WHERE user_id=ANY($1::uuid[])))", [users]);
    await db.query("DELETE FROM player_quest_failure_penalty_skills WHERE player_quest_id IN (SELECT id FROM player_quests WHERE player_id IN (SELECT id FROM players WHERE user_id=ANY($1::uuid[])))", [users]);
    await db.query("DELETE FROM xp_transactions WHERE player_id IN (SELECT id FROM players WHERE user_id=ANY($1::uuid[]))", [users]);
    await db.query("DELETE FROM quest_interactions WHERE player_id IN (SELECT id FROM players WHERE user_id=ANY($1::uuid[]))", [users]);
    await db.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [users]); await db.end();
  } });
  test("runs the Standard accept, complete, abandon, expire, and clear loop", async ({ page, context }, testInfo) => {
    const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
    const userId = randomUUID(); const playerId = randomUUID(); users.push(userId);
    await db.query("INSERT INTO users (id, email, created_at, updated_at) VALUES ($1,$2,now(),now())", [userId, `${userId}@quests.example.test`]);
    await db.query("INSERT INTO players (id,user_id,created_at,updated_at) VALUES ($1,$2,now(),now())", [playerId, userId]);
    const token = await encode({ secret: process.env.AUTH_SECRET!, token: { sub: userId }, maxAge: 3600 });
    await context.addCookies([{ name: "next-auth.session-token", value: token, domain: "127.0.0.1", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
    const complete = await context.request.post("/api/onboarding/complete", { headers: { Origin: "http://127.0.0.1:3103" }, data: { timezone: "America/Denver", focus: ["F", "L", "O", "U", "R", "I", "S", "H"].map((skillCode, i) => ({ skillCode, points: i < 6 ? 6 : 5 })) } });
    expect(complete.ok(), await complete.text()).toBe(true);
    await page.goto("/home");
    await expect(page.locator("[data-slot-id]")).toHaveCount(24);
    await expect(page.getByText("0-day streak (inactive)").first()).toBeVisible();
    const recommendation = page.locator("[data-recommended-quest-id]");
    await expect(recommendation.getByText("What should I do next?")).toBeVisible();
    await expect(recommendation.getByRole("link", { name: "View this Standard quest" })).toBeVisible();
    const recommendedId = await recommendation.getAttribute("data-recommended-quest-id");
    expect(await page.locator(`[data-quest-id="${recommendedId}"]`).count()).toBe(1);
    const ids = await page.locator("[data-quest-id]").evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-quest-id")));
    await page.reload();
    await expect(page.locator("[data-recommended-quest-id]")).toHaveAttribute("data-recommended-quest-id", recommendedId!);
    await expect(page.getByRole("region", { name: "Daily Challenges", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Weekly Challenges", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("home-overview.png"), fullPage: true, caret: "initial" });
    const dailyChallenge = page.getByRole("region", { name: "Daily Challenges", exact: true }).locator("[data-challenge-id]").first();
    await dailyChallenge.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(page.getByText("Challenge accepted.", { exact: true })).toBeVisible();
    const weeklyId = await page.getByRole("region", { name: "Weekly Challenges", exact: true }).locator("[data-challenge-id]").first().getAttribute("data-challenge-id");
    await db.query(`UPDATE player_quests pq SET quest_definition_id=d.id,difficulty_snapshot=d.difficulty,base_xp_snapshot=d.base_xp,completion_type_snapshot=d.completion_type,completion_target_snapshot=d.completion_target FROM quest_definitions d WHERE pq.id=$1 AND d.id=(SELECT id FROM quest_definitions WHERE completion_type='COUNT' AND weekly_eligible AND active AND review_status='APPROVED' ORDER BY stable_key LIMIT 1)`, [weeklyId]);
    await page.reload();
    const weeklyCount = page.locator(`[data-challenge-id="${weeklyId}"]`);
    await weeklyCount.getByRole("button", { name: "Accept", exact: true }).click();
    await weeklyCount.getByRole("button", { name: /Increase .* progress/ }).click();
    await expect(weeklyCount.getByText(/^1\/\d+$/)).toBeVisible();
    await page.getByRole("region", { name: "Weekly Challenges", exact: true }).screenshot({ path: testInfo.outputPath("challenge-count.png"), caret: "initial" });
    expect(await page.locator("[data-quest-id]").evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-quest-id")))).toEqual(ids);
    const firstSkill = page.locator("#quests-F");
    const expandFitness = async () => { if (!(await firstSkill.evaluate((node) => (node as HTMLDetailsElement).open))) await firstSkill.locator("summary").click(); };
    await expandFitness();
    const first = firstSkill.locator("[data-slot-id]").first();
    await first.getByRole("combobox").selectOption("JUST_DIFFERENT");
    await first.getByRole("button", { name: /^Reroll / }).click();
    await expect(page.getByText("Your replacement quest is ready.", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(first).not.toHaveAttribute("data-quest-id", ids[0]!);
    // Establish a deterministic family offer using this test's own existing slot.
    // Other family tiers are excluded from this player's other current slots only.
    await db.query(`UPDATE player_quest_slots SET current_player_quest_id = NULL WHERE player_id=$1 AND skill_id=(SELECT id FROM skills WHERE code='F')`, [playerId]);
    const qid = randomUUID();
    await db.query(`INSERT INTO player_quests (id,player_id,quest_definition_id,pool_type,status,current_progress,assigned_at,difficulty_snapshot,base_xp_snapshot,completion_type_snapshot,completion_target_snapshot,completion_window_hours_snapshot,reward_config_version_snapshot,created_at,updated_at)
      SELECT $1,$2,d.id,'STANDARD','AVAILABLE',0,now(),d.difficulty,d.base_xp,d.completion_type,d.completion_target,d.completion_window_hours,'e2e-fixture',now(),now() FROM quest_definitions d JOIN quest_families f ON f.id=d.quest_family_id WHERE f.stable_key='WALK_TIME' AND d.difficulty='EASY'`, [qid, playerId]);
    await db.query(`UPDATE player_quest_slots SET current_player_quest_id=$1 WHERE player_id=$2 AND slot_number=1 AND skill_id=(SELECT id FROM skills WHERE code='F')`, [qid, playerId]);
    // Fill the other Fitness slots with non-family definitions before reconciliation.
    for (const number of [2, 3]) {
      const id = randomUUID();
      await db.query(`INSERT INTO player_quests (id,player_id,quest_definition_id,pool_type,status,current_progress,assigned_at,difficulty_snapshot,base_xp_snapshot,completion_type_snapshot,completion_target_snapshot,completion_window_hours_snapshot,reward_config_version_snapshot,created_at,updated_at)
        SELECT $1,$2,d.id,'STANDARD','AVAILABLE',0,now(),d.difficulty,d.base_xp,d.completion_type,d.completion_target,d.completion_window_hours,'e2e-fixture',now(),now() FROM quest_definitions d JOIN quest_skills qs ON qs.quest_definition_id=d.id JOIN skills s ON s.id=qs.skill_id WHERE s.code='F' AND qs.is_primary AND d.quest_family_id IS NULL AND d.active AND d.review_status='APPROVED' AND d.standard_eligible ORDER BY d.stable_key LIMIT 1 OFFSET $3`, [id, playerId, number - 2]);
      await db.query(`UPDATE player_quest_slots SET current_player_quest_id=$1 WHERE player_id=$2 AND slot_number=$3 AND skill_id=(SELECT id FROM skills WHERE code='F')`, [id, playerId, number]);
    }
    await page.reload();
    await expandFitness();
    const walk = firstSkill.locator("[data-slot-id]").first();
    await walk.getByRole("button", { name: /^Make .* harder: Medium$/ }).click();
    await expect(page.getByText("A harder family quest is ready to accept.", { exact: true })).toBeVisible({ timeout: 30_000 });
    const current = await (await context.request.get("/api/quests/standard")).json() as StandardState;
    expect(current.skills[0].slots[0].quest.difficulty).toBe("MEDIUM");
    await walk.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(page.getByText("Quest accepted. Your deadline has started.", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expandFitness();
    await expect(walk.locator("time")).toBeVisible();
    await walk.screenshot({ path: testInfo.outputPath("accepted-standard.png"), caret: "initial" });
    const acceptedId = await walk.getAttribute("data-quest-id");
    await page.reload();
    await expandFitness();
    await expect(walk).toHaveAttribute("data-quest-id", acceptedId!);
    await expect(walk.locator("time")).toBeVisible();
    await expect(walk.getByRole("button", { name: "Complete", exact: true })).toBeVisible();
    const beforeOverall = Number((await page.getByText(/Overall XP/).first().textContent())!.match(/\d+/)![0]);
    await walk.getByRole("button", { name: "Complete", exact: true }).click();
    await expect(page.getByText(/Quest complete/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("complementary", { name: "Quest result" })).toContainText("Overall XP");
    await expect(page.getByText(/1-day streak \(active\)/).first()).toBeVisible();
    expect(Number((await page.getByText(/Overall XP/).first().textContent())!.match(/\d+/)![0])).toBeGreaterThan(beforeOverall);
    await expandFitness();
    const completedReplacement = await walk.getAttribute("data-quest-id"); expect(completedReplacement).not.toBe(acceptedId);

    await walk.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(page.getByText("Quest accepted. Your deadline has started.", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(walk.getByRole("button", { name: "Abandon", exact: true })).toBeEnabled();
    page.once("dialog", (dialog) => dialog.accept());
    await walk.getByRole("button", { name: "Abandon", exact: true }).click();
    await expect(page.getByText(/Quest abandoned/)).toBeVisible({ timeout: 30_000 });
    await expandFitness();
    const abandonReplacement = await walk.getAttribute("data-quest-id"); expect(abandonReplacement).not.toBe(completedReplacement);

    await walk.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(page.getByText("Quest accepted. Your deadline has started.", { exact: true })).toBeVisible({ timeout: 30_000 });
    const expiringId = await walk.getAttribute("data-quest-id");
    const xpBeforeExpiration = (await db.query("SELECT current_xp FROM player_skill_progress WHERE player_id=$1 AND skill_id=(SELECT id FROM skills WHERE code='F')", [playerId])).rows[0].current_xp;
    await db.query("UPDATE player_quests SET deadline_at=now()-interval '1 minute' WHERE id=$1", [expiringId]);
    await page.reload();
    await expandFitness();
    await expect(walk.getByText("Failed / expired.")).toBeVisible();
    await expect(walk).toContainText("awaiting acknowledgment");
    await walk.screenshot({ path: testInfo.outputPath("expired-standard.png"), caret: "initial" });
    expect((await db.query("SELECT current_xp FROM player_skill_progress WHERE player_id=$1 AND skill_id=(SELECT id FROM skills WHERE code='F')", [playerId])).rows[0].current_xp).toBe(xpBeforeExpiration);
    await walk.getByRole("button", { name: "Clear / acknowledge failure", exact: true }).click();
    await expect(page.getByText(/Failure acknowledged/)).toBeVisible({ timeout: 30_000 });
    expect(await walk.getAttribute("data-quest-id")).not.toBe(expiringId);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("standard-quests.png"), fullPage: false, caret: "initial" });
    expect(errors).toEqual([]);
  });
});
