import { standardApi } from "@/modules/quests/standard/server-api";
export async function POST(request: Request, context: { params: Promise<{ playerQuestId: string }> }) {
  return standardApi.mutate(request, (await context.params).playerQuestId, "reroll");
}
