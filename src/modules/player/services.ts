import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import { ServiceError } from "../../lib/service-error";
import { FLOURISH_SKILL_CODES, validateFocusAllocation } from "./domain/focus";
import { focusSchema, onboardingSchema, timezoneUpdateSchema } from "./domain/input";
import { isIanaTimezone } from "./domain/timezone";

type Db = PrismaClient | Prisma.TransactionClient;

export async function ensurePlayerForUser(db: PrismaClient, userId: string) {
  // Native unique-key upsert handles simultaneous first-session callbacks.
  return db.player.upsert({ where: { userId }, create: { userId }, update: { userId } });
}

export async function canonicalSkills(db: Db) {
  const skills = await db.skill.findMany({ where: { active: true }, select: { id: true, code: true, name: true, description: true } });
  if (skills.length !== 8 || FLOURISH_SKILL_CODES.some((c) => !skills.some((s) => s.code === c))) {
    throw new ServiceError(503, "SEED_REQUIRED", "The eight active FLOURISH Skills are missing or incomplete. Run db:seed before onboarding.");
  }
  return FLOURISH_SKILL_CODES.map((c) => skills.find((s) => s.code === c)!);
}

async function lockPlayer(tx: Prisma.TransactionClient, userId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM players WHERE user_id = ${userId}::uuid FOR UPDATE`;
  if (!rows[0]) throw new ServiceError(409, "PLAYER_MISSING", "Player setup is incomplete. Sign in again.");
  return tx.player.findUniqueOrThrow({ where: { id: rows[0].id } });
}

async function focusState(db: Db, playerId: string, skills: Awaited<ReturnType<typeof canonicalSkills>>) {
  const rows = await db.playerSkillFocus.findMany({ where: { playerId } });
  const allocation = Object.fromEntries(rows.map((r) => [skills.find((s) => s.id === r.skillId)?.code ?? "UNKNOWN", r.focusPoints]));
  return { rows, allocation };
}

export async function assertOnboardingIntegrity(db: Db, playerId: string) {
  const player = await db.player.findUnique({ where: { id: playerId } });
  const skills = await canonicalSkills(db);
  const { rows, allocation } = await focusState(db, playerId, skills);
  const [progress, skillProgress, streaks] = await Promise.all([
    db.playerProgress.findUnique({ where: { playerId } }),
    db.playerSkillProgress.findMany({ where: { playerId } }),
    db.playerSkillStreak.findMany({ where: { playerId } }),
  ]);
  if (!player?.onboardingCompletedAt || !isIanaTimezone(player.timezone) || rows.length !== 8 || !validateFocusAllocation(allocation).success || !progress || skillProgress.length !== 8 || streaks.length !== 8 || skills.some((s) => !skillProgress.some((p) => p.skillId === s.id) || !streaks.some((p) => p.skillId === s.id))) {
    throw new ServiceError(409, "ONBOARDING_INTEGRITY", "Player setup is inconsistent. Contact support before changing it.");
  }
  return { player, skills, rows, allocation };
}

export async function completeOnboarding(db: PrismaClient, userId: string, input: unknown) {
  const data = onboardingSchema.parse(input);
  return db.$transaction(async (tx) => {
    const player = await lockPlayer(tx, userId);
    const skills = await canonicalSkills(tx);
    if (player.onboardingCompletedAt) {
      const state = await assertOnboardingIntegrity(tx, player.id);
      if (player.timezone !== data.timezone || data.focus.some((r) => state.allocation[r.skillCode] !== r.points)) {
        throw new ServiceError(409, "ALREADY_ONBOARDED", "Onboarding is already complete. Use Settings to change Focus or timezone.");
      }
      return { playerId: player.id, onboardingCompletedAt: player.onboardingCompletedAt, alreadyCompleted: true };
    }
    // A partial prior Focus choice cannot be represented honestly as initial history.
    if (await tx.playerSkillFocus.count({ where: { playerId: player.id } }) || await tx.playerSkillFocusHistory.count({ where: { playerId: player.id } })) {
      throw new ServiceError(409, "PARTIAL_FOCUS", "An incomplete Focus setup already exists. Contact support.");
    }
    const allocationChangeId = randomUUID();
    const rows = data.focus.map((r) => ({ playerId: player.id, skillId: skills.find((s) => s.code === r.skillCode)!.id, focusPoints: r.points }));
    await tx.playerSkillFocus.createMany({ data: rows });
    await tx.playerSkillFocusHistory.createMany({ data: rows.map(({ focusPoints, ...r }) => ({ ...r, oldFocusPoints: null, newFocusPoints: focusPoints, allocationChangeId })) });
    await tx.playerProgress.upsert({ where: { playerId: player.id }, create: { playerId: player.id }, update: {} });
    await tx.playerSkillProgress.createMany({ data: skills.map((s) => ({ playerId: player.id, skillId: s.id })), skipDuplicates: true });
    await tx.playerSkillStreak.createMany({ data: skills.map((s) => ({ playerId: player.id, skillId: s.id })), skipDuplicates: true });
    const updated = await tx.player.update({ where: { id: player.id }, data: { timezone: data.timezone, onboardingCompletedAt: new Date() } });
    await assertOnboardingIntegrity(tx, player.id);
    return { playerId: player.id, onboardingCompletedAt: updated.onboardingCompletedAt, alreadyCompleted: false };
  });
}

export async function respecFocus(db: PrismaClient, userId: string, input: unknown) {
  const data = focusSchema.parse(input);
  return db.$transaction(async (tx) => {
    const player = await lockPlayer(tx, userId);
    const state = await assertOnboardingIntegrity(tx, player.id);
    const allocationChangeId = randomUUID();
    let changed = 0;
    for (const r of data.focus) {
      const skillId = state.skills.find((s) => s.code === r.skillCode)!.id;
      const previous = state.rows.find((s) => s.skillId === skillId)!.focusPoints;
      if (previous === r.points) continue;
      await tx.playerSkillFocus.update({ where: { playerId_skillId: { playerId: player.id, skillId } }, data: { focusPoints: r.points } });
      await tx.playerSkillFocusHistory.create({ data: { playerId: player.id, skillId, oldFocusPoints: previous, newFocusPoints: r.points, allocationChangeId } });
      changed++;
    }
    return { changed, allocationChangeId: changed ? allocationChangeId : null };
  });
}

export async function updateTimezone(db: PrismaClient, userId: string, input: unknown) {
  const { timezone } = timezoneUpdateSchema.parse(input);
  return db.$transaction(async (tx) => {
    const player = await lockPlayer(tx, userId);
    await assertOnboardingIntegrity(tx, player.id);
    await tx.player.update({ where: { id: player.id }, data: { timezone } });
    return { timezone };
  });
}

export async function playerSummary(db: PrismaClient, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: {
    id: true, email: true, role: true, player: { select: {
      id: true, timezone: true, onboardingCompletedAt: true,
      progress: { select: { overallXp: true, overallLevel: true } },
      focus: { select: { focusPoints: true, skill: { select: { code: true } } } },
    } },
  } });
  if (!user) throw new ServiceError(401, "UNAUTHENTICATED", "Sign in to continue.");
  return user;
}
