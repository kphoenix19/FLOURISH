import { pageUser } from "@/modules/auth/session";
import { PlayerShell } from "@/components/player-shell";
import { StandardQuests } from "@/components/standard-quests";
import { reconcileStandardQuestSlots } from "@/modules/quests/standard/slots";
import { getDb } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";
import { getHomeRecommendation } from "@/modules/recommendations/service";
import { getChallengeState } from "@/modules/challenges/service";
export const dynamic = "force-dynamic";
export default async function PlayerHome() {
  const user = await pageUser("completed");
  let state; let recommendation; let challenges;
  let errorMessage;
  try { state = await reconcileStandardQuestSlots(getDb(), user.playerId!); recommendation = await getHomeRecommendation(getDb(), user.playerId!); challenges = await getChallengeState(getDb(), user.playerId!); }
  catch (error) { if (!(error instanceof ServiceError)) throw error; errorMessage = error.message; }
  return <PlayerShell>{state && recommendation !== undefined && challenges ? <StandardQuests initial={state} initialRecommendation={recommendation} initialChallenges={challenges} /> : <div className="empty-state"><p className="eyebrow">Player home</p><h1>Progress is temporarily unavailable</h1><p role="alert" className="error">{errorMessage}</p><p>Your game state is safe. Refresh to try again.</p></div>}</PlayerShell>;
}
