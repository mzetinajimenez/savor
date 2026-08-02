"use client";

// Presentational UI primitives for savor. No Dexie / repo imports here — these are pure
// display + local-interaction components. The visual language ("Supper Club"): bottle green
// surfaces, cream ink, butter-gold seals, Bodoni Moda display, Archivo utility labels.

import { useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";
import { formatScore } from "@/lib/ranking";
import type { SocialPlatform } from "@/lib/social/types";

// The FAB (and any empty-state "Add a place" button) announce intent via a window event;
// T8's add-place flow listens for it. Single source of truth for the event name.
export const ADD_PLACE_EVENT = "savor:add-place";

// Optional payload for a prefilled open (e.g. from the /import share-link route, T7). All
// fields are optional so a bare emitAddPlace() — the FAB / empty-state "Add a place" path —
// keeps opening a blank sheet exactly as before.
export interface PlacePrefill {
  name?: string;
  sourceUrl?: string;
  sourcePlatform?: SocialPlatform;
  autoLookup?: boolean;
}

export function emitAddPlace(prefill?: PlacePrefill) {
  window.dispatchEvent(new CustomEvent(ADD_PLACE_EVENT, { detail: prefill }));
}

/* ─── HeaderShell ─────────────────────────────────────────────────────────
   Sticky masthead for every tab: a letterspaced "savor" eyebrow over a serif
   section title, with an optional trailing action and an optional row below
   (filters, search) supplied as children. Safe-area aware; bottle-green scrim + blur. */
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
    <header className="sticky top-0 z-20 border-b border-rule/80 bg-ground/85 backdrop-blur-md">
      <div className="px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="font-util text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-sage">
              {eyebrow}
            </p>
            <h1 className="mt-0.5 truncate font-display text-[2.0625rem] italic leading-[0.98] font-semibold text-gold">
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
   A labeled tile for filters / tags — not a pill. Interactive when `onClick`
   is given (gold when active), otherwise a static label. */
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
    "inline-flex shrink-0 items-center gap-1.5 rounded-sm px-3.5 py-1.5 font-util text-[0.6875rem] font-semibold uppercase tracking-[0.12em] transition";
  const look = active
    ? "bg-gold-deep text-ground shadow-sm"
    : "border border-rule bg-ground-deep text-sage";

  if (!onClick) {
    return <span className={`${base} ${look} ${className}`}>{children}</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      // min-h-11 (44px) keeps the tap target thumb-friendly without inflating the visual chip —
      // the extra height is invisible padding around the same compact px-3.5/py-1.5 label.
      className={`${base} ${look} min-h-11 active:scale-[0.97] ${
        active ? "active:opacity-90" : "active:opacity-80"
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
        className="grid h-16 w-16 place-items-center rounded-sm bg-ground-deep text-3xl ring-1 ring-rule"
      >
        {emoji}
      </span>
      <h2 className="mt-5 font-display text-2xl text-cream">{title}</h2>
      <p className="mt-1.5 text-[0.95rem] leading-relaxed text-sage">{hint}</p>
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
      onClick={() => emitAddPlace()}
      className="inline-flex items-center gap-2 rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep"
    >
      <PlusGlyph className="h-4 w-4" />
      {label}
    </button>
  );
}

/* ─── PasteLinkField ─────────────────────────────────────────────────────────
   Controlled paste-a-link form: label + text input + optional "doesn't look
   like a link" hint + submit button. Shared by /import's paste screen and
   PlaceForm's inline paste affordance so the two entry points into the same
   resolve flow never drift apart. `variant` controls only the button's visual
   weight — "primary" (default) is /import's full-page gold button; the
   "secondary" outline style is for use inside PlaceForm's sheet, where Save
   is the true primary action. */
export function PasteLinkField({
  value,
  onChange,
  onSubmit,
  showHint,
  submitting = false,
  variant = "primary",
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  showHint: boolean;
  submitting?: boolean;
  variant?: "primary" | "secondary";
}) {
  const inputId = useId();
  const canSubmit = value.trim().length > 0 && !submitting;
  const buttonClass =
    variant === "primary"
      ? "min-h-11 w-full rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep disabled:pointer-events-none disabled:opacity-40"
      : "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-sm border border-rule bg-ground-deep px-4 text-sm font-semibold text-gold transition active:scale-[0.97] active:bg-rule disabled:opacity-60";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 text-left">
      <label htmlFor={inputId} className="sr-only">
        Instagram or TikTok link
      </label>
      <input
        id={inputId}
        // type="text" (not "url") on purpose: a shared paste often carries the link inside
        // caption text ("great tacos https://… go now"), which pickUrl extracts — but a
        // type="url" field marks that whole string :invalid and native validation blocks the
        // submit before pickUrl ever runs. inputMode="url" keeps the URL-optimized mobile
        // keyboard; validation is ours (pickUrl → the hint below).
        type="text"
        inputMode="url"
        autoComplete="off"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste an Instagram or TikTok link"
        className="h-12 w-full rounded-sm border border-sage-deep bg-ground-deep px-3.5 text-base text-cream placeholder:text-cream/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      />
      {/* Coral is the signal, cream carries the words: coral text is 3.00:1 on the bg-raised
          sheet body this can render inside, and 4.06:1 on ground. Same border-plus-cream
          pattern the error Toast settled on. */}
      {showHint ? (
        <p className="border-l-2 border-coral pl-2 text-sm text-cream">
          That doesn&rsquo;t look like a link — try pasting the full URL.
        </p>
      ) : null}
      <button type="submit" disabled={!canSubmit} className={buttonClass}>
        {submitting ? "Finding place…" : "Find place"}
      </button>
    </form>
  );
}

/* ─── ScoreBadge ─────────────────────────────────────────────────────────────
   The score seal — a foil stamp in butter gold with dark-green ink. Fully-round
   radius is reserved for this seal and small circular indicators (rating beads,
   status dots) — never cards, rows, buttons, chips, or inputs. Serif numeral,
   tabular, via formatScore. */
export function ScoreBadge({
  score,
  size = "md",
  className = "",
}: {
  score: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const dims = size === "sm" ? "h-8 w-8 text-[0.8rem]" : "h-10 w-10 text-[0.95rem]";
  return (
    <span
      className={`tabular inline-grid shrink-0 place-items-center rounded-full bg-gold font-display font-bold text-ground shadow-[inset_0_0_0_1.5px_var(--color-ground),0_2px_6px_rgba(0,0,0,0.32)] ${dims} ${className}`}
    >
      {formatScore(score)}
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
            className="grid h-11 w-11 place-items-center rounded-sm transition active:scale-[0.97]"
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
          ? "bg-gold shadow-[inset_0_1px_1px_rgba(255,255,255,0.35)]"
          : "border-2 border-sage bg-transparent"
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

export function LinkGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M10 14l4-4m-5.5 6.5-1 1a3.54 3.54 0 0 1-5-5l3-3a3.54 3.54 0 0 1 5-.5m2-2 1-1a3.54 3.54 0 0 1 5 5l-3 3a3.54 3.54 0 0 1-5 .5"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ─── ConfirmBox ────────────────────────────────────────────────────────────
   The inline destructive-confirm step, shared by four call sites that each had their own
   copy. `role="alertdialog"` (not just a coral div) is what tells a screen reader something
   now needs a decision, and the focus move is what puts the reader inside it — without it
   the box appears visually and silently, and the user's focus is still on a "Delete" button
   that has just changed meaning. It is inline rather than an overlay on purpose: it is a
   confirm STEP inside an open sheet, not a second sheet stacked on the first. */
export function ConfirmBox({
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  busy = false,
  onCancel,
  onConfirm,
  className = "",
}: {
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const messageId = useId();

  useEffect(() => {
    boxRef.current?.focus();
  }, []);

  return (
    <div
      ref={boxRef}
      role="alertdialog"
      aria-labelledby={messageId}
      tabIndex={-1}
      className={`flex flex-col gap-3 rounded-sm bg-coral/10 p-3.5 outline-none ${className}`}
    >
      <p id={messageId} className="text-sm text-cream">
        {message}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-11 flex-1 rounded-sm border border-rule px-4 text-sm font-semibold text-cream transition active:scale-[0.97] active:bg-ground-deep disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="min-h-11 flex-1 rounded-sm bg-coral-deep px-4 text-sm font-semibold text-ground transition active:scale-[0.97] disabled:opacity-50"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
