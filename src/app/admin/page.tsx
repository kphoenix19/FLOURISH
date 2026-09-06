import { pageUser } from "@/modules/auth/session";
import { PlayerShell } from "@/components/player-shell";
export const dynamic = "force-dynamic";
export default async function Admin() {
  await pageUser("admin");
  return <PlayerShell><h1>Administrator access</h1><p>Your administrator role is verified. Quest curation arrives in a later phase.</p></PlayerShell>;
}
