import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL must point to the dedicated integration-test database.");

const pool = new Pool({ connectionString });
const now = () => new Date();

async function userAndPlayer() {
  const userId = randomUUID();
  const playerId = randomUUID();
  await pool.query(
    `INSERT INTO users (id, email, created_at, updated_at) VALUES ($1, $2, $3, $3)`,
    [userId, `${userId}@example.test`, now()],
  );
  await pool.query(
    `INSERT INTO players (id, user_id, timezone, created_at, updated_at) VALUES ($1, $2, 'UTC', $3, $3)`,
    [playerId, userId, now()],
  );
  return { userId, playerId };
}

async function skill(code = "F") {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO skills (id, code, name, description, created_at, updated_at)
     VALUES ($1, $2, $3, 'Integration test skill', $4, $4)`,
    [id, code, `Skill ${code}`, now()],
  );
  return id;
}

async function questDefinition(familyId: string | null = null, difficulty = "EASY") {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO quest_definitions
      (id, stable_key, quest_family_id, title, short_description, difficulty, base_xp,
       estimated_minutes, completion_type, completion_target, created_at, updated_at)
     VALUES ($1, $2, $3, 'Test quest', 'Test description', $4, 100, 10, 'SINGLE', 1, $5, $5)`,
    [id, `quest-${id}`, familyId, difficulty, now()],
  );
  return id;
}

async function playerQuest(playerId: string, questDefinitionId: string) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO player_quests
      (id, player_id, quest_definition_id, pool_type, difficulty_snapshot, base_xp_snapshot,
       completion_type_snapshot, completion_target_snapshot, reward_config_version_snapshot,
       assigned_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'STANDARD', 'EASY', 100, 'SINGLE', 1, 'v1', $4, $4, $4)`,
    [id, playerId, questDefinitionId, now()],
  );
  return id;
}

beforeEach(async () => {
  await pool.query(`TRUNCATE TABLE users, skills, quest_families CASCADE`);
});

afterAll(async () => {
  await pool.query(`TRUNCATE TABLE users, skills, quest_families CASCADE`);
  await pool.end();
});

describe("database constraints", () => {
  it("rejects duplicate user emails", async () => {
    const timestamp = now();
    await pool.query(`INSERT INTO users (id, email, created_at, updated_at) VALUES ($1, 'same@example.test', $2, $2)`, [randomUUID(), timestamp]);
    await expect(pool.query(`INSERT INTO users (id, email, created_at, updated_at) VALUES ($1, 'same@example.test', $2, $2)`, [randomUUID(), timestamp])).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects a second player for one user", async () => {
    const { userId } = await userAndPlayer();
    await expect(pool.query(`INSERT INTO players (id, user_id, timezone, created_at, updated_at) VALUES ($1, $2, 'UTC', $3, $3)`, [randomUUID(), userId, now()])).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects duplicate and out-of-range player slots", async () => {
    const { playerId } = await userAndPlayer();
    const skillId = await skill();
    await pool.query(`INSERT INTO player_quest_slots (id, player_id, skill_id, slot_number, created_at, updated_at) VALUES ($1, $2, $3, 1, $4, $4)`, [randomUUID(), playerId, skillId, now()]);
    await expect(pool.query(`INSERT INTO player_quest_slots (id, player_id, skill_id, slot_number, created_at, updated_at) VALUES ($1, $2, $3, 1, $4, $4)`, [randomUUID(), playerId, skillId, now()])).rejects.toMatchObject({ code: "23505" });
    await expect(pool.query(`INSERT INTO player_quest_slots (id, player_id, skill_id, slot_number, created_at, updated_at) VALUES ($1, $2, $3, 4, $4, $4)`, [randomUUID(), playerId, skillId, now()])).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects focus outside 1 through 10", async () => {
    const { playerId } = await userAndPlayer();
    const skillId = await skill();
    await expect(pool.query(`INSERT INTO player_skill_focus (player_id, skill_id, focus_points, updated_at) VALUES ($1, $2, 0, $3)`, [playerId, skillId, now()])).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects quest XP outside the allowed range", async () => {
    await expect(pool.query(
      `INSERT INTO quest_definitions (id, stable_key, title, short_description, difficulty, base_xp, estimated_minutes, completion_type, completion_target, created_at, updated_at)
       VALUES ($1, $2, 'Bad XP', 'Bad XP', 'EASY', 49, 10, 'SINGLE', 1, $3, $3)`,
      [randomUUID(), `quest-${randomUUID()}`, now()],
    )).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects duplicate family and difficulty", async () => {
    const familyId = randomUUID();
    await pool.query(`INSERT INTO quest_families (id, stable_key, name, created_at, updated_at) VALUES ($1, $2, 'Family', $3, $3)`, [familyId, `family-${familyId}`, now()]);
    await questDefinition(familyId);
    await expect(questDefinition(familyId)).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects duplicate challenge windows", async () => {
    const { playerId } = await userAndPlayer();
    const start = now();
    const end = new Date(start.getTime() + 86_400_000);
    await pool.query(`INSERT INTO challenge_sets (id, player_id, pool_type, window_start_at, window_end_at, created_at, updated_at) VALUES ($1, $2, 'DAILY', $3, $4, $3, $3)`, [randomUUID(), playerId, start, end]);
    await expect(pool.query(`INSERT INTO challenge_sets (id, player_id, pool_type, window_start_at, window_end_at, created_at, updated_at) VALUES ($1, $2, 'DAILY', $3, $4, $3, $3)`, [randomUUID(), playerId, start, end])).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects duplicate rewards for one player quest", async () => {
    const { playerId } = await userAndPlayer();
    const questId = await playerQuest(playerId, await questDefinition());
    const values = [randomUUID(), randomUUID(), questId];
    await pool.query(`INSERT INTO quest_rewards (id, operation_id, player_quest_id, base_xp, final_overall_xp) VALUES ($1, $2, $3, 100, 100)`, values);
    await expect(pool.query(`INSERT INTO quest_rewards (id, operation_id, player_quest_id, base_xp, final_overall_xp) VALUES ($1, $2, $3, 100, 100)`, [randomUUID(), randomUUID(), questId])).rejects.toMatchObject({ code: "23505" });
  });

  it("allows negative XP only for skill-scoped quest failure", async () => {
    const { playerId } = await userAndPlayer();
    const skillId = await skill();
    await pool.query(`INSERT INTO xp_transactions (id, operation_id, player_id, skill_id, xp_scope, transaction_type, amount) VALUES ($1, $2, $3, $4, 'SKILL', 'QUEST_FAILURE', -10)`, [randomUUID(), randomUUID(), playerId, skillId]);
    await expect(pool.query(`INSERT INTO xp_transactions (id, operation_id, player_id, xp_scope, transaction_type, amount) VALUES ($1, $2, $3, 'OVERALL', 'OTHER', -10)`, [randomUUID(), randomUUID(), playerId])).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects negative current Skill XP and levels above 100", async () => {
    const { playerId } = await userAndPlayer();
    const skillId = await skill();
    await expect(pool.query(`INSERT INTO player_skill_progress (player_id, skill_id, current_xp, updated_at) VALUES ($1, $2, -1, $3)`, [playerId, skillId, now()])).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query(`INSERT INTO player_skill_progress (player_id, skill_id, current_level, updated_at) VALUES ($1, $2, 101, $3)`, [playerId, skillId, now()])).rejects.toMatchObject({ code: "23514" });
  });
});
