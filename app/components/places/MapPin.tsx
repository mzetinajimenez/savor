"use client";

// MapPin — the visual content portalled into a MapLibre Marker's imperatively-created element.
// Purely presentational: PlacesMap owns the marker lifecycle and wires the click listener
// directly on the marker's container div (see its reconciliation effect), so this component
// takes no callback prop and never touches maplibre-gl itself.
//
// Per the ADR: `been` places get the gold score seal (rounded-full is that seal's named
// exception to savor's "rounded-full is reserved" rule); `want_to_try` places get a hollow
// cream ring, no fill, no number. No coral anywhere on the map.

import { formatScore } from "@/lib/ranking";
import type { Place } from "@/lib/types";

export default function MapPin({
  place,
  score,
  selected,
}: {
  place: Place;
  score: number | null;
  selected: boolean;
}) {
  const isBeen = place.status === "been";

  return (
    // min-h-11/min-w-11 keeps the tap target at 44px without inflating the ~28px visual dot —
    // the same invisible-padding trick Chip uses (app/components/ui.tsx). This is the map's
    // only interactive content, so it's a real <button>, not a <div>, with an accessible name.
    <button type="button" aria-label={place.name} aria-pressed={selected} className="grid min-h-11 min-w-11 place-items-center">
      <span
        className={`tabular inline-grid h-7 w-7 shrink-0 place-items-center rounded-full font-display text-[0.7rem] font-bold transition ${
          isBeen
            ? "bg-gold text-ground shadow-[inset_0_0_0_1.5px_var(--color-ground),0_2px_6px_rgba(0,0,0,0.32)]"
            : "border-2 border-cream bg-ground/70"
        } ${selected ? "scale-110 ring-2 ring-cream" : ""}`}
      >
        {/* want_to_try renders no fill and no number. A `been` place with no contributing
            rating has a NULL composite score — unranked, not zero — so it renders a middle
            dot rather than "0". */}
        {isBeen ? (score !== null ? formatScore(score) : "·") : null}
      </span>
    </button>
  );
}
