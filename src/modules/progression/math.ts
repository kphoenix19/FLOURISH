export type WeightedShare = { key: string; weight: number };
export function allocateLargestRemainder(total: number, shares: WeightedShare[]) {
  if (!Number.isSafeInteger(total) || total < 0) throw new RangeError("Total must be a non-negative safe integer.");
  if (!shares.length || shares.some((s) => !Number.isSafeInteger(s.weight) || s.weight < 0)) throw new RangeError("Weights must be non-negative integers.");
  const weightTotal = shares.reduce((sum, s) => sum + s.weight, 0);
  if (weightTotal <= 0) throw new RangeError("Weights must have a positive total.");
  const rows = shares.map((s) => ({ ...s, amount: Math.floor(total * s.weight / weightTotal), remainder: (total * s.weight) % weightTotal }));
  let remaining = total - rows.reduce((sum, row) => sum + row.amount, 0);
  for (const row of [...rows].sort((a, b) => b.remainder - a.remainder || a.key.localeCompare(b.key))) if (remaining-- > 0) row.amount++;
  return Object.fromEntries(rows.map((row) => [row.key, row.amount]));
}
export function percentRoundHalfUp(amount: number, percent: number) {
  if (![amount, percent].every(Number.isSafeInteger) || amount < 0 || percent < 0) throw new RangeError("Amount and percent must be non-negative safe integers.");
  return Math.floor((amount * percent + 50) / 100);
}
