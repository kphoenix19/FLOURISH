import { z } from "zod";

export const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  AUTH_SECRET: z.string().min(24).optional(),
  AUTH_GOOGLE_ID: z.string().min(1).optional(),
  AUTH_GOOGLE_SECRET: z.string().min(1).optional(),
});

export function parseServerEnv(environment: NodeJS.ProcessEnv) {
  return serverEnvSchema.parse(environment);
}
