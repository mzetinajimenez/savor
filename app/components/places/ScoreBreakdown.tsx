"use client";

// Presentational answer to "why is this score what it is?" — one component, two mounts: place
// detail's per-list score chips (the canonical, always-available route) and the ranked-list
// long-press/hover-intent peek (an accelerator; see app/categories/[id]/page.tsx). This
// component doesn't know which mount it's in.
//
// Always rendered on a bg-raised surface (a Sheet body, or the peek's own bg-raised card) — so
// per CLAUDE.md's contrast table every text token here is cream or cream/80, never sage (sage
// is 3.85:1 on raised and fails AA; this is the same class of bug the Phase 0-1 restyle's final
// review fixed at 25 sites and Phase 2 Task 1 fixed again at a sixth).

import { explainScore, scoreAcrossCategories, summarizeScore } from "@/lib/ranking";
import type { Category, Criterion, Place } from "@/lib/types";
import { ScoreBadge } from "@/app/components/ui";

export default function ScoreBreakdown({
  place,
  category,
  categories,
  criteria,
}: {
  place: Place;
  category: Category;
  categories: Category[];
  criteria: Criterion[];
}) {
  const explanation = explainScore(place, category, criteria);
  // Both real mounts only ever render this component for a place/category pair that already has
  // a non-null score (place detail's chip loop and the ranked list itself both filter to
  // non-null scores first) — this guard is defensive, matching the same
  // `if (score === null) return null` idiom already used at both call sites.
  if (explanation.score === null) return null;

  const otherScores = scoreAcrossCategories(place, categories, criteria);
  const summary = summarizeScore(category.id, explanation, otherScores);

  return (
    <div>
      <div className="flex items-center gap-3">
        <ScoreBadge score={explanation.score} />
        <p className="min-w-0 truncate font-display text-lg text-cream">
          {category.emoji ? `${category.emoji} ` : ""}
          {category.name}
        </p>
      </div>

      <ul className="mt-4 flex flex-col divide-y divide-rule">
        {explanation.contributions.map((c) => (
          <li key={c.criterionId} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.95rem] text-cream">{c.name}</p>
              {!c.included ? (
                <p className="text-xs text-cream/80">
                  {c.weight === 0 ? "Excluded from score" : "Not rated"}
                </p>
              ) : null}
            </div>
            <span className="tabular shrink-0 font-util text-[0.6875rem] font-semibold text-cream/80">
              ×{c.weight}
            </span>
            <div className="h-1.5 w-16 shrink-0 rounded-sm bg-ground-deep">
              <div
                className={`h-full rounded-sm ${c.included ? "bg-gold" : "bg-sage-deep"}`}
                style={{ width: `${((c.rating ?? 0) / 5) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-4 border-t border-rule pt-4 text-sm leading-relaxed text-cream/80">
        {summary}
      </p>
    </div>
  );
}
