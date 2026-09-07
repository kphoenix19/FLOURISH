import type { PrismaClient } from "../../../generated/prisma/client";
import { requireCompletedOnboardingPlayer, type Principal } from "../../auth/guards";
import { payload, respond } from "../../../lib/api";
import { mutateStandardQuest, type StandardAction } from "./actions";
import { reconcileStandardQuestSlots } from "./slots";

export function createStandardApi(deps: { getDb: () => PrismaClient; resolveUser: () => Promise<Principal | null> }) {
  return {
    get: () => respond(async () => {
      const user = requireCompletedOnboardingPlayer(await deps.resolveUser());
      return reconcileStandardQuestSlots(deps.getDb(), user.playerId);
    }),
    mutate: (request: Request, questId: string, action: StandardAction) => respond(async () => {
      const user = requireCompletedOnboardingPlayer(await deps.resolveUser());
      return mutateStandardQuest(deps.getDb(), user.playerId, questId, action, await payload(request));
    }),
  };
}
