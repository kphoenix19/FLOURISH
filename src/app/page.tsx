import { redirect } from "next/navigation";
import { resolveSession } from "@/modules/auth/session";
import { Landing } from "@/components/landing";

export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await resolveSession();
  if (user) redirect(user.onboardingCompletedAt ? "/home" : "/onboarding");
  return <Landing />;
}
