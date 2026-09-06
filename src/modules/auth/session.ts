import "server-only";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { oauthConfigurationStatus } from "../../config/env";
import { authOptions } from "./options";
import { requireAdmin, requireAuthenticatedUser, requireCompletedOnboardingPlayer, requirePlayer, type Principal } from "./guards";
import { ServiceError } from "../../lib/service-error";

export async function resolveSession(): Promise<Principal | null> {
  if (!oauthConfigurationStatus().ready) return null;
  const session = await getServerSession(authOptions());
  return session?.user ?? null;
}

export async function pageUser(access: "user" | "player" | "completed" | "admin") {
  try {
    const user = await resolveSession();
    return ({ user: requireAuthenticatedUser, player: requirePlayer, completed: requireCompletedOnboardingPlayer, admin: requireAdmin })[access](user);
  } catch (error) {
    if (error instanceof ServiceError) {
      if (error.status === 401) redirect("/login");
      if (error.code === "ONBOARDING_REQUIRED") redirect("/onboarding");
      if (error.status === 403) redirect("/not-authorized");
    }
    throw error;
  }
}
