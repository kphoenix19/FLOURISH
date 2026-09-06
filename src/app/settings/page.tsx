import { pageUser } from "@/modules/auth/session";
import { assertOnboardingIntegrity } from "@/modules/player/services";
import { getDb } from "@/lib/db";
import { SettingsForm } from "@/components/player-controls";
import { PlayerShell } from "@/components/player-shell";
import { ServiceError } from "@/lib/service-error";
export const dynamic = "force-dynamic";
export default async function Settings() {
  const user = await pageUser("completed");
  let state;
  let message;
  try { state = await assertOnboardingIntegrity(getDb(), user.playerId!); }
  catch (error) { if (error instanceof ServiceError) message = error.message; else throw error; }
  return <PlayerShell>{state ? <><h1>Settings</h1><SettingsForm skills={state.skills} initialFocus={state.allocation} initialTimezone={state.player.timezone!} timezones={["UTC", ...Intl.supportedValuesOf("timeZone")]} /></> : <><h1>Settings unavailable</h1><p role="alert">{message}</p></>}</PlayerShell>;
}
