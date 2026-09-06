import { redirect } from "next/navigation";
import { pageUser } from "@/modules/auth/session";
import { canonicalSkills } from "@/modules/player/services";
import { getDb } from "@/lib/db";
import { OnboardingForm } from "@/components/player-controls";
import { PlayerShell } from "@/components/player-shell";
import { ServiceError } from "@/lib/service-error";
export const dynamic = "force-dynamic";
export default async function Onboarding() {
  const user = await pageUser("player");
  if (user.onboardingCompletedAt) redirect("/home");
  let skills;
  let message;
  try { skills = await canonicalSkills(getDb()); }
  catch (error) { if (error instanceof ServiceError) message = error.message; else throw error; }
  return <PlayerShell>{skills ? <OnboardingForm skills={skills} timezones={["UTC", ...Intl.supportedValuesOf("timeZone")]} /> : <><h1>Setup is unavailable</h1><p role="alert">{message}</p></>}</PlayerShell>;
}
