import type { PrismaClient } from "../../generated/prisma/client";
import { respond } from "../../lib/api";
import { requireCompletedOnboardingPlayer, type Principal } from "../auth/guards";
import { getHomeRecommendation } from "./service";
import { payload } from "../../lib/api";
import { z } from "zod";

const refreshSchema = z.object({ playerQuestId: z.string().uuid() }).strict();

export function createRecommendationApi(deps: { getDb: () => PrismaClient; resolveUser: () => Promise<Principal | null> }) {
  return {
    get: () => respond(async () => { const user = requireCompletedOnboardingPlayer(await deps.resolveUser()); return getHomeRecommendation(deps.getDb(), user.playerId); }),
    refresh: (request: Request) => respond(async () => { const user = requireCompletedOnboardingPlayer(await deps.resolveUser()); const input = refreshSchema.parse(await payload(request)); return getHomeRecommendation(deps.getDb(), user.playerId, Math.random, () => new Date(), input.playerQuestId); }),
  };
}
