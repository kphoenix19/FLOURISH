import { currentSlots, occupiedDefinitions, type StandardContext } from "./context";
import { nextFamilyTier } from "./selection";
import { overallProgressWithinLevel, skillProgressWithinLevel } from "../../progression/levels";
import { effectiveStreakDays } from "../../progression/streaks";
import type { ResolutionFeedback } from "./resolution";

export async function standardState(context: StandardContext, now = new Date(), resolution: ResolutionFeedback | null = null) {
  const slots = await currentSlots(context);
  const occupied = occupiedDefinitions(slots);
  const progress = await context.tx.playerProgress.findUniqueOrThrow({ where: { playerId: context.playerId } });
  const streaks = await context.tx.playerSkillStreak.findMany({ where: { playerId: context.playerId } });
  return { overallLevel: progress.overallLevel, overallXp: progress.overallXp, overallProgress: overallProgressWithinLevel(progress.overallXp), resolution, timezone: context.state.player.timezone!,
    skills: context.state.skills.map((skill) => { const skillProgress = context.progress.find((p) => p.skillId === skill.id)!; const streak = streaks.find((s) => s.skillId === skill.id)!; return ({ ...skill, currentXp: skillProgress.currentXp, lifetimeXp: skillProgress.lifetimeXp, currentLevel: skillProgress.currentLevel, levelProgress: skillProgressWithinLevel(skillProgress.currentXp), currentStreakDays: effectiveStreakDays(streak.currentStreakDays, streak.lastQualifyingDate, now, context.state.player.timezone!), longestStreakDays: streak.longestStreakDays, slots: slots.filter((s) => s.skillId === skill.id).map((slot) => {
      const q = slot.currentPlayerQuest!;
      const d = q.questDefinition;
      const available = q.status === "AVAILABLE";
      const bump = available && context.valid(d, skill.id) ? nextFamilyTier(d, context.candidates(skill.id), occupied) : undefined;
      return { id: slot.id, slotNumber: slot.slotNumber, quest: {
        id: q.id, definitionId: d.id, stableKey: d.stableKey, title: available ? d.title : q.titleSnapshot ?? d.title, description: available ? d.shortDescription : q.descriptionSnapshot ?? d.shortDescription, status: q.status,
        difficulty: available ? d.difficulty : q.difficultySnapshot, baseXp: available ? d.baseXp : q.baseXpSnapshot,
        estimatedMinutes: available ? d.estimatedMinutes : q.estimatedMinutesSnapshot ?? d.estimatedMinutes, completionWindowHours: available ? d.completionWindowHours : q.completionWindowHoursSnapshot,
        completionType: available ? d.completionType : q.completionTypeSnapshot, completionTarget: available ? d.completionTarget : q.completionTargetSnapshot,
        skills: (available ? d.skills : q.skillSnapshots).map((s) => ({ skillCode: context.state.skills.find((x) => x.id === s.skillId)!.code, rewardPercent: s.rewardPercent, isPrimary: s.isPrimary })),
        acceptedAt: q.acceptedAt?.toISOString() ?? null, deadlineAt: q.deadlineAt?.toISOString() ?? null,
        failurePenaltyXp: q.failurePenaltyXp, failurePenaltyAppliedAt: q.failurePenaltyAppliedAt?.toISOString() ?? null, clearedAt: q.clearedAt?.toISOString() ?? null,
        canReroll: available, nextDifficulty: bump?.difficulty ?? null,
      } };
    }) }) }) };
}
export type StandardState = Awaited<ReturnType<typeof standardState>>;
