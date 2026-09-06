import "server-only";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { getDb } from "../../lib/db";
import { parseServerEnv } from "../../config/env";
import { flourishAdapter } from "./adapter";
import { ensurePlayerForUser } from "../player/services";

export function authOptions(): NextAuthOptions {
  const env = parseServerEnv(process.env);
  return {
    secret: env.AUTH_SECRET,
    adapter: flourishAdapter(getDb),
    session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
    providers: [GoogleProvider({ clientId: env.AUTH_GOOGLE_ID!, clientSecret: env.AUTH_GOOGLE_SECRET!, allowDangerousEmailAccountLinking: false })],
    pages: { signIn: "/login", error: "/login" },
    callbacks: {
      async signIn({ account, profile }) {
        return account?.provider === "google" && !!profile && "email_verified" in profile && profile.email_verified === true;
      },
      async jwt({ token, user }) {
        // Discard provider profile/token fields; only persisted identity is needed.
        return { sub: user?.id ?? token.sub };
      },
      async session({ session, token }) {
        const user = token.sub ? await getDb().user.findUnique({ where: { id: token.sub }, select: { id: true, email: true, role: true, player: { select: { id: true, onboardingCompletedAt: true } } } }) : null;
        if (!user) { session.user = undefined; return session; }
        session.user = { id: user.id, email: user.email, role: user.role, playerId: user.player?.id ?? null, onboardingCompletedAt: user.player?.onboardingCompletedAt?.toISOString() ?? null };
        return session;
      },
      async redirect({ url, baseUrl }) {
        // Auth.js also checks CSRF on its sign-in/sign-out POSTs.
        if (url.startsWith("/") && !url.startsWith("//")) return `${baseUrl}${url}`;
        try { if (new URL(url).origin === new URL(baseUrl).origin) return url; } catch { /* use safe local default */ }
        return `${baseUrl}/home`;
      },
    },
    events: { async signIn({ user }) { await ensurePlayerForUser(getDb(), user.id); } },
    logger: {
      // Auth.js metadata may contain provider tokens or database details.
      error(code) { console.error("Authentication failed:", code); },
      warn(code) { console.warn("Authentication warning:", code); },
      debug() {},
    },
  };
}
