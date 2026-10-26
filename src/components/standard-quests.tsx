"use client";

import { useRef, useState } from "react";
import type { StandardState } from "@/modules/quests/standard/view";
import type { StandardAction } from "@/modules/quests/standard/actions";
import type { ResolutionAction } from "@/modules/quests/standard/resolution";
import type { HomeRecommendationResult } from "@/modules/recommendations/service";
import { gameConfig } from "@/config/game";
import type { ChallengeAction, ChallengeState } from "@/modules/challenges/service";
import { ChallengeControls, Challenges } from "./challenges";
import { ConfirmationDialog, DifficultyBadge, Feedback, ProgressBar, SkillBadge, StatusBadge } from "./game-ui";

const label = (text: string) => text.charAt(0) + text.slice(1).toLowerCase();
const formatDue = (date: string, timezone: string) => new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(date));

export function StandardQuests({ initial, initialRecommendation, initialChallenges }: { initial: StandardState; initialRecommendation: HomeRecommendationResult; initialChallenges?: ChallengeState }) {
  const [state, setState] = useState(initial); const [recommendation, setRecommendation] = useState(initialRecommendation); const [busy, setBusy] = useState<string | null>(null); const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [openSkills, setOpenSkills] = useState(() => new Set<string>());
  const [abandonQuest, setAbandonQuest] = useState<{ id: string; title: string; penalty: number } | null>(null);
  const [recommendationBusy, setRecommendationBusy] = useState<"accept" | "different" | null>(null);
  const recommendationLock = useRef(false);
  const [challengeState, setChallengeState] = useState(initialChallenges);
  const [challengeBusy, setChallengeBusy] = useState<string | null>(null); const [challengeMessage, setChallengeMessage] = useState(""); const [challengeError, setChallengeError] = useState("");
  const standardActive = state.skills.flatMap((skill) => skill.slots.filter((slot) => slot.quest.status === "ACCEPTED").map((slot) => ({ skill, slot })));
  const challengeActive = challengeState ? [challengeState.daily, challengeState.weekly].flatMap((set) => (set?.quests ?? []).filter((quest) => quest.status === "ACCEPTED")) : [];
  const activeCount = standardActive.length + challengeActive.length;
  async function act(id: string, action: StandardAction | ResolutionAction) {
    if (busy) return false; setBusy(id); setError(""); setMessage("");
    try { const response = await fetch(`/api/quests/standard/${id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "reroll" ? { feedbackReason: feedback[id] || null } : {}) }); const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? "The quest could not be updated."); setState(result); const next = await fetch("/api/recommendations/next"); if (next.ok) setRecommendation(await next.json()); setMessage(action === "accept" ? "Quest accepted. Your deadline has started." : action === "complete" ? "Quest complete. XP, levels, and streaks are updated." : action === "abandon" ? "Quest abandoned. The Skill XP penalty was applied and a replacement is ready." : action === "clear" ? "Failure acknowledged. The stored penalty was applied and a replacement is ready." : action === "bump" ? "A harder family quest is ready to accept." : "Your replacement quest is ready."); }
    catch (e) { setError(e instanceof Error ? e.message : "Please try again."); try { await reconcileHome(); } catch { /* Keep the mutation error visible. */ } return false; } finally { setBusy(null); }
    return true;
  }
  async function confirmAbandon() { if (!abandonQuest || busy) return; const id = abandonQuest.id; await act(id, "abandon"); setAbandonQuest((current) => current?.id === id ? null : current); }
  async function reconcileHome() { const [quests, next] = await Promise.all([fetch("/api/quests/standard"), fetch("/api/recommendations/next")]); if (quests.ok) setState(await quests.json()); if (next.ok) setRecommendation(await next.json()); }
  async function acceptRecommendation() {
    if (!recommendation || recommendationLock.current) return; recommendationLock.current = true; setRecommendationBusy("accept");
    await act(recommendation.playerQuestId, "accept");
    try { await reconcileHome(); } catch { /* Preserve the authoritative action result or error. */ }
    recommendationLock.current = false; setRecommendationBusy(null);
  }
  async function requestDifferent() {
    if (!recommendation || recommendationLock.current) return; recommendationLock.current = true; setRecommendationBusy("different"); setError(""); setMessage("");
    try { const response = await fetch("/api/recommendations/next", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerQuestId: recommendation.playerQuestId }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? "A different quest could not be suggested."); setRecommendation(result); setMessage(result === null ? "No quests are available to recommend right now." : result.differentAvailable === false ? "No different available quest can currently be suggested." : "Here is another available quest."); }
    catch (e) { setError(e instanceof Error ? e.message : "Please try again."); try { await reconcileHome(); } catch { /* Keep the original request error visible. */ } }
    finally { recommendationLock.current = false; setRecommendationBusy(null); }
  }
  async function challengeAct(id: string, action: ChallengeAction) {
    if (challengeBusy) return; setChallengeBusy(id); setChallengeError(""); setChallengeMessage("");
    try { const response = await fetch(`/api/challenges/${id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? "Challenge could not be updated."); setChallengeState(result); if (action === "complete" || action === "increment") await reconcileHome(); setChallengeMessage(action === "accept" ? "Challenge accepted." : action === "decrement" ? "Challenge progress corrected." : action === "increment" ? "Challenge progress updated. No XP is awarded until the target is reached." : "Challenge completed and rewards applied."); }
    catch (e) { setChallengeError(e instanceof Error ? e.message : "Please try again."); try { const refreshed = await fetch("/api/challenges"); if (refreshed.ok) setChallengeState(await refreshed.json()); } catch { /* Keep the mutation error visible. */ } }
    finally { setChallengeBusy(null); }
  }
  return <>
    <header className="progress-hero">
<div>
<p className="eyebrow">Your progression</p>
<h1>Overall Level {state.overallLevel}</h1>
<p className="hero-copy">Every completed real-life quest moves your whole life forward.</p>
</div>
<div className="level-orb" aria-hidden="true">
<span>{state.overallLevel}</span>
<small>LEVEL</small>
</div>
<div className="overall-meter">
<div>
<strong>{state.overallXp.toLocaleString()} Overall XP</strong>
<span>{state.overallProgress.xpToNextLevel?.toLocaleString() ?? 0} XP to Level {state.overallLevel + 1}</span>
</div>
<ProgressBar value={state.overallProgress.xpIntoLevel} max={state.overallProgress.nextLevelXp === null ? state.overallProgress.xpIntoLevel : state.overallProgress.nextLevelXp - state.overallProgress.levelStartXp} label={`Overall progress to level ${state.overallLevel + 1}`} />
</div>
</header>
    <Feedback message={busy ? "Updating your quest..." : message} error={error} />
    {state.resolution && <aside className="reward-summary" aria-label="Quest result">
<span className="reward-icon" aria-hidden="true">+</span>
<div>
<strong>{state.resolution.action === "complete" ? `+${state.resolution.overallXpGained} Overall XP` : "Overall and Lifetime XP unchanged"}</strong>{state.resolution.skills.map((s) => <p key={s.skillCode}>{s.skillCode}: {s.xpChange >= 0 ? "+" : ""}{s.xpChange} Current Skill XP{s.catchUpBonusXp > 0 ? ` (Catch-Up +${s.catchUpBonusXp})` : ""}{s.streakBonusXp > 0 ? ` (streak +${s.streakBonusXp})` : ""}{s.previousLevel !== s.newLevel ? ` · Level ${s.previousLevel} to ${s.newLevel}` : ""}</p>)}</div>
</aside>}
    <section className="home-section" aria-labelledby="active-heading">
<div className="section-heading">
<div>
<p className="eyebrow">In progress</p>
<h2 id="active-heading">Active Quests</h2>
</div>
<span className="section-count">{activeCount} active</span>
</div>{activeCount === 0 ? <div className="empty-state compact">
<strong>No active quests yet</strong>
<p>Accept a Standard quest when you are ready to start its deadline.</p>
</div> : <div className="active-list">{standardActive.map(({ slot }) => { const q = slot.quest; return <article className="active-quest state-accepted" key={q.id} data-active-quest-id={q.id}>
<div className="active-skill">{q.skills.map((reward) => { const rewarded = state.skills.find((item) => item.code === reward.skillCode); return <SkillBadge key={reward.skillCode} code={reward.skillCode} name={rewarded?.name ?? reward.skillCode} />; })}</div>
<div className="active-main">
<div className="card-badges">
<span className="badge pool-badge">Standard</span>
<StatusBadge status={q.status} />
</div>
<h3>{q.title}</h3>
<dl className="active-meta">
<div><dt>Difficulty</dt><dd>{label(q.difficulty!)}</dd></div>
<div><dt>Deadline</dt><dd>{q.deadlineAt ? <time dateTime={q.deadlineAt}>{formatDue(q.deadlineAt, state.timezone)}</time> : "No deadline"}</dd></div>
<div><dt>XP</dt><dd>{q.baseXp} Base XP</dd></div>
{q.completionType === "COUNT" && <div><dt>Progress</dt><dd>{q.currentProgress}/{q.completionTarget}</dd></div>}
</dl></div>
<div className="active-actions"><>
<button className="button" disabled={busy !== null} onClick={() => act(q.id, "complete")}>{busy === q.id ? "Completing..." : "Complete quest"}</button>
<button className="button danger-quiet" disabled={busy !== null} onClick={() => setAbandonQuest({ id: q.id, title: q.title, penalty: Math.floor((q.baseXp! * gameConfig.quests.failurePenaltyPercent + 50) / 100) })}>Abandon</button>
</></div>
</article>; })}{challengeActive.map((quest) => <article className={`active-quest state-accepted active-${quest.poolType.toLowerCase()}`} key={quest.id} data-active-quest-id={quest.id}>
<div className="active-skill">{quest.skills.map((reward) => { const rewarded = state.skills.find((item) => item.code === reward.skillCode); return <SkillBadge key={reward.skillCode} code={reward.skillCode} name={rewarded?.name ?? reward.skillCode} />; })}</div>
<div className="active-main"><div className="card-badges"><span className="badge pool-badge">{quest.poolType === "DAILY" ? "Daily Challenge" : "Weekly Challenge"}</span><StatusBadge status={quest.status} /></div><h3>{quest.title}</h3><dl className="active-meta"><div><dt>Difficulty</dt><dd>{label(quest.difficulty!)}</dd></div><div><dt>Challenge type</dt><dd>{label(quest.completionType!)}</dd></div><div><dt>Deadline</dt><dd><time dateTime={quest.windowEndAt}>{formatDue(quest.windowEndAt, challengeState!.timezone)}</time></dd></div>{quest.completionType === "COUNT" && <div><dt>Progress</dt><dd>{quest.currentProgress}/{quest.target}</dd></div>}<div><dt>XP</dt><dd>{quest.baseXp} Base XP + {quest.challengeBonusPercent}% bonus</dd></div></dl></div>
<div className="active-actions"><ChallengeControls quest={quest} busy={challengeBusy} onAction={(id, action) => void challengeAct(id, action)} /></div>
</article>)}</div>}</section>
    <section className="recommendation-card" aria-labelledby="next-quest-heading" data-recommended-quest-id={recommendation?.playerQuestId}>
<div className="recommendation-kicker">
<span aria-hidden="true">→</span>
<p className="eyebrow">What should I do next?</p>
</div>
{recommendation ? <><div className="recommendation-content">
<SkillBadge code={recommendation.skillCode} name={recommendation.skillName} />
<div>
<h2 id="next-quest-heading">{recommendation.title}</h2>
<p>{recommendation.description}</p>
<div className="card-badges">
<DifficultyBadge difficulty={recommendation.difficulty} />
<span className="badge">About {recommendation.estimatedMinutes} min</span>
</div>
</div>
</div>
<div className="recommendation-footer">
<div className="recommendation-reasons">{recommendation.reasonCodes.map((reason, index) => <span key={`${reason}-${index}`}>{reason}</span>)}</div>
<div className="recommendation-actions"><button className="button" type="button" disabled={busy !== null || recommendationBusy !== null} onClick={() => void acceptRecommendation()}>{recommendationBusy === "accept" ? "Accepting…" : "Accept quest"}</button><button className="button secondary" type="button" disabled={busy !== null || recommendationBusy !== null} onClick={() => void requestDifferent()}>{recommendationBusy === "different" ? "Finding another…" : "Something different"}</button></div>
</div>
</> : <div className="empty-state compact"><h2 id="next-quest-heading">No quests to recommend right now</h2><p>Continue an active quest, or review your Standard quest slots below.</p></div>}
</section>
    {challengeState && <Challenges state={challengeState} busy={challengeBusy} message={challengeMessage} error={challengeError} onAction={(id, action) => void challengeAct(id, action)} />}
    <section className="home-section" id="skill-overview" aria-labelledby="skills-heading">
<div className="section-heading">
<div>
<p className="eyebrow">Your eight life Skills</p>
<h2 id="skills-heading">Skill progression &amp; Standard quests</h2>
</div>
</div>
<p className="section-intro">Choose from three persistent quests per Skill. Focus guides recommendations; it never changes XP rewards.</p>
<nav className="skill-links" aria-label="Jump to Skill">{state.skills.map((s) => <a key={s.code} href={`#quests-${s.code}`}>
<SkillBadge code={s.code} name={s.name} />
</a>)}</nav>
<div className="skill-sections">{state.skills.map((skill) => { const acceptedCount = skill.slots.filter((slot) => slot.quest.status === "ACCEPTED").length; return <section key={skill.code} id={`quests-${skill.code}`} className="quest-skill">
<button type="button" className="skill-trigger" aria-expanded={openSkills.has(skill.code)} aria-controls={`skill-panel-${skill.code}`} onClick={() => setOpenSkills((current) => { const next = new Set(current); if (next.has(skill.code)) next.delete(skill.code); else next.add(skill.code); return next; })}>
<span className="skill-summary-name"><SkillBadge code={skill.code} name={skill.name} /></span>
<span className="skill-summary-level">Level {skill.currentLevel}</span>
<span className="skill-active-count" aria-label={`${acceptedCount} active Standard ${acceptedCount === 1 ? "quest" : "quests"}`}>{acceptedCount} active</span>
<span className="skill-summary-streak">{skill.currentStreakDays}-day streak ({skill.streakActive ? "active" : "inactive"})</span>
<span className="skill-summary-xp">{skill.levelProgress.nextLevelXp === null ? "Max level" : `${skill.levelProgress.xpToNextLevel} XP to next level`}</span>
</button>
<div id={`skill-panel-${skill.code}`} className="skill-panel" hidden={!openSkills.has(skill.code)}>
<div className="skill-progress">
<ProgressBar value={skill.levelProgress.xpIntoLevel} max={skill.levelProgress.nextLevelXp === null ? skill.levelProgress.xpIntoLevel : skill.levelProgress.nextLevelXp - skill.levelProgress.levelStartXp} label={`${skill.name} progress`} />
<p>Best streak {skill.longestStreakDays} days · {skill.streakBonusPercent}% current bonus · {skill.nextStreakTier ? `${skill.nextStreakTier.daysRemaining} day${skill.nextStreakTier.daysRemaining === 1 ? "" : "s"} to +${skill.nextStreakTier.bonusPercent}%` : "maximum streak bonus"}</p>
</div>
<div className="quest-grid">{skill.slots.map((slot) => { const q = slot.quest; return <article id={`slot-${slot.id}`} key={slot.id} className={`quest-card status-border-${q.status.toLowerCase()}`} data-slot-id={slot.id} data-quest-id={q.id} aria-label={`${skill.name} slot ${slot.slotNumber}`} aria-busy={busy === q.id}>
<div>
<div className="quest-top">
<span className="slot-label">Slot {slot.slotNumber}</span>
<StatusBadge status={q.status} />
</div>
<h3>{q.title}</h3>
<p className="quest-description">{q.description}</p>
<div className="card-badges">
<DifficultyBadge difficulty={q.difficulty!} />
<span className="badge">{q.baseXp} Base XP</span>
<span className="badge">~{q.estimatedMinutes} min</span>
</div>{q.status === "AVAILABLE" && <p className="quest-context">Deadline starts on acceptance: {q.completionWindowHours} hours{q.completionType === "COUNT" ? ` · ${q.completionTarget} repetitions` : ""}</p>}{q.deadlineAt && <p className="deadline">Due <time dateTime={q.deadlineAt}>{formatDue(q.deadlineAt, state.timezone)}</time>
</p>}{q.status === "EXPIRED" && <p className="failure-note">
<strong>Failed / expired.</strong> {q.failurePenaltyXp} Skill XP is awaiting acknowledgment. XP has not changed yet.</p>}</div>{q.status === "AVAILABLE" && <div>
<div className="quest-actions">
<button className="button" disabled={busy !== null} onClick={() => act(q.id, "accept")}>{busy === q.id ? "Accepting..." : "Accept"}</button>
<button className="icon-action" aria-label={`Reroll ${q.title}`} title="Reroll" disabled={busy !== null} onClick={() => act(q.id, "reroll")}>
<span aria-hidden="true">↻</span>
</button>{q.nextDifficulty && <button className="icon-action" aria-label={`Make ${q.title} harder: ${label(q.nextDifficulty)}`} title="Increase difficulty" disabled={busy !== null} onClick={() => act(q.id, "bump")}>
<span aria-hidden="true">▲</span> {label(q.nextDifficulty)}</button>}</div>
<label className="reroll-feedback">Reroll feedback (optional)<select aria-label={`Reroll feedback for ${q.title}`} value={feedback[q.id] ?? ""} disabled={busy !== null} onChange={(e) => setFeedback({ ...feedback, [q.id]: e.target.value })}>
<option value="">Skip feedback</option>
<option value="TOO_HARD">Too hard</option>
<option value="NO_TIME">No time</option>
<option value="NOT_INTERESTED">Not interested</option>
<option value="JUST_DIFFERENT">Just different</option>
</select>
</label>
</div>}{q.status === "ACCEPTED" && <div className="quest-actions">
<button className="button" disabled={busy !== null} onClick={() => act(q.id, "complete")}>Complete</button>
<button className="button danger-quiet" disabled={busy !== null} onClick={() => setAbandonQuest({ id: q.id, title: q.title, penalty: Math.floor((q.baseXp! * gameConfig.quests.failurePenaltyPercent + 50) / 100) })}>Abandon</button>
</div>}{q.status === "EXPIRED" && <button className="button danger" disabled={busy !== null} onClick={() => act(q.id, "clear")}>Clear / acknowledge failure</button>}</article>; })}</div>
</div>
</section>; })}</div>
</section>
    <ConfirmationDialog open={abandonQuest !== null} title="Abandon quest?" confirmLabel="Abandon quest" pending={busy === abandonQuest?.id} onCancel={() => setAbandonQuest(null)} onConfirm={() => void confirmAbandon()}>
      <p><strong>{abandonQuest?.title}</strong> will be abandoned immediately.</p>
      <p className="dialog-penalty">This applies up to {abandonQuest?.penalty} Current Skill XP in penalties. Overall and Lifetime XP are unaffected.</p>
    </ConfirmationDialog>
  </>;
}
