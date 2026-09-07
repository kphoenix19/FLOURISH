import { gameConfig } from "../../config/game";

export function localDate(at: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
export function advanceStreak(current: number, longest: number, lastDate: string | null, completionDate: string) {
  const gap = lastDate === null ? null : dayNumber(completionDate) - dayNumber(lastDate);
  const days = gap === 0 ? current : gap === 1 ? current + 1 : 1;
  return { currentStreakDays: days, longestStreakDays: Math.max(longest, days), lastQualifyingDate: completionDate };
}
export function streakBonusPercent(days: number) {
  return gameConfig.streaks.tiers.find((tier) => days >= tier.minDays && (tier.maxDays === null || days <= tier.maxDays))!.bonusPercent;
}
export function effectiveStreakDays(current: number, lastDate: Date | null, now: Date, timezone: string) {
  if (!lastDate) return 0;
  return dayNumber(localDate(now, timezone)) - dayNumber(lastDate.toISOString().slice(0, 10)) <= 1 ? current : 0;
}
