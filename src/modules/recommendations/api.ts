import type { PrismaClient } from "../../generated/prisma/client";
import { respond } from "../../lib/api";
import { requireCompletedOnboardingPlayer, type Principal } from "../auth/guards";
import { getHomeRecommendation } from "./service";

export function createRecommendationApi(deps: { getDb: () => PrismaClient; resolveUser: () => Promise<Principal | null> }) {
  return { get: () => respond(async () => { const user = requireCompletedOnboardingPlayer(await deps.resolveUser()); return getHomeRecommendation(deps.getDb(), user.playerId); }) };
}
