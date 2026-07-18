"use client";

// RatingEditor — the tap-to-rate sheet for a single place. One INTERACTIVE RatingRow per live
// criterion (useCriteria's query already filters tombstoned criteria out, so every row here is
// live by construction). Each tap writes immediately via repo.setRating — there's no local draft
// state and no Save button — so the composite score everywhere (this place's own chips,
// PlaceCard, category rankings) updates the instant a bead lands, via liveQuery. Tapping the
// current value again clears it (RatingRow's own onChange(null) contract). "Done" just closes;
// there's nothing left to persist.

import { useCriteria } from "@/lib/hooks";
import { setRating } from "@/lib/repo";
import type { Place } from "@/lib/types";
import Sheet from "@/app/components/Sheet";
import { EmptyState, RatingRow } from "@/app/components/ui";
import { toast } from "@/app/components/Toast";

export default function RatingEditor({
  place,
  onClose,
}: {
  place: Place;
  onClose: () => void;
}) {
  const criteria = useCriteria();

  async function handleChange(criterionId: string, value: number | null) {
    try {
      await setRating(place.id, criterionId, value);
    } catch {
      toast("Couldn't save that rating");
    }
  }

  return (
    <Sheet
      title="Ratings"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="flex min-h-11 w-full items-center justify-center rounded-full bg-ember px-5 py-3 text-[0.95rem] font-semibold text-white shadow-sm transition active:scale-95 active:bg-ember-deep"
        >
          Done
        </button>
      }
    >
      {criteria === undefined ? null : criteria.length === 0 ? (
        <EmptyState
          emoji="⭐"
          title="No criteria yet"
          hint="Add rating criteria in Settings, then rate this place here."
        />
      ) : (
        <div className="flex flex-col divide-y divide-line py-1">
          {criteria.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 py-3.5">
              <span className="min-w-0 flex-1 truncate text-[0.95rem] text-ink">{c.name}</span>
              <RatingRow
                label={c.name}
                value={place.ratings[c.id]}
                onChange={(v) => handleChange(c.id, v)}
              />
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
