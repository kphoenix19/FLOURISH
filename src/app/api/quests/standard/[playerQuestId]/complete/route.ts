import { standardApi } from "@/modules/quests/standard/server-api";
export const POST = (request: Request, context: { params: Promise<{ playerQuestId: string }> }) => context.params.then(({ playerQuestId }) => standardApi.resolve(request, playerQuestId, "complete"));
