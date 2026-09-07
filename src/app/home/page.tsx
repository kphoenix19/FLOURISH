import { pageUser } from "@/modules/auth/session";
import { PlayerShell } from "@/components/player-shell";
import { StandardQuests } from "@/components/standard-quests";
import { reconcileStandardQuestSlots } from "@/modules/quests/standard/slots";
import { getDb } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";
export const dynamic = "force-dynamic";
export default async function PlayerHome() {
  const user = await pageUser("completed");
  let state;
  let errorMessage;
  try { state = await reconcileStandardQuestSlots(getDb(), user.playerId!); }
  catch (error) { if (!(error instanceof ServiceError)) throw error; errorMessage = error.message; }
  return <PlayerShell>{state ? <StandardQuests initial={state} /> : <><h1>Standard Quests</h1><p role="alert" className="error">{errorMessage}</p></>}</PlayerShell>;
}
