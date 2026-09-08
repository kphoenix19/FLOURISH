export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 100;
  return <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)}>
    <span style={{ width: `${percent}%` }} />
  </div>;
}

export function SkillBadge({ code, name, compact = false }: { code: string; name?: string; compact?: boolean }) {
  return <span className="skill-badge" data-skill={code}><span aria-hidden="true">{code}</span>{!compact && name && <strong>{name}</strong>}</span>;
}

export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const text = difficulty.charAt(0) + difficulty.slice(1).toLowerCase();
  return <span className={`badge difficulty difficulty-${difficulty.toLowerCase()}`}>{text}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const text = status.charAt(0) + status.slice(1).toLowerCase();
  return <span className={`badge status status-${status.toLowerCase()}`}>{text}</span>;
}

export function Feedback({ message, error }: { message: string; error: string }) {
  if (!message && !error) return null;
  return <div className={`feedback ${error ? "feedback-error" : "feedback-success"}`} role={error ? "alert" : "status"} aria-live="polite">
    <span aria-hidden="true">{error ? "!" : "✓"}</span><p>{error || message}</p>
  </div>;
}
