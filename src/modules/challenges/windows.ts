import { localDate, mondayWeekStart } from "../progression/streaks";

function parts(at: Date, timezone: string) {
  const values = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(at);
  return Object.fromEntries(values.filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]));
}
export function localMidnightUtc(date: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number); let guess = Date.UTC(year, month - 1, day);
  for (let i = 0; i < 3; i++) { const p = parts(new Date(guess), timezone); const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second); guess += Date.UTC(year, month - 1, day) - represented; }
  return new Date(guess);
}
const addDays = (date: string, days: number) => { const at = new Date(`${date}T00:00:00Z`); at.setUTCDate(at.getUTCDate() + days); return at.toISOString().slice(0, 10); };
export function challengeWindow(poolType: "DAILY" | "WEEKLY", now: Date, timezone: string) {
  const today = localDate(now, timezone); const startDate = poolType === "DAILY" ? today : mondayWeekStart(today); const endDate = addDays(startDate, poolType === "DAILY" ? 1 : 7);
  return { start: localMidnightUtc(startDate, timezone), end: localMidnightUtc(endDate, timezone) };
}
