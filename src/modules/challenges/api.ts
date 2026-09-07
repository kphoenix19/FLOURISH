import type { PrismaClient } from "../../generated/prisma/client";
import { payload, respond } from "../../lib/api";
import { requireCompletedOnboardingPlayer, type Principal } from "../auth/guards";
import { getChallengeState, mutateChallenge, type ChallengeAction } from "./service";
export function createChallengeApi(deps:{getDb:()=>PrismaClient;resolveUser:()=>Promise<Principal|null>}){return{get:()=>respond(async()=>{const user=requireCompletedOnboardingPlayer(await deps.resolveUser());return getChallengeState(deps.getDb(),user.playerId);}),mutate:(request:Request,id:string,action:ChallengeAction)=>respond(async()=>{const user=requireCompletedOnboardingPlayer(await deps.resolveUser());await payload(request);return mutateChallenge(deps.getDb(),user.playerId,id,action);})};}
