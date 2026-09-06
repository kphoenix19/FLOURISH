import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { oauthConfigurationStatus } from "@/config/env";
import { authOptions } from "@/modules/auth/options";

async function handler(request: NextRequest, context: { params: Promise<{ nextauth: string[] }> }) {
  if (!oauthConfigurationStatus().ready) return Response.json({ error: "Google sign-in is not configured. Set DATABASE_URL, AUTH_SECRET, AUTH_GOOGLE_ID, and AUTH_GOOGLE_SECRET." }, { status: 503 });
  return NextAuth(authOptions())(request, context);
}
export { handler as GET, handler as POST };
