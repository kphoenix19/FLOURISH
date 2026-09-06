import { ServiceError } from "../../lib/service-error";

export type Principal = { id: string; email: string; role: "PLAYER" | "ADMIN"; playerId: string | null; onboardingCompletedAt: string | null };
export function requireAuthenticatedUser(user: Principal | null): Principal {
  if (!user) throw new ServiceError(401, "UNAUTHENTICATED", "Sign in to continue.");
  return user;
}
export function requirePlayer(user: Principal | null) {
  const resolved = requireAuthenticatedUser(user);
  if (!resolved.playerId) throw new ServiceError(409, "PLAYER_MISSING", "Player setup is incomplete. Sign in again.");
  return resolved as Principal & { playerId: string };
}
export function requireCompletedOnboardingPlayer(user: Principal | null) {
  const resolved = requirePlayer(user);
  if (!resolved.onboardingCompletedAt) throw new ServiceError(409, "ONBOARDING_REQUIRED", "Complete onboarding first.");
  return resolved;
}
export function requireAdmin(user: Principal | null) {
  const resolved = requireAuthenticatedUser(user);
  if (resolved.role !== "ADMIN") throw new ServiceError(403, "FORBIDDEN", "Administrator access is required.");
  return resolved;
}
