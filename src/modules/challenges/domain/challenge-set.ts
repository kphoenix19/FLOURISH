export type ChallengePoolType = "DAILY" | "WEEKLY";

export function isChallengePoolType(poolType: string): poolType is ChallengePoolType {
  return poolType === "DAILY" || poolType === "WEEKLY";
}
