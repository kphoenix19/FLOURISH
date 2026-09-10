"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

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
  const text = status === "ACCEPTED" ? "Active" : status.charAt(0) + status.slice(1).toLowerCase();
  return <span className={`badge status status-${status.toLowerCase()}`}>{text}</span>;
}

export function Feedback({ message, error }: { message: string; error: string }) {
  if (!message && !error) return null;
  return <div className={`feedback ${error ? "feedback-error" : "feedback-success"}`} role={error ? "alert" : "status"} aria-live="polite">
    <span aria-hidden="true">{error ? "!" : "✓"}</span><p>{error || message}</p>
  </div>;
}

export function ConfirmationDialog({ open, title, children, confirmLabel, pending, onCancel, onConfirm }: { open: boolean; title: string; children: ReactNode; confirmLabel: string; pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => returnFocus.current?.focus();
  }, [open]);
  if (!open) return null;
  function keyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && !pending) { event.preventDefault(); onCancel(); return; }
    if (event.key !== "Tab") return;
    const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (!buttons.length) return;
    const first = buttons[0]; const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onCancel(); }}>
    <div ref={panel} className="dialog-panel" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onKeyDown={keyDown}>
      <h2 id="confirm-title">{title}</h2>{children}
      <div className="dialog-actions"><button className="button secondary" type="button" disabled={pending} onClick={onCancel}>Cancel</button><button className="button danger" type="button" disabled={pending} onClick={onConfirm}>{pending ? "Abandoning…" : confirmLabel}</button></div>
    </div>
  </div>;
}
