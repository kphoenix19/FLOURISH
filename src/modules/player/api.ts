import type { PrismaClient } from "../../generated/prisma/client";
import { respond, payload } from "../../lib/api";
import { requireAdmin, requireAuthenticatedUser, requireCompletedOnboardingPlayer, requirePlayer, type Principal } from "../auth/guards";
import { completeOnboarding, playerSummary, respecFocus, updateTimezone } from "./services";

export function createPlayerApi(deps: { getDb: () => PrismaClient; resolveUser: () => Promise<Principal | null> }) {
  return {
    me: () => respond(async () => { const user = requireAuthenticatedUser(await deps.resolveUser()); return playerSummary(deps.getDb(), user.id); }),
    complete: (req: Request) => respond(async () => { const user = requirePlayer(await deps.resolveUser()); return completeOnboarding(deps.getDb(), user.id, await payload(req)); }),
    focus: (req: Request) => respond(async () => { const user = requireCompletedOnboardingPlayer(await deps.resolveUser()); return respecFocus(deps.getDb(), user.id, await payload(req)); }),
    timezone: (req: Request) => respond(async () => { const user = requireCompletedOnboardingPlayer(await deps.resolveUser()); return updateTimezone(deps.getDb(), user.id, await payload(req)); }),
    admin: () => respond(async () => { requireAdmin(await deps.resolveUser()); return { authorized: true }; }),
  };
}
