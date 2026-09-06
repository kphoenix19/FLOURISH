"use client";
import { signIn, signOut } from "next-auth/react";

export function GoogleSignIn() {
  return <button className="button" onClick={() => void signIn("google", { callbackUrl: "/home" })}>Continue with Google</button>;
}
export function SignOut() {
  return <button className="button secondary" onClick={() => void signOut({ callbackUrl: "/" })}>Sign out</button>;
}
