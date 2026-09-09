import { describe, expect, it } from "vitest";
import { jobConfig } from "../../src/config/jobs";

describe("job configuration", () => {
  it("uses a bounded Build 1 reconciliation batch and documented cadence", () => {
    expect(jobConfig.batchSize).toBeGreaterThan(0);
    expect(jobConfig.batchSize).toBeLessThanOrEqual(500);
    expect(jobConfig.cadence.reconciliation).toBe("hourly");
  });
});
