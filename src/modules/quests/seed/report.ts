import type { CanonicalSeed } from "./schema";
import { normalizeTitle } from "./validate";

export function seedReport(seed: CanonicalSeed, review = false): string {
  const qs = seed.quests;
  const lines = [
    `Skills: ${seed.skills.length}`, `Variety Tags: ${seed.varietyTags.length}`,
    `Quest Families: ${seed.families.length}`, `QuestDefinitions: ${qs.length}`,
    "By Skill:",
    ...seed.skills.map((s) => {
      const count = qs.filter((q) => q.skills.some((a) => a.isPrimary && a.skillCode === s.code)).length;
      return `  ${s.name}: ${count}${count < 30 || count > 35 ? " (outside approximate 30-35 target; review quality)" : ""}`;
    }),
    `SINGLE: ${qs.filter((q) => q.completionType === "SINGLE").length}`,
    `COUNT: ${qs.filter((q) => q.completionType === "COUNT").length}`,
    `Standard eligible: ${qs.filter((q) => q.standardEligible).length}`,
    `Daily eligible: ${qs.filter((q) => q.dailyEligible).length}`,
    `Weekly eligible: ${qs.filter((q) => q.weeklyEligible).length}`,
    ...[1, 2, 3].map((n) => `${n} Skill(s): ${qs.filter((q) => q.skills.length === n).length}`),
    "By primary Variety Tag:",
  ];
  for (const t of seed.varietyTags) {
    const rows = qs.filter((q) => q.varietyTags.some((a) => a.isPrimary && a.skillCode === t.skillCode && a.code === t.code));
    lines.push(`  ${t.skillCode}:${t.code}: ${rows.length}`);
    if (review) lines.push(...rows.map((q) => `    ${q.stableKey}: ${q.title}`));
  }
  if (review) {
    lines.push("Title similarity review candidates (heuristic only; not semantic proof):");
    for (let i = 0; i < qs.length; i++) for (let j = i + 1; j < qs.length; j++) {
      const a = qs[i], b = qs[j];
      if (a.skills.find((s) => s.isPrimary)?.skillCode !== b.skills.find((s) => s.isPrimary)?.skillCode) continue;
      const x = new Set(normalizeTitle(a.title).split(" ")), y = new Set(normalizeTitle(b.title).split(" "));
      const overlap = [...x].filter((word) => y.has(word)).length;
      if (overlap / new Set([...x, ...y]).size >= 0.65) lines.push(`  ${a.stableKey} / ${b.stableKey}: ${a.title} / ${b.title}`);
    }
  }
  return lines.join("\n");
}
