import { z } from "zod";

export const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  AUTH_SECRET: z.string().min(24).optional(),
  AUTH_GOOGLE_ID: z.string().min(1).optional(),
  AUTH_GOOGLE_SECRET: z.string().min(1).optional(),
  NEXTAUTH_URL: z.string().url().optional(),
});

export function parseServerEnv(environment: NodeJS.ProcessEnv) {
  return serverEnvSchema.parse(environment);
}

export function oauthConfigurationStatus(environment: NodeJS.ProcessEnv = process.env) {
  const required = ["DATABASE_URL", "AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"] as const;
  const missing = required.filter((key) => !environment[key] || /^replace[-_]/i.test(environment[key]!));
  const invalid = !serverEnvSchema.safeParse(environment).success;
  return { ready: missing.length === 0 && !invalid, missing, invalid };
}
