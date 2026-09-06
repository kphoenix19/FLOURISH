import Link from "next/link";
import { pageUser } from "@/modules/auth/session";
import { PlayerShell } from "@/components/player-shell";
export const dynamic = "force-dynamic";
export default async function PlayerHome() {
  await pageUser("completed");
  return <PlayerShell><p className="eyebrow">FLOURISH</p><h1>You&apos;re all set.</h1><p>Your timezone and Focus allocation are saved. Quest generation arrives in the next phase.</p><Link className="button" href="/settings">Adjust your settings</Link></PlayerShell>;
}
