import "next-auth";

declare module "next-auth" {
  interface Session {
    user?: { id: string; email: string; role: "PLAYER" | "ADMIN"; playerId: string | null; onboardingCompletedAt: string | null };
  }
}
