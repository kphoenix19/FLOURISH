import { challengeApi } from "@/modules/challenges/server-api";
import type { ChallengeAction } from "@/modules/challenges/service";
const actions=new Set<ChallengeAction>(["accept","complete","increment","decrement"]);
export async function POST(request:Request,context:{params:Promise<{playerQuestId:string;action:string}>}){const {playerQuestId,action}=await context.params;if(!actions.has(action as ChallengeAction))return Response.json({error:{code:"NOT_FOUND",message:"Challenge action not found."}},{status:404});return challengeApi.mutate(request,playerQuestId,action as ChallengeAction);}
