"use client";

// One row in the Journal feed: place name, what was eaten, and a note if either is present. The
// whole row links to the place's detail route — that route lands in a later task, so this is a
// deliberately dead link until then (mirrors PlaceCard's same convention). Callers resolve
// `placeName` themselves from a single usePlaces() call at the list level (see app/journal/
// page.tsx) so this component never triggers its own live query — with N visits on screen that
// would mean N redundant place lookups instead of one.

import Link from "next/link";
import type { Visit } from "@/lib/types";

export default function VisitCard({
  visit,
  placeName,
}: {
  visit: Visit;
  placeName: string;
}) {
  return (
    <Link
      href={`/places/${visit.placeId}`}
      className="flex min-h-[3.25rem] flex-col justify-center gap-0.5 rounded-card border border-line bg-surface px-4 py-3.5 shadow-sm transition active:scale-[0.98] active:bg-surface-sunk"
    >
      <h3 className="truncate font-display text-lg leading-tight text-ink">{placeName}</h3>
      {visit.dishes ? (
        <p className="truncate text-sm text-ink-soft">{visit.dishes}</p>
      ) : null}
      {visit.notes ? (
        <p className="truncate text-[0.82rem] text-ink-soft/80">{visit.notes}</p>
      ) : null}
    </Link>
  );
}
