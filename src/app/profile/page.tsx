import Link from "next/link";
import { PlayerShell } from "@/components/player-shell";
import { getDb } from "@/lib/db";
import { pageUser } from "@/modules/auth/session";
import { playerSummary } from "@/modules/player/services";

export const dynamic = "force-dynamic";

export default async function Profile() {
  const user = await pageUser("completed");
  const summary = await playerSummary(getDb(), user.id);
  const player = summary.player!;
  const focus = [...player.focus].sort((a, b) => a.skill.code.localeCompare(b.skill.code));
  return <PlayerShell><div className="profile-page"><div className="page-title"><p className="eyebrow">Your character</p><h1>Profile &amp; Progress</h1><p>Review your overall progress and current priorities.</p></div><section className="profile-summary" aria-label="Overall progress"><div><span>Overall level</span><strong>{player.progress!.overallLevel}</strong></div><div><span>Overall XP</span><strong>{player.progress!.overallXp}</strong></div><div><span>Timezone</span><strong>{player.timezone}</strong></div></section><section className="profile-focus" aria-labelledby="profile-focus-heading"><h2 id="profile-focus-heading">Focus Points</h2><dl>{focus.map(({ skill, focusPoints }) => <div key={skill.code}><dt>{skill.code}</dt><dd>{focusPoints}</dd></div>)}</dl></section><div className="actions"><Link className="button" href="/settings">Change Focus or timezone</Link><Link className="button secondary" href="/home#skill-overview">View Skill progress</Link></div></div></PlayerShell>;
}
