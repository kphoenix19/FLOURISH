"use client";
import { useState } from "react";
import type { StandardState } from "@/modules/quests/standard/view";
import type { StandardAction } from "@/modules/quests/standard/actions";

const label = (text: string) => text.charAt(0) + text.slice(1).toLowerCase();
export function StandardQuests({ initial }: { initial: StandardState }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  async function act(id: string, action: StandardAction) {
    setBusy(id); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/quests/standard/${id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "reroll" ? { feedbackReason: feedback[id] || null } : {}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "The quest could not be updated.");
      setState(result);
      setMessage(action === "accept" ? "Quest accepted. Your deadline has started." : action === "bump" ? "A harder family quest is ready to accept." : "Your replacement quest is ready.");
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(null); }
  }
  return <>
    <p className="eyebrow">Your progression</p><h1>Overall Level {state.overallLevel}</h1><p>{state.overallXp} Overall XP</p>
    <h2>Standard Quests</h2><p>Three persistent quests for every Skill. Accept when you&apos;re ready to start the deadline.</p>
    <p>Completion and XP resolution arrive in the next build phase.</p>
    <p role="status" aria-live="polite">{message}</p>{error && <p role="alert" className="error">{error}</p>}
    <nav className="skill-links" aria-label="Jump to Skill">{state.skills.map((s) => <a key={s.code} href={`#quests-${s.code}`}>{s.name}</a>)}</nav>
    {state.skills.map((skill) => <section key={skill.id} id={`quests-${skill.code}`} className="quest-skill" aria-label={`${skill.name} quests`}>
      <h2>{skill.code} · {skill.name}</h2><div className="quest-grid">{skill.slots.map((slot) => {
        const q = slot.quest;
        return <article key={slot.id} className="skill-card quest-card" data-slot-id={slot.id} data-quest-id={q.id} aria-label={`${skill.name} slot ${slot.slotNumber}`} aria-busy={busy === q.id}>
          <div><p className="eyebrow">Slot {slot.slotNumber} · {label(q.status)}</p><h3>{q.title}</h3><p>{q.description}</p>
            <p>{label(q.difficulty)} · {q.baseXp} Base XP · about {q.estimatedMinutes} min</p>
            {q.status === "AVAILABLE" && <p>{q.completionWindowHours} hours after acceptance{q.completionType === "COUNT" ? ` · ${q.completionTarget} repetitions` : ""}</p>}
            {q.deadlineAt && <p className="deadline">Due <time dateTime={q.deadlineAt}>{new Intl.DateTimeFormat("en-US", { timeZone: state.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(q.deadlineAt))}</time></p>}
            {q.status === "EXPIRED" && <p>This expired quest continues to occupy its slot.</p>}
          </div>
          {q.status === "AVAILABLE" && <div>
            <div className="actions"><button className="button" disabled={busy !== null} onClick={() => act(q.id, "accept")}>Accept</button>
              <button className="button secondary" aria-label={`Reroll ${q.title}`} disabled={busy !== null} onClick={() => act(q.id, "reroll")}>↻ Reroll</button>
              {q.nextDifficulty && <button className="button secondary" aria-label={`Make ${q.title} harder: ${label(q.nextDifficulty)}`} disabled={busy !== null} onClick={() => act(q.id, "bump")}>🔥 {label(q.nextDifficulty)}</button>}
            </div>
            <label className="reroll-feedback">Reroll feedback (optional)<select aria-label={`Reroll feedback for ${q.title}`} value={feedback[q.id] ?? ""} disabled={busy !== null} onChange={(e) => setFeedback({ ...feedback, [q.id]: e.target.value })}>
              <option value="">Skip feedback</option><option value="TOO_HARD">Too hard</option><option value="NO_TIME">No time</option><option value="NOT_INTERESTED">Not interested</option><option value="JUST_DIFFERENT">Just different</option>
            </select></label>
          </div>}
        </article>;
      })}</div>
    </section>)}
  </>;
}
