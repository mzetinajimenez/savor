"use client";

// One row in the Places list: name + status badge, a "cuisine · city" subtitle (either half
// omitted when missing), and a gold score seal when the place has at least one live, weighted,
// rated criterion. The whole row is a link to the (future) place detail route — T8 lands
// `/places/[id]`, so this is a deliberately dead link until then.

import Link from "next/link";
import { compositeScore } from "@/lib/ranking";
import type { Place } from "@/lib/types";
import { ScoreBadge } from "../ui";

const STATUS_LABEL: Record<Place["status"], string> = {
  been: "Been",
  want_to_try: "Want to try",
};

export default function PlaceCard({
  place,
  liveCriterionIds,
}: {
  place: Place;
  liveCriterionIds: Set<string>;
}) {
  // Empty weights map -> every live, rated criterion defaults to weight 1 (plain average) per
  // compositeScore's contract. Unrated places (or ones whose only ratings are for
  // deleted/unrated criteria) get null back, so no badge renders.
  const score = compositeScore(place.ratings, {}, liveCriterionIds);
  const subtitle = [place.cuisine, place.city].filter(Boolean).join(" · ");

  return (
    <Link
      href={`/places/${place.id}`}
      className="flex min-h-[3.25rem] items-center gap-3 rounded-card border border-line bg-surface px-4 py-3.5 shadow-sm transition active:scale-[0.98] active:bg-surface-sunk"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="truncate font-display text-lg leading-tight text-ink">{place.name}</h3>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${
              place.status === "been"
                ? "bg-plum-tint text-plum"
                : "bg-ember-tint text-ember-deep"
            }`}
          >
            {STATUS_LABEL[place.status]}
          </span>
        </div>
        {subtitle ? <p className="mt-0.5 truncate text-sm text-ink-soft">{subtitle}</p> : null}
      </div>
      {score !== null ? <ScoreBadge score={score} size="sm" className="shrink-0" /> : null}
    </Link>
  );
}
