"use client";

// Presentational UI primitives for savor. No Dexie / repo imports here — these are pure
// display + local-interaction components. The visual language ("Cellar"): clay parchment
// surfaces, wine-plum structure, ember action, gold score seals, Instrument Serif display.

import type { ReactNode } from "react";
import { formatScore } from "@/lib/ranking";

// The FAB (and any empty-state "Add a place" button) announce intent via a window event;
// T8's add-place flow listens for it. Single source of truth for the event name.
export const ADD_PLACE_EVENT = "savor:add-place";

export function emitAddPlace() {
  window.dispatchEvent(new CustomEvent(ADD_PLACE_EVENT));
}

/* ─── HeaderShell ─────────────────────────────────────────────────────────
   Sticky masthead for every tab: a letterspaced "savor" eyebrow over a serif
   section title, with an optional trailing action and an optional row below
   (filters, search) supplied as children. Safe-area aware; parchment + blur. */
export function HeaderShell({
  title,
  eyebrow = "savor",
  action,
  children,
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-line/80 bg-shell/85 backdrop-blur-md">
      <div className="px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-ink-soft">
              {eyebrow}
            </p>
            <h1 className="mt-0.5 truncate font-display text-3xl leading-none text-plum">
              {title}
            </h1>
          </div>
          {action ? <div className="shrink-0 pb-0.5">{action}</div> : null}
        </div>
        {children ? <div className="mt-3">{children}</div> : null}
      </div>
    </header>
  );
}

/* ─── Chip ─────────────────────────────────────────────────────────────────
   Pill for filters / tags. Interactive when `onClick` is given (ember when
   active), otherwise a static label. */
export function Chip({
  active = false,
  onClick,
  children,
  className = "",
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  const base =
    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition";
  const look = active
    ? "bg-ember-deep text-white shadow-sm"
    : "border border-line bg-surface text-ink-soft";

  if (!onClick) {
    return <span className={`${base} ${look} ${className}`}>{children}</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${base} ${look} active:scale-95 ${
        active ? "active:opacity-90" : "active:bg-surface-sunk"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/* ─── EmptyState ────────────────────────────────────────────────────────────
   Invitation to act, not just a shrug. Emoji plate, serif line, plain-spoken
   hint, and an optional action slot (e.g. <AddPlaceButton/>). */
export function EmptyState({
  emoji,
  title,
  hint,
  children,
}: {
  emoji: string;
  title: string;
  hint: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center px-6 py-20 text-center">
      <span
        aria-hidden
        className="grid h-16 w-16 place-items-center rounded-full bg-surface-sunk text-3xl ring-1 ring-line"
      >
        {emoji}
      </span>
      <h2 className="mt-5 font-display text-2xl text-ink">{title}</h2>
      <p className="mt-1.5 text-[0.95rem] leading-relaxed text-ink-soft">{hint}</p>
      {children ? <div className="mt-6">{children}</div> : null}
    </div>
  );
}

/* ─── AddPlaceButton ────────────────────────────────────────────────────────
   Convenience action for empty states — fires the same event as the nav FAB. */
export function AddPlaceButton({ label = "Add a place" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={emitAddPlace}
      className="inline-flex items-center gap-2 rounded-full bg-plum px-5 py-3 text-[0.95rem] font-semibold text-white shadow-sm transition active:scale-95 active:bg-plum-deep"
    >
      <PlusGlyph className="h-4 w-4" />
      {label}
    </button>
  );
}

/* ─── ScoreBadge ─────────────────────────────────────────────────────────────
   A gold enamel "seal" — the composite score stamped on a menu. Serif numeral,
   tabular. Uses formatScore for the 1-decimal display. */
export function ScoreBadge({
  score,
  size = "md",
  className = "",
}: {
  score: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const dims =
    size === "sm" ? "px-2 py-0.5 text-sm" : "px-2.5 py-1 text-base";
  const star = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg bg-gold-tint text-plum ring-1 ring-gold/30 ${dims} ${className}`}
    >
      <StarGlyph className={`text-gold ${star}`} />
      <span className="tabular font-display font-medium leading-none">
        {formatScore(score)}
      </span>
    </span>
  );
}

/* ─── RatingRow ───────────────────────────────────────────────────────────────
   Five "tasting beads" — savor's answer to a star row. Presentational: when
   `onChange` is supplied it's an interactive radiogroup (each bead ≥44px);
   tapping the current value again clears it (onChange(null)). Without onChange
   it renders as a static, labelled readout. */
export function RatingRow({
  value,
  onChange,
  label,
}: {
  value?: number;
  onChange?: (v: number | null) => void;
  label: string;
}) {
  const current = value ?? 0;

  if (!onChange) {
    return (
      <span
        role="img"
        aria-label={`${label}: ${value ?? 0} of 5`}
        className="inline-flex items-center gap-1.5"
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <Bead key={n} filled={n <= current} size="sm" />
        ))}
      </span>
    );
  }

  // onChange is defined past the guard above; capture it so the closure keeps the narrowing.
  const commit = onChange;

  function handleKey(e: React.KeyboardEvent) {
    let next: number;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = Math.min(5, current + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = Math.max(1, current - 1);
    else if (e.key === "Home") next = 1;
    else if (e.key === "End") next = 5;
    else return;
    e.preventDefault();
    commit(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={handleKey}
      className="inline-flex items-center gap-1"
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const selected = n === current;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${n} of 5`}
            tabIndex={selected || (current === 0 && n === 1) ? 0 : -1}
            onClick={() => onChange(selected ? null : n)}
            className="grid h-11 w-11 place-items-center rounded-full transition active:scale-90"
          >
            <Bead filled={n <= current} size="md" />
          </button>
        );
      })}
    </div>
  );
}

function Bead({ filled, size }: { filled: boolean; size: "sm" | "md" }) {
  const dim = size === "sm" ? "h-3.5 w-3.5" : "h-6 w-6";
  return (
    <span
      aria-hidden
      className={`block rounded-full ${dim} ${
        filled
          ? "bg-ember shadow-[inset_0_1px_1px_rgba(255,255,255,0.35)]"
          : "border-2 border-line bg-surface-sunk"
      }`}
    />
  );
}

/* ─── glyphs ─────────────────────────────────────────────────────────────── */

export function PlusGlyph({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth={2.25}
        strokeLinecap="round"
      />
    </svg>
  );
}

function StarGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2.5l2.7 5.9 6.3.7-4.7 4.3 1.3 6.2L12 16.9 6.1 19.6l1.3-6.2L2.7 9.1l6.3-.7L12 2.5z" />
    </svg>
  );
}
