"use client";

import { useState } from "react";
import type { ChallengeAction, ChallengeState } from "@/modules/challenges/service";
import { DifficultyBadge, Feedback, ProgressBar, SkillBadge, StatusBadge } from "./game-ui";

const label = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();
const formatEnd = (date: string, timezone: string) => new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(date));
export type ChallengeQuestView = ChallengeState["daily"]["quests"][number];

export function ChallengeControls({ quest, busy, onAction }: { quest: ChallengeQuestView; busy: string | null; onAction: (id: string, action: ChallengeAction) => void }) {
  if (quest.status === "AVAILABLE") return <button className="button" disabled={busy !== null} onClick={() => onAction(quest.id, "accept")}>Accept</button>;
  if (quest.status === "ACCEPTED" && quest.completionType === "SINGLE") return <button className="button" disabled={busy !== null} onClick={() => onAction(quest.id, "complete")}>Complete</button>;
  if (quest.status === "ACCEPTED" && quest.completionType === "COUNT") return <div className="count-controls"><button className="icon-action" aria-label={`Decrease ${quest.title} progress`} disabled={busy !== null || quest.currentProgress === 0} onClick={() => onAction(quest.id, "decrement")}>−</button><output aria-label={`${quest.title} current progress`}>{quest.currentProgress} / {quest.target}</output><button className="button" aria-label={`Increase ${quest.title} progress`} disabled={busy !== null} onClick={() => onAction(quest.id, "increment")}>+ Add one</button></div>;
  if (quest.status === "COMPLETED") return <p className="completed-note"><span aria-hidden="true">✓</span><strong>Completed</strong></p>;
  if (quest.status === "EXPIRED") return <p className="expired-note"><strong>Expired</strong> · no penalty</p>;
  return null;
}

export function Challenges({ state, busy, message, error, onAction }: { state: ChallengeState; busy: string | null; message: string; error: string; onAction: (id: string, action: ChallengeAction) => void }) {
  const [openPools, setOpenPools] = useState(() => new Set<string>());
  return <section className="home-section challenges-section" aria-labelledby="challenges-heading"><div className="section-heading"><div><p className="eyebrow">Limited-time goals</p><h2 id="challenges-heading">Daily &amp; Weekly Challenges</h2></div></div><p className="section-intro">Accept what fits. Challenges have no rerolls or failure penalties.</p><Feedback message={busy ? "Updating challenge..." : message} error={error} /><div className="challenge-columns">{([state.daily, state.weekly] as const).map((set) => { const poolName = `${label(set.poolType)} Challenges`; const open = openPools.has(set.poolType); return <section key={set.poolType} className={`challenge-set challenge-${set.poolType.toLowerCase()}`} aria-label={poolName}>
    <button type="button" className="challenge-trigger" aria-expanded={open} aria-controls={`challenge-panel-${set.poolType.toLowerCase()}`} onClick={() => setOpenPools((current) => { const next = new Set(current); if (next.has(set.poolType)) next.delete(set.poolType); else next.add(set.poolType); return next; })}><div><p className="eyebrow">{label(set.poolType)} set</p><h3>{poolName}</h3><p className="set-meta">Ends <time dateTime={set.windowEndAt}>{formatEnd(set.windowEndAt, state.timezone)}</time></p></div><div className="set-progress"><strong>{set.completedCount}/{set.totalCount}</strong><span>complete</span></div></button>
    <div className="challenge-summary-progress"><ProgressBar value={set.completedCount} max={set.totalCount} label={`${label(set.poolType)} set progress`} /><p className="set-meta">Complete the set for <strong>+{set.setBonusXp} Overall XP</strong>{set.setBonusAwarded ? " · Bonus awarded" : ""}</p></div>
    <div id={`challenge-panel-${set.poolType.toLowerCase()}`} className="challenge-panel" hidden={!open}><div className="challenge-list">{set.quests.map((quest) => <article key={quest.id} className={`challenge-card status-border-${quest.status.toLowerCase()}`} data-challenge-id={quest.id} aria-busy={busy === quest.id}><div className="challenge-card-top"><SkillBadge code={quest.primarySkill} compact /><div className="card-badges"><span className="badge pool-badge">{label(set.poolType)} Challenge</span><DifficultyBadge difficulty={quest.difficulty} /><StatusBadge status={quest.status} /></div></div><h4>{quest.title}</h4><p>{quest.description}</p><p className="quest-context">{quest.baseXp} Base XP + {quest.challengeBonusPercent}% Challenge bonus · ~{quest.estimatedMinutes} min</p>{quest.completionType === "COUNT" && <div className="count-progress"><div><strong>{quest.currentProgress}/{quest.target}</strong><span>No partial XP; completion occurs at {quest.target}.</span></div><ProgressBar value={quest.currentProgress} max={quest.target} label={`${quest.title} progress`} /></div>}<ChallengeControls quest={quest} busy={busy} onAction={onAction} /></article>)}</div></div>
  </section>; })}</div></section>;
}
