import type { Prisma, PrismaClient } from "../../../generated/prisma/client";
import { assertOnboardingIntegrity } from "../../player/services";
import { ServiceError } from "../../../lib/service-error";
import { gameConfig } from "../../../config/game";
import { catchUpModifiers, primaryTag, type SelectionContext } from "./selection";
import { definitionInclude, validDefinition } from "./content";

export const slotInclude = { skill: true, currentPlayerQuest: { include: { questDefinition: { include: definitionInclude }, skillSnapshots: true } } } satisfies Prisma.PlayerQuestSlotInclude;
export type Slot = Prisma.PlayerQuestSlotGetPayload<{ include: typeof slotInclude }>;
export async function standardContext(tx: Prisma.TransactionClient, playerId: string) {
  // Lock order is library, then Player. Shared library locks allow concurrent players
  // while preventing a seed/admin edit from tearing acceptance-time relations.
  await tx.$executeRaw`LOCK TABLE skills, variety_tags, quest_families, quest_definitions, quest_skills, quest_variety_tags IN SHARE MODE`;
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM players WHERE id = ${playerId}::uuid FOR UPDATE`;
  if (!rows.length) throw new ServiceError(404, "PLAYER_NOT_FOUND", "Player not found.");
  const state = await assertOnboardingIntegrity(tx, playerId);
  const progress = await tx.playerSkillProgress.findMany({ where: { playerId } });
  const definitions = await tx.questDefinition.findMany({ where: { active: true, reviewStatus: "APPROVED", standardEligible: true }, include: definitionInclude, orderBy: { stableKey: "asc" } });
  const ids = new Set(state.skills.map((s) => s.id));
  const focus = Object.fromEntries(state.rows.map((r) => [r.skillId, r.focusPoints]));
  const catchUp = catchUpModifiers(progress.map((p) => ({ ...p, code: state.skills.find((s) => s.id === p.skillId)!.code })));
  const recent = new Map<string, SelectionContext["recent"]>();
  for (const skill of state.skills) {
    const completed = await tx.playerQuest.findMany({ where: { playerId, status: "COMPLETED", skillSnapshots: { some: { skillId: skill.id } } }, orderBy: [{ completedAt: "desc" }, { id: "asc" }], take: gameConfig.recommendations.varietyHistoryWindow, include: { questDefinition: { include: definitionInclude } } });
    recent.set(skill.id, completed.map((q) => ({ definitionId: q.questDefinitionId, primaryTagId: primaryTag(q.questDefinition) })));
  }
  return { tx, playerId, state, candidates: (skillId: string) => definitions.filter((q) => validDefinition(q, skillId, ids)),
    selection: (skillId: string, occupied: Set<string>): SelectionContext => ({ level: progress.find((p) => p.skillId === skillId)!.currentLevel, focus, catchUp, occupied, recent: recent.get(skillId)! }),
    valid: (q: Parameters<typeof validDefinition>[0], skillId: string) => validDefinition(q, skillId, ids) };
}
export type StandardContext = Awaited<ReturnType<typeof standardContext>>;
export function standardTransaction<T>(db: PrismaClient, playerId: string, action: (context: StandardContext) => Promise<T>) {
  return db.$transaction(async (tx) => action(await standardContext(tx, playerId)), { maxWait: 10_000, timeout: 20_000 });
}
export async function currentSlots(context: StandardContext) {
  const slots = await context.tx.playerQuestSlot.findMany({ where: { playerId: context.playerId }, include: slotInclude, orderBy: { slotNumber: "asc" } });
  return slots.sort((a, b) => context.state.skills.findIndex((s) => s.id === a.skillId) - context.state.skills.findIndex((s) => s.id === b.skillId) || a.slotNumber - b.slotNumber);
}
export function occupiedDefinitions(slots: Slot[]) { return new Set(slots.flatMap((s) => s.currentPlayerQuest ? [s.currentPlayerQuest.questDefinitionId] : [])); }
