import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadCanonicalSeed } from "../../src/modules/quests/seed/load";
import { validateCanonicalSeed } from "../../src/modules/quests/seed/validate";
import { persistCanonicalSeed } from "../../src/modules/quests/seed/persist";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL must point to the dedicated integration-test database.");
// These tests own a random schema. Never truncate the application's public tables.
const schema = `seed_test_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({ connectionString });
const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
const db = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
const canonical = validateCanonicalSeed(loadCanonicalSeed());
// Several cases import the complete library three times on local Docker PostgreSQL.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

beforeAll(async () => {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  for (const name of readdirSync(resolve("prisma/migrations")).sort()) {
    if (/^\d/.test(name)) await pool.query(readFileSync(resolve("prisma/migrations", name, "migration.sql"), "utf8"));
  }
});
beforeEach(async () => {
  await pool.query("TRUNCATE users, skills, quest_families, quest_definitions, context_tags CASCADE");
});
afterAll(async () => {
  await db.$disconnect();
  await pool.end();
  await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.end();
});

async function snapshot() {
  const [skills, tags, families, quests, allocations, variety, context] = await Promise.all([
    db.skill.findMany({ orderBy: { code: "asc" } }),
    db.varietyTag.findMany({ orderBy: { id: "asc" } }),
    db.questFamily.findMany({ orderBy: { stableKey: "asc" } }),
    db.questDefinition.findMany({ orderBy: { stableKey: "asc" } }),
    db.questSkill.findMany({ orderBy: [{ questDefinitionId: "asc" }, { skillId: "asc" }] }),
    db.questVarietyTag.findMany({ orderBy: [{ questDefinitionId: "asc" }, { varietyTagId: "asc" }] }),
    db.questContextTag.findMany({ orderBy: [{ questDefinitionId: "asc" }, { contextTagId: "asc" }] }),
  ]);
  // updatedAt records an import touch; every other value and ID must be stable.
  return JSON.parse(JSON.stringify({ skills, tags, families, quests, allocations, variety, context }, (key, value) => key === "updatedAt" ? undefined : value));
}

describe("canonical PostgreSQL seed persistence", () => {
  it("seeds a clean DB and preserves IDs, rows, and values on the second run", async () => {
    await persistCanonicalSeed(db, canonical);
    expect(await db.skill.count()).toBe(8);
    expect(await db.varietyTag.count()).toBe(76);
    expect(await db.questFamily.count()).toBe(15);
    expect(await db.questDefinition.count()).toBe(275);
    expect(await db.questSkill.count()).toBe(317);
    expect(await db.questVarietyTag.count()).toBe(275);
    const before = await snapshot();
    expect((await persistCanonicalSeed(db, canonical)).deactivatedQuests).toBe(0);
    expect(await snapshot()).toEqual(before);
  });
  it("restores canonical values and all joins without altering accepted snapshots", async () => {
    await persistCanonicalSeed(db, canonical);
    const quest = await db.questDefinition.findUniqueOrThrow({ where: { stableKey: "F-WALK-04" } });
    const fitness = await db.skill.findUniqueOrThrow({ where: { code: "F" } });
    const user = await db.user.create({ data: { email: "seed-history@example.test", player: { create: { timezone: "UTC" } } }, include: { player: true } });
    const history = await db.playerQuest.create({ data: {
      playerId: user.player!.id, questDefinitionId: quest.id, poolType: "STANDARD", status: "ACCEPTED", acceptedAt: new Date("2026-09-06T00:00:00Z"), deadlineAt: new Date("2026-09-08T00:00:00Z"),
      difficultySnapshot: "MEDIUM", baseXpSnapshot: 199, completionTypeSnapshot: "SINGLE", completionTargetSnapshot: 1, completionWindowHoursSnapshot: 48, rewardConfigVersionSnapshot: "historical-test",
      skillSnapshots: { create: { skillId: fitness.id, isPrimary: true, rewardPercent: 100 } },
    }, include: { skillSnapshots: true } });
    const context = await db.contextTag.create({ data: { code: "admin-context", displayName: "Admin context" } });
    await db.questContextTag.create({ data: { questDefinitionId: quest.id, contextTagId: context.id } });
    await db.questDefinition.update({ where: { id: quest.id }, data: { title: "Admin changed title", baseXp: 201, reviewedById: user.id } });
    await db.questSkill.deleteMany({ where: { questDefinitionId: quest.id, isPrimary: false } });
    await db.questSkill.updateMany({ where: { questDefinitionId: quest.id }, data: { rewardPercent: 100 } });
    await db.questVarietyTag.deleteMany({ where: { questDefinitionId: quest.id } });
    await persistCanonicalSeed(db, canonical);
    expect(await db.questDefinition.findUnique({ where: { id: quest.id } })).toMatchObject({ title: "Explore Somewhere on Foot", baseXp: 200, reviewedById: null });
    expect(await db.questSkill.findMany({ where: { questDefinitionId: quest.id }, orderBy: { rewardPercent: "desc" } })).toMatchObject([{ rewardPercent: 80 }, { rewardPercent: 20 }]);
    expect(await db.questVarietyTag.count({ where: { questDefinitionId: quest.id } })).toBe(1);
    expect(await db.questContextTag.count()).toBe(0);
    expect(await db.contextTag.count()).toBe(1);
    expect(await db.playerQuest.findUnique({ where: { id: history.id }, include: { skillSnapshots: true } })).toEqual(history);
    const removed = structuredClone(canonical); removed.quests = removed.quests.filter((q) => q.stableKey !== quest.stableKey);
    await persistCanonicalSeed(db, removed);
    expect(await db.questDefinition.findUnique({ where: { id: quest.id } })).toMatchObject({ active: false });
    expect(await db.playerQuest.findUnique({ where: { id: history.id }, include: { skillSnapshots: true } })).toEqual(history);
  });
  it("deactivates only missing seed-managed content and reactivates restored content", async () => {
    await persistCanonicalSeed(db, canonical);
    const existing = await db.questDefinition.findUniqueOrThrow({ where: { stableKey: "F-WALK-04" } });
    const adminQuest = await db.questDefinition.create({ data: { ...existing, id: randomUUID(), stableKey: "ADMIN-QUEST", seedManaged: false } });
    const adminFamily = await db.questFamily.create({ data: { stableKey: "ADMIN_FAMILY", name: "Admin family" } });
    const retiredFamily = await db.questFamily.create({ data: { stableKey: "RETIRED_FAMILY", name: "Retired seed family", seedManaged: true } });
    const fitness = await db.skill.findUniqueOrThrow({ where: { code: "F" } });
    const adminTag = await db.varietyTag.create({ data: { skillId: fitness.id, code: "admin-test", displayName: "Admin", seedManaged: false } });
    const retiredTag = await db.varietyTag.create({ data: { skillId: fitness.id, code: "retired-test", displayName: "Retired", seedManaged: true } });
    const removed = structuredClone(canonical); removed.quests = removed.quests.filter((q) => q.stableKey !== "F-WALK-04");
    expect(await persistCanonicalSeed(db, removed)).toMatchObject({ deactivatedQuests: 1, deactivatedFamilies: 1, deactivatedTags: 1 });
    expect(await db.questDefinition.count()).toBe(276);
    expect(await db.questDefinition.findUnique({ where: { id: adminQuest.id } })).toMatchObject({ active: true, seedManaged: false });
    expect(await db.questFamily.findUnique({ where: { id: adminFamily.id } })).toMatchObject({ active: true });
    expect(await db.questFamily.findUnique({ where: { id: retiredFamily.id } })).toMatchObject({ active: false });
    expect(await db.varietyTag.findUnique({ where: { id: adminTag.id } })).toMatchObject({ active: true });
    expect(await db.varietyTag.findUnique({ where: { id: retiredTag.id } })).toMatchObject({ active: false });
    await persistCanonicalSeed(db, canonical);
    expect(await db.questDefinition.findUnique({ where: { id: existing.id } })).toMatchObject({ active: true });
  });
  it("does not write when validation fails", async () => {
    const bad = structuredClone(canonical); bad.quests[0].baseXp = 1;
    await expect(persistCanonicalSeed(db, bad)).rejects.toThrow("XP outside");
    expect(await db.skill.count()).toBe(0);
    expect(await db.questDefinition.count()).toBe(0);
  });
  it("rolls back a late unique-index failure including metadata and memberships", async () => {
    await persistCanonicalSeed(db, canonical);
    const before = await snapshot();
    const replacement = structuredClone(canonical);
    // A removed historical family member still reserves its tier. A new key cannot steal it.
    replacement.quests.find((q) => q.stableKey === "L-READ-01")!.stableKey = "L-READ-REPLACEMENT";
    replacement.skills[0].description = "Should roll back";
    await expect(persistCanonicalSeed(db, replacement)).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });
  it("rejects non-owned key collisions without claiming or modifying admin content", async () => {
    await persistCanonicalSeed(db, canonical);
    await db.questDefinition.update({ where: { stableKey: "F-WALK-01" }, data: { seedManaged: false, title: "Admin-owned" } });
    const before = await snapshot();
    await expect(persistCanonicalSeed(db, canonical)).rejects.toThrow("collide with non-seed-managed");
    expect(await snapshot()).toEqual(before);
  });
  it("supports valid tier swaps in one transaction", async () => {
    await persistCanonicalSeed(db, canonical);
    const changed = structuredClone(canonical);
    Object.assign(changed.quests.find((q) => q.stableKey === "F-WALK-01")!, { difficulty: "MEDIUM", baseXp: 175 });
    Object.assign(changed.quests.find((q) => q.stableKey === "F-WALK-02")!, { difficulty: "EASY", baseXp: 75 });
    await persistCanonicalSeed(db, changed);
    expect(await db.questDefinition.findUnique({ where: { stableKey: "F-WALK-01" } })).toMatchObject({ difficulty: "MEDIUM" });
    await persistCanonicalSeed(db, canonical);
  });
  it("serializes concurrent seed runs without duplicates", async () => {
    await Promise.all([persistCanonicalSeed(db, canonical), persistCanonicalSeed(db, canonical)]);
    expect(await db.questDefinition.count()).toBe(275);
    expect(await db.questSkill.count()).toBe(317);
    expect(await db.questVarietyTag.count()).toBe(275);
  }, 60_000);
});
