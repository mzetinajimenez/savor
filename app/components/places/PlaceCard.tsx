"use client";

// One row in the Places list: name + status badge, a "cuisine · city" subtitle (either half
// omitted when missing), and a gold score seal when the place has at least one live, weighted,
// rated criterion. The whole row is a link to `/places/[id]`.
//
// Deliberately a flat ruled row, not a card: no radius, no per-row background, no shadow. Rows
// are separated only by the `border-t border-rule` hairline set on the row itself — the list
// container (app/page.tsx) no longer adds a gap between rows, since a gap would recreate the
// look of floating cards by whitespace instead of by chrome.
import Link from "next/link";
import { compositeScore } from "@/lib/ranking";
import type { Place } from "@/lib/types";
import { Chip, LinkGlyph, ScoreBadge } from "../ui";

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
  // Place.address/city exist but nothing populates address yet (only OSM lookup sets city, and
  // no form field exposes either) — cuisine/city is the only secondary content available today.
  // Render nothing (not an empty line / placeholder dash) when a place has neither.
  const subtitle = [place.cuisine, place.city].filter(Boolean).join(" · ");

  return (
    <Link
      href={`/places/${place.id}`}
      className="flex min-h-11 items-center gap-3 border-t border-rule px-4 py-3 transition-colors active:bg-ground-deep"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="truncate font-display text-[1.03125rem] font-semibold leading-tight text-cream">
            {place.name}
          </h3>
          {/* Always the recessed variant: this is a passive status label, not an active
              filter. Gold is reserved for action and active state, and a gold pill here
              would compete with the score seal on the same row. */}
          <Chip>{STATUS_LABEL[place.status]}</Chip>
          {place.sourceUrl ? (
            <span
              role="img"
              aria-label={
                place.sourcePlatform === "instagram"
                  ? "Imported from Instagram"
                  : place.sourcePlatform === "tiktok"
                  ? "Imported from TikTok"
                  : "Has a source link"
              }
              className="shrink-0"
            >
              <LinkGlyph className="h-3.5 w-3.5 text-sage" />
            </span>
          ) : null}
        </div>
        {subtitle ? <p className="mt-0.5 truncate text-[0.6875rem] text-sage">{subtitle}</p> : null}
      </div>
      {score !== null ? <ScoreBadge score={score} size="sm" className="shrink-0" /> : null}
    </Link>
  );
}
