"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { gameConfig } from "@/config/game";
import { initialFocusAllocation, validateFocusAllocation } from "@/modules/player/domain/focus";
import { isIanaTimezone } from "@/modules/player/domain/timezone";

export type SkillDisplay = { code: string; name: string; description: string };
export type Allocation = Record<string, number>;
const focusRows = (allocation: Allocation) => Object.entries(allocation).map(([skillCode, points]) => ({ skillCode, points }));
async function save(path: string, method: string, body: unknown) {
  const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? "Unable to save. Please try again.");
  return result;
}

export function FocusAllocator({ skills, value, onChange, disabled = false }: { skills: SkillDisplay[]; value: Allocation; onChange: (value: Allocation) => void; disabled?: boolean }) {
  const remaining = gameConfig.focus.totalPoints - Object.values(value).reduce((sum, n) => sum + n, 0);
  return <div>
    <p>Focus Points influence what FLOURISH recommends more often; they do not change XP rewards or levels.</p>
    <p className="point-total" role="status" aria-live="polite">{remaining} points remaining · {gameConfig.focus.totalPoints} total</p>
    <div className="skill-grid">
      {skills.map((s) => <section className="skill-card" key={s.code} aria-label={`${s.name} Focus`}>
        <div><h3><span className="skill-code">{s.code}</span> {s.name}</h3><p>{s.description}</p></div>
        <div className="stepper">
          <button type="button" aria-label={`Decrease ${s.name} Focus`} disabled={disabled || value[s.code] <= gameConfig.focus.minPerSkill} onClick={() => onChange({ ...value, [s.code]: value[s.code] - 1 })}>−</button>
          <output aria-label={`${s.name} points`}>{value[s.code]}</output>
          <button type="button" aria-label={`Increase ${s.name} Focus`} disabled={disabled || value[s.code] >= gameConfig.focus.maxPerSkill || remaining <= 0} onClick={() => onChange({ ...value, [s.code]: value[s.code] + 1 })}>+</button>
        </div>
      </section>)}
    </div>
  </div>;
}

export function TimezoneField({ value, onChange, timezones, disabled = false }: { value: string; onChange: (value: string) => void; timezones: string[]; disabled?: boolean }) {
  return <div className="timezone-field">
    <label htmlFor="timezone">Your timezone</label>
    <input id="timezone" list="iana-timezones" value={value} onChange={(e) => onChange(e.target.value)} placeholder="America/Denver" disabled={disabled} aria-describedby="timezone-help" />
    <datalist id="iana-timezones">{timezones.map((zone) => <option key={zone} value={zone} />)}</datalist>
    <p id="timezone-help">Choose an IANA timezone for your local day. You can change it later in Settings.</p>
    <button className="button secondary" type="button" disabled={disabled} onClick={() => onChange(Intl.DateTimeFormat().resolvedOptions().timeZone)}>Use my device&apos;s timezone</button>
  </div>;
}

export function OnboardingForm({ skills, timezones }: { skills: SkillDisplay[]; timezones: string[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [timezone, setTimezone] = useState("");
  const [focus, setFocus] = useState<Allocation>(initialFocusAllocation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const steps = ["Welcome", "Timezone", "Focus Points", "Confirmation"];
  const valid = isIanaTimezone(timezone) && validateFocusAllocation(focus).success;
  async function submit() {
    setBusy(true); setError("");
    try { await save("/api/onboarding/complete", "POST", { timezone, focus: focusRows(focus) }); router.replace("/home"); router.refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to save."); setBusy(false); }
  }
  return <div>
    <p className="eyebrow">Step {step + 1} of 4</p><h1>{steps[step]}</h1>
    {step === 0 && <><p>Make space for the parts of life that matter to you. FLOURISH brings eight life Skills together.</p><div className="skill-grid">{skills.map((s) => <section className="skill-card" key={s.code}><div><h2>{s.code} · {s.name}</h2><p>{s.description}</p></div></section>)}</div></>}
    {step === 1 && <TimezoneField value={timezone} onChange={setTimezone} timezones={timezones} />}
    {step === 2 && <FocusAllocator skills={skills} value={focus} onChange={setFocus} disabled={busy} />}
    {step === 3 && <><p>Confirm your choices to finish setting up FLOURISH.</p><p><strong>Timezone:</strong> {timezone}</p><dl className="allocation-review">{skills.map((s) => <div key={s.code}><dt>{s.name}</dt><dd>{focus[s.code]} points</dd></div>)}</dl><p>You can change your Focus allocation freely in Settings.</p></>}
    {error && <p role="alert" className="error">{error}</p>}
    <div className="actions">
      {step > 0 && <button className="button secondary" disabled={busy} onClick={() => setStep(step - 1)}>Back</button>}
      {step < 3 ? <button className="button" disabled={step === 1 && !isIanaTimezone(timezone) || step === 2 && !validateFocusAllocation(focus).success} onClick={() => setStep(step + 1)}>Continue</button> : <button className="button" disabled={!valid || busy} onClick={() => void submit()}>{busy ? "Saving…" : "Complete onboarding"}</button>}
    </div>
  </div>;
}

export function SettingsForm({ skills, initialFocus, initialTimezone, timezones }: { skills: SkillDisplay[]; initialFocus: Allocation; initialTimezone: string; timezones: string[] }) {
  const [focus, setFocus] = useState(initialFocus);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function update(kind: "focus" | "timezone") {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await save(`/api/me/${kind}`, "PUT", kind === "focus" ? { focus: focusRows(focus) } : { timezone });
      setMessage(kind === "timezone" ? "Timezone saved." : result.changed ? "Focus saved." : "Your Focus allocation is already up to date.");
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save."); }
    finally { setBusy(false); }
  }
  return <>
    <h2>Focus Points</h2><p>Adjust your priorities freely, as often as you like.</p>
    <FocusAllocator skills={skills} value={focus} onChange={setFocus} disabled={busy} />
    <div className="actions"><button className="button" disabled={busy || !validateFocusAllocation(focus).success} onClick={() => void update("focus")}>Save Focus</button></div>
    <hr /><h2>Timezone</h2><TimezoneField value={timezone} onChange={setTimezone} timezones={timezones} disabled={busy} />
    <div className="actions"><button className="button" disabled={busy || !isIanaTimezone(timezone)} onClick={() => void update("timezone")}>Save timezone</button></div>
    <p role="status" aria-live="polite">{busy ? "Saving…" : message}</p>{error && <p role="alert" className="error">{error}</p>}
  </>;
}
