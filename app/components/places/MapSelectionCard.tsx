"use client";

// MapSelectionCard — the non-modal card that rises above BottomNav when a pin is tapped.
//
// Deliberately NOT a Sheet: Sheet is modal (useModalA11y traps focus, locks body scroll), which
// is wrong for something that can be open while the user keeps panning the map underneath it
// (ADR §6). No useModalA11y, no aria-modal, no focus trap — Escape-to-close would be a
// reasonable convenience but is out of scope here; a focus trap is not.
//
// The ✕ sits OUTSIDE the next/link that wraps the card body (name/subtitle/score/status),
// never nested inside it — a link containing a button is a nested-interactive-elements trap
// for assistive tech, and putting the two side by side avoids it entirely.

import Link from "next/link";
import { ScoreBadge } from "../ui";
import type { Place } from "@/lib/types";

const STATUS_LABEL: Record<Place["status"], string> = {
  been: "Been",
  want_to_try: "Want to try",
};

export default function MapSelectionCard({
  place,
  score,
  onClose,
}: {
  place: Place;
  score: number | null;
  onClose: () => void;
}) {
  const subtitle = [place.cuisine, place.city].filter(Boolean).join(" · ");

  return (
    <div
      // Rises just above BottomNav's real footprint (4.5rem nav height + its own safe-area
      // inset) rather than guessing at a generic offset. z-20 stays under the nav's z-30.
      // anim-toast is the existing toast keyframe (app/globals.css) — reused rather than
      // inventing a new one, and already suppressed under prefers-reduced-motion there.
      className="anim-toast fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-2 rounded-sm border border-rule bg-raised px-4 py-3 shadow-lg"
    >
      <Link href={`/places/${place.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[1.0625rem] font-semibold text-cream">
            {place.name}
          </p>
          {/* cream/80, not sage — sage fails AA on bg-raised (3.85:1). */}
          {subtitle ? (
            <p className="mt-0.5 truncate text-[0.8125rem] text-cream/80">{subtitle}</p>
          ) : null}
          <p className="mt-1 font-util text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-cream/80">
            {STATUS_LABEL[place.status]}
          </p>
        </div>
        {score !== null ? <ScoreBadge score={score} size="sm" className="shrink-0" /> : null}
      </Link>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-sm text-cream/80 transition active:scale-[0.97] active:bg-ground-deep"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
