import { z } from "zod";

export const jobConfig = z.object({
  batchSize: z.number().int().min(1).max(500),
  cadence: z.object({ reconciliation: z.string().min(1) }),
}).parse({
  batchSize: 50,
  cadence: { reconciliation: "hourly" },
});
