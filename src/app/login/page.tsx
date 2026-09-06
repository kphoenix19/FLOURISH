import { redirect } from "next/navigation";
import { GoogleSignIn } from "@/components/auth-controls";
import { oauthConfigurationStatus } from "@/config/env";
import { resolveSession } from "@/modules/auth/session";

export const dynamic = "force-dynamic";
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await resolveSession();
  if (user) redirect(user.onboardingCompletedAt ? "/home" : "/onboarding");
  const status = oauthConfigurationStatus();
  const { error } = await searchParams;
  return <main className="page-shell narrow"><section className="panel"><p className="eyebrow">FLOURISH</p><h1>Welcome back. Or welcome aboard.</h1><p>Sign in to set up your Skills and keep your progress together.</p>
    {status.ready ? <GoogleSignIn /> : <p role="status">Google sign-in is not configured. For local setup, provide DATABASE_URL, AUTH_SECRET, AUTH_GOOGLE_ID, and AUTH_GOOGLE_SECRET as described in README.</p>}
    {error && <p role="alert">{error === "OAuthAccountNotLinked" ? "This email already belongs to an account that is not linked to this Google identity. Contact the administrator; accounts are not merged automatically." : "Sign-in could not be completed. Please try again or check local OAuth configuration."}</p>}
  </section></main>;
}
