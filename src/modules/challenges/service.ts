import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { gameConfig } from "../../config/game";
import { ServiceError } from "../../lib/service-error";
import { assertOnboardingIntegrity } from "../player/services";
import { catchUpModifiers, type RandomSource } from "../quests/standard/selection";
import { validateQuestSkillAllocation, validateQuestVarietyTags } from "../quests/domain/allocations";
import { definitionInclude, previewSnapshots } from "../quests/standard/content";
import { allocateLargestRemainder, percentRoundHalfUp } from "../progression/math";
import { overallLevelForXp, skillLevelForXp } from "../progression/levels";
import { advanceStreak, localDate, streakBonusPercent } from "../progression/streaks";
import { challengeWindow } from "./windows";
import { selectChallengeSet } from "./selection";

const setInclude = { quests: { include: { questDefinition: { include: definitionInclude }, skillSnapshots: true, reward: { include: { skillRewards: true } } }, orderBy: { assignedAt: "asc" as const } } } satisfies Prisma.ChallengeSetInclude;
type Context = Awaited<ReturnType<typeof context>>;
async function context(tx: Prisma.TransactionClient, playerId: string) {
  await tx.$executeRaw`LOCK TABLE skills, variety_tags, quest_definitions, quest_skills, quest_variety_tags IN SHARE MODE`;
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM players WHERE id=${playerId}::uuid FOR UPDATE`;
  if (!locked.length) throw new ServiceError(404, "PLAYER_NOT_FOUND", "Player not found.");
  const state = await assertOnboardingIntegrity(tx, playerId); const progress = await tx.playerSkillProgress.findMany({ where: { playerId } });
  return { tx, playerId, state, progress };
}
const transaction = <T>(db: PrismaClient, playerId: string, fn: (c: Context) => Promise<T>) => db.$transaction(async (tx) => fn(await context(tx, playerId)), { maxWait: 10_000, timeout: 20_000 });
const expired = (set: { windowEndAt: Date | null }, now: Date) => !set.windowEndAt || now.getTime() >= set.windowEndAt.getTime();
async function expireSets(c: Context, now: Date) {
  const result = await c.tx.playerQuest.updateMany({ where: { playerId: c.playerId, poolType: { in: ["DAILY", "WEEKLY"] }, status: { in: ["AVAILABLE", "ACCEPTED"] }, windowEndAt: { lte: now } }, data: { status: "EXPIRED", expiredAt: now } });
  if (result.count) await c.tx.playerRecommendation.updateMany({ where: { playerId: c.playerId, invalidatedAt: null }, data: { invalidatedAt: now } });
  return result.count;
}
async function ensureSet(c: Context, poolType: "DAILY" | "WEEKLY", now: Date, random: RandomSource) {
  // The indexed latest persisted period owns this pool until its UTC deadline,
  // even when all its quests are completed or the timezone preference changes.
  const latest = await c.tx.challengeSet.findFirst({ where: { playerId: c.playerId, poolType }, orderBy: { windowStartAt: "desc" }, include: setInclude });
  if (latest && latest.windowEndAt > now) {
    return latest.windowStartAt <= now ? latest : { nextStartsAt: latest.windowStartAt };
  }
  const window = challengeWindow(poolType, now, c.state.player.timezone!);
  // A full local-calendar period must not overlap the previous stored period.
  // Wait without persisting a set or assignments; missed periods are not backfilled.
  if (latest && window.start < latest.windowEndAt) return { nextStartsAt: window.end };
  const opposite = poolType === "DAILY" ? "WEEKLY" : "DAILY"; const overlapping = await c.tx.playerQuest.findMany({ where: { playerId: c.playerId, poolType: opposite, status: { in: ["AVAILABLE", "ACCEPTED"] }, windowStartAt: { lt: window.end }, windowEndAt: { gt: window.start } }, select: { questDefinitionId: true } });
  const definitions = await c.tx.questDefinition.findMany({ where: { active: true, reviewStatus: "APPROVED", [poolType === "DAILY" ? "dailyEligible" : "weeklyEligible"]: true, difficulty: { not: "LEGENDARY" } }, include: definitionInclude, orderBy: { stableKey: "asc" } });
  const focus = Object.fromEntries(c.state.rows.map((r) => [r.skillId, r.focusPoints])); const catchUp = catchUpModifiers(c.progress.map((p) => ({ ...p, code: c.state.skills.find((s) => s.id === p.skillId)!.code })));
  const candidates = definitions.flatMap((d) => { const primary = d.skills.find((s) => s.isPrimary); return primary && d.skills.reduce((n, s) => n + s.rewardPercent, 0) === 100 ? [{ ...d, primarySkillId: primary.skillId }] : []; });
  const count = poolType === "DAILY" ? gameConfig.challenges.dailyCount : gameConfig.challenges.weeklyCount; const selected = selectChallengeSet(candidates, count, poolType, focus, catchUp, new Set(overlapping.map((q) => q.questDefinitionId)), random);
  if (!selected) throw new ServiceError(503, "NO_CHALLENGE_SET", `A valid ${poolType.toLowerCase()} Challenge set cannot be generated.`);
  const set = await c.tx.challengeSet.create({ data: { playerId: c.playerId, poolType, windowStartAt: window.start, windowEndAt: window.end } });
  for (const d of selected) { const q = await c.tx.playerQuest.create({ data: { playerId: c.playerId, challengeSetId: set.id, questDefinitionId: d.id, poolType, status: "AVAILABLE", currentProgress: 0, windowStartAt: window.start, windowEndAt: window.end, ...previewSnapshots(d) } }); await c.tx.questInteraction.create({ data: { playerId: c.playerId, playerQuestId: q.id, questDefinitionId: d.id, interactionType: "SHOWN" } }); }
  return c.tx.challengeSet.findUniqueOrThrow({ where: { id: set.id }, include: setInclude });
}
function mapSet(set: Prisma.ChallengeSetGetPayload<{ include: typeof setInclude }>, codes: Record<string, string>) { return { id: set.id, poolType: set.poolType, windowStartAt: set.windowStartAt.toISOString(), windowEndAt: set.windowEndAt.toISOString(), completedCount: set.quests.filter((q) => q.status === "COMPLETED").length, totalCount: set.quests.length, setBonusXp: set.poolType === "DAILY" ? gameConfig.challenges.dailySetBonusOverallXp : gameConfig.challenges.weeklySetBonusOverallXp, setBonusAwarded: Boolean(set.setBonusAwardedAt), quests: set.quests.map((q) => ({ id: q.id, title: q.status === "AVAILABLE" ? q.questDefinition.title : q.titleSnapshot ?? q.questDefinition.title, description: q.status === "AVAILABLE" ? q.questDefinition.shortDescription : q.descriptionSnapshot ?? q.questDefinition.shortDescription, difficulty: q.difficultySnapshot, baseXp: q.baseXpSnapshot, estimatedMinutes: q.estimatedMinutesSnapshot ?? q.questDefinition.estimatedMinutes, completionType: q.completionTypeSnapshot, target: q.completionTargetSnapshot, currentProgress: q.currentProgress, status: q.status, poolType: q.poolType as "DAILY" | "WEEKLY", windowEndAt: q.windowEndAt!.toISOString(), skills: (q.status === "AVAILABLE" ? q.questDefinition.skills : q.skillSnapshots).map((skill) => ({ skillCode: codes[skill.skillId], rewardPercent: skill.rewardPercent, isPrimary: skill.isPrimary })), primarySkill: codes[q.questDefinition.skills.find((s) => s.isPrimary)!.skillId], challengeBonusPercent: q.poolType === "DAILY" ? gameConfig.challenges.dailyCompletionBonusPercent : gameConfig.challenges.weeklyCompletionBonusPercent })) } }
function mapPeriods(c: Context, daily: Awaited<ReturnType<typeof ensureSet>>, weekly: Awaited<ReturnType<typeof ensureSet>>) {
  const codes = skillCodes(c);
  return {
    timezone: c.state.player.timezone!,
    daily: "nextStartsAt" in daily ? null : mapSet(daily, codes),
    weekly: "nextStartsAt" in weekly ? null : mapSet(weekly, codes),
    nextDailyStartsAt: "nextStartsAt" in daily ? daily.nextStartsAt.toISOString() : null,
    nextWeeklyStartsAt: "nextStartsAt" in weekly ? weekly.nextStartsAt.toISOString() : null,
  };
}
const skillCodes = (c: Context) => Object.fromEntries(c.state.skills.map((s) => [s.id, s.code]));
export function getChallengeState(db: PrismaClient, playerId: string, options: { now?: () => Date; random?: RandomSource } = {}) { return transaction(db, playerId, async (c) => { const now = (options.now ?? (() => new Date()))(); await expireSets(c, now); const daily = await ensureSet(c, "DAILY", now, options.random ?? Math.random); const weekly = await ensureSet(c, "WEEKLY", now, options.random ?? Math.random); return mapPeriods(c, daily, weekly); }); }

export function reconcilePlayerChallenges(db: PrismaClient, playerId: string, options: { now?: Date; random?: RandomSource } = {}) {
  return transaction(db, playerId, async (c) => {
    const now = options.now ?? new Date();
    const expiredCount = await expireSets(c, now);
    const before = await c.tx.challengeSet.count({ where: { playerId } });
    await ensureSet(c, "DAILY", now, options.random ?? Math.random);
    await ensureSet(c, "WEEKLY", now, options.random ?? Math.random);
    const after = await c.tx.challengeSet.count({ where: { playerId } });
    return { expiredCount, challengeSetsCreated: after - before };
  });
}

async function complete(c: Context, q: Prisma.PlayerQuestGetPayload<{ include: { skillSnapshots: true } }>, now: Date) {
  const operationId = randomUUID(); const codes = Object.fromEntries(c.state.skills.map((s) => [s.id, s.code])); const base = allocateLargestRemainder(q.baseXpSnapshot, q.skillSnapshots.map((s) => ({ key: codes[s.skillId], weight: s.rewardPercent }))); const lowest = [...c.progress].sort((a,b) => a.currentLevel-b.currentLevel || a.currentXp-b.currentXp || codes[a.skillId].localeCompare(codes[b.skillId]))[0].skillId; const streaks = await c.tx.playerSkillStreak.findMany({ where: { playerId: c.playerId } }); const day = localDate(now, c.state.player.timezone!); const challengePercent = q.poolType === "DAILY" ? gameConfig.challenges.dailyCompletionBonusPercent : gameConfig.challenges.weeklyCompletionBonusPercent;
  const rewards = q.skillSnapshots.map((s) => { const prior = streaks.find((x) => x.skillId === s.skillId)!; const streak = advanceStreak(prior.currentStreakDays, prior.longestStreakDays, prior.lastQualifyingDate?.toISOString().slice(0,10) ?? null, day); const baseSkillXp=base[codes[s.skillId]]; const catchUpBonusXp=s.skillId===lowest?percentRoundHalfUp(baseSkillXp,gameConfig.catchUp.xpBonusPercent):0; const streakBonusXp=percentRoundHalfUp(baseSkillXp,streakBonusPercent(streak.currentStreakDays)); const challengeBonusXp=percentRoundHalfUp(baseSkillXp,challengePercent); return {s,streak,baseSkillXp,catchUpBonusXp,streakBonusXp,challengeBonusXp,finalSkillXp:baseSkillXp+catchUpBonusXp+streakBonusXp+challengeBonusXp}; }); const finalOverallXp=rewards.reduce((n,r)=>n+r.finalSkillXp,0);
  const reward=await c.tx.questReward.create({data:{operationId,playerQuestId:q.id,baseXp:q.baseXpSnapshot,catchUpBonusXp:rewards.reduce((n,r)=>n+r.catchUpBonusXp,0),streakBonusXp:rewards.reduce((n,r)=>n+r.streakBonusXp,0),challengeBonusXp:rewards.reduce((n,r)=>n+r.challengeBonusXp,0),finalOverallXp,calculatedAt:now}});
  for(const r of rewards){await c.tx.questSkillReward.create({data:{questRewardId:reward.id,skillId:r.s.skillId,rewardPercent:r.s.rewardPercent,baseSkillXp:r.baseSkillXp,bonusSkillXp:r.catchUpBonusXp+r.streakBonusXp+r.challengeBonusXp,catchUpBonusXp:r.catchUpBonusXp,streakBonusXp:r.streakBonusXp,challengeBonusXp:r.challengeBonusXp,finalSkillXp:r.finalSkillXp}});const p=c.progress.find((x)=>x.skillId===r.s.skillId)!;const next=p.currentXp+r.finalSkillXp;await c.tx.playerSkillProgress.update({where:{playerId_skillId:{playerId:c.playerId,skillId:r.s.skillId}},data:{currentXp:next,lifetimeXp:{increment:r.finalSkillXp},currentLevel:skillLevelForXp(next)}});await c.tx.playerSkillStreak.update({where:{playerId_skillId:{playerId:c.playerId,skillId:r.s.skillId}},data:{...r.streak,lastQualifyingDate:new Date(`${day}T00:00:00Z`)}});for(const xpScope of ["SKILL","LIFETIME_SKILL"] as const)await c.tx.xpTransaction.create({data:{operationId,playerId:c.playerId,playerQuestId:q.id,skillId:r.s.skillId,xpScope,transactionType:"QUEST_COMPLETION",amount:r.finalSkillXp,createdAt:now}});p.currentXp=next;p.lifetimeXp+=r.finalSkillXp;p.currentLevel=skillLevelForXp(next);}
  const overall=await c.tx.playerProgress.findUniqueOrThrow({where:{playerId:c.playerId}});await c.tx.playerProgress.update({where:{playerId:c.playerId},data:{overallXp:overall.overallXp+finalOverallXp,overallLevel:overallLevelForXp(overall.overallXp+finalOverallXp)}});await c.tx.xpTransaction.create({data:{operationId,playerId:c.playerId,playerQuestId:q.id,xpScope:"OVERALL",transactionType:"QUEST_COMPLETION",amount:finalOverallXp,createdAt:now}});await c.tx.playerQuest.update({where:{id:q.id},data:{status:"COMPLETED",completedAt:now,currentProgress:q.completionTargetSnapshot}});await c.tx.questInteraction.create({data:{operationId,playerId:c.playerId,playerQuestId:q.id,questDefinitionId:q.questDefinitionId,interactionType:"COMPLETED",createdAt:now}});await c.tx.playerRecommendation.updateMany({where:{playerId:c.playerId,invalidatedAt:null},data:{invalidatedAt:now}});
  const set=await c.tx.challengeSet.findUniqueOrThrow({where:{id:q.challengeSetId!},include:{quests:true}});if(!set.setBonusAwardedAt&&set.quests.every((x)=>x.id===q.id||x.status==="COMPLETED")){const bonus=set.poolType==="DAILY"?gameConfig.challenges.dailySetBonusOverallXp:gameConfig.challenges.weeklySetBonusOverallXp;const setOperation=randomUUID();await c.tx.challengeSet.update({where:{id:set.id},data:{setBonusAwardedAt:now,setBonusOperationId:setOperation}});const latest=await c.tx.playerProgress.findUniqueOrThrow({where:{playerId:c.playerId}});await c.tx.playerProgress.update({where:{playerId:c.playerId},data:{overallXp:latest.overallXp+bonus,overallLevel:overallLevelForXp(latest.overallXp+bonus)}});await c.tx.xpTransaction.create({data:{operationId:setOperation,playerId:c.playerId,xpScope:"OVERALL",transactionType:set.poolType==="DAILY"?"DAILY_SET_BONUS":"WEEKLY_SET_BONUS",amount:bonus,createdAt:now}});}
}
export type ChallengeAction="accept"|"complete"|"increment"|"decrement";
export async function mutateChallenge(db:PrismaClient,playerId:string,questId:string,action:ChallengeAction,options:{now?:()=>Date}={}){const result=await transaction(db,playerId,async(c)=>{const now=(options.now??(()=>new Date()))();await expireSets(c,now);const q=await c.tx.playerQuest.findFirst({where:{id:questId,playerId,poolType:{in:["DAILY","WEEKLY"]}},include:{skillSnapshots:true,questDefinition:{include:definitionInclude}}});if(!q)throw new ServiceError(404,"CHALLENGE_NOT_FOUND","Challenge not found.");if(expired(q,now)||q.status==="EXPIRED")return{expired:true as const};if(action==="accept"){if(q.status==="ACCEPTED")return{state:await getStateInTransaction(c,now)};if(q.status!=="AVAILABLE")throw new ServiceError(409,"INVALID_STATUS","Only an available Challenge can be accepted.");
// The library SHARE lock remains held through snapshot creation and commit.
// Repeated acceptance and completion use the already accepted snapshots above/below.
const definition = q.questDefinition;
const band = gameConfig.quests.difficultyXpBands[definition.difficulty];
if (!definition.active || definition.reviewStatus !== "APPROVED"
  || !(q.poolType === "DAILY" ? definition.dailyEligible : definition.weeklyEligible)
  || definition.difficulty === "LEGENDARY" || !validateQuestSkillAllocation(definition.skills).success
  || !validateQuestVarietyTags(definition.varietyTags).success
  || definition.baseXp < band.min || definition.baseXp > band.max
  || definition.estimatedMinutes <= 0 || !definition.title.trim() || !definition.shortDescription.trim()
  || (definition.completionType === "SINGLE" ? definition.completionTarget !== 1 : definition.completionTarget <= 1)) {
  throw new ServiceError(409, "OFFER_CHANGED", "This Challenge is no longer eligible for acceptance.");
}
await c.tx.playerQuestSkillSnapshot.createMany({data:q.questDefinition.skills.map((s)=>({playerQuestId:q.id,skillId:s.skillId,isPrimary:s.isPrimary,rewardPercent:s.rewardPercent}))});await c.tx.playerQuest.update({where:{id:q.id},data:{...previewSnapshots(q.questDefinition),status:"ACCEPTED",acceptedAt:now}});await c.tx.questInteraction.create({data:{playerId,playerQuestId:q.id,questDefinitionId:q.questDefinitionId,interactionType:"ACCEPTED",createdAt:now}});}else{if(q.status!=="ACCEPTED")throw new ServiceError(409,"INVALID_STATUS","Only an accepted Challenge can progress.");if(action==="complete"&&q.completionTypeSnapshot!=="SINGLE")throw new ServiceError(409,"COUNT_REQUIRES_PROGRESS","Use progress controls for a COUNT Challenge.");if((action==="increment"||action==="decrement")&&q.completionTypeSnapshot!=="COUNT")throw new ServiceError(409,"SINGLE_REQUIRES_COMPLETE","Use Complete for a SINGLE Challenge.");if(action==="decrement")await c.tx.playerQuest.update({where:{id:q.id},data:{currentProgress:Math.max(0,q.currentProgress-1)}});else if(action==="increment"&&q.currentProgress+1<q.completionTargetSnapshot)await c.tx.playerQuest.update({where:{id:q.id},data:{currentProgress:q.currentProgress+1}});else await complete(c,q,now);}return{state:await getStateInTransaction(c,now)};});if("expired" in result)throw new ServiceError(409,"CHALLENGE_EXPIRED","This Challenge has expired.");return result.state;}
async function getStateInTransaction(c: Context, now: Date) {
  // Mutations may be the first request after rollover. Create response prerequisites
  // under the existing Player lock, in the same order as ordinary lazy reconciliation.
  const daily = await ensureSet(c, "DAILY", now, Math.random);
  const weekly = await ensureSet(c, "WEEKLY", now, Math.random);
  return mapPeriods(c, daily, weekly);
}
export type ChallengeState=Awaited<ReturnType<typeof getChallengeState>>;
