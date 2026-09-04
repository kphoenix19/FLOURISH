import { describe, expect, it } from "vitest";
import { gameConfig, gameConfigSchema } from "@/config/game";

describe("game configuration", () => {
  it("validates the locked Build 1 starting values", () => {
    expect(gameConfig.focus.totalPoints).toBe(46);
    expect(gameConfig.quests.failurePenaltyPercent).toBe(20);
    expect(gameConfig.difficultyDistributions.daily.LEGENDARY).toBe(0);
  });

  it("rejects a difficulty distribution that does not total 100", () => {
    const invalid = structuredClone(gameConfig);
    invalid.difficultyDistributions.daily.EASY = 59;
    expect(gameConfigSchema.safeParse(invalid).success).toBe(false);
  });
});
