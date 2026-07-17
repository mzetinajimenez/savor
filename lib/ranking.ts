// Pure ranking math for savor. No Dexie, no React, no I/O — only types are imported. Every
// function here is a plain deterministic transform so it can be unit-tested without a database
// and reused unchanged by both server-rendered and client UI code (T5/T10).

import type { Category, Criterion, Place } from "./types";

/**
 * Weighted average of a place's ratings for one category, over criteria that are "live" (not
 * tombstoned), weighted (> 0), and actually rated.
 *
 * For each criterion id present in `ratings`:
 *   - it is dropped unless `liveCriterionIds` contains it (tombstoned criteria never contribute,
 *     even if the place still carries a stale rating for them);
 *   - its weight is `weights[id] ?? 1` — categories don't re-enumerate weights when new criteria
 *     are added, so a missing key defaults to 1, not 0;
 *   - it is dropped if that weight is <= 0 (an explicit 0 excludes it, same as a missing rating).
 *
 * Returns the RAW, unrounded weighted average — `Σ(w×r)/Σ(w)` over the contributing criteria.
 * Rounding to display precision is the caller's job (see `formatScore`).
 *
 * Returns null when nothing contributes (no ratings, nothing live, or total weight is 0) — the
 * composite score is undefined in that case, not zero.
 */
export function compositeScore(
  ratings: Record<string, number>,
  weights: Record<string, number>,
  liveCriterionIds: Set<string>
): number | null {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const criterionId of Object.keys(ratings)) {
    if (!liveCriterionIds.has(criterionId)) continue;
    const weight = weights[criterionId] ?? 1;
    if (weight <= 0) continue;
    weightedSum += weight * ratings[criterionId];
    totalWeight += weight;
  }

  if (totalWeight === 0) return null;
  return weightedSum / totalWeight;
}

/** Formats a score to one decimal place for display, e.g. `formatScore(4.333)` -> `"4.3"`. */
export function formatScore(score: number): string {
  return (Math.round(score * 10) / 10).toFixed(1);
}

export interface RankedEntry {
  place: Place;
  score: number;
  rank: number;
  tied: boolean;
}

/**
 * Ranks places within a single category by composite score, highest first.
 *
 * Contract: `places` must already be scoped to this category and non-tombstoned (deletedAt ===
 * null) — this function does not re-filter on either. It additionally keeps only places with
 * `status === "been"` and a non-null `compositeScore` (a `want_to_try` place, or one with no
 * contributing ratings, is excluded from the ranking entirely). Empty input, or input where
 * nothing qualifies, returns `[]`.
 *
 * `criteria` supplies the live-criterion set (any criterion with `deletedAt !== null` is
 * excluded from every place's composite score, even if a stale rating for it remains).
 *
 * Ties are determined at display precision: two scores tie iff `Math.round(a*10) ===
 * Math.round(b*10)` (matching what `formatScore` would render), since places showing the same
 * number to the user must rank as tied even if their raw scores differ slightly. Tied entries
 * share one `rank` under standard competition ranking (1, 2, 2, 4 — the rank after a tie group
 * skips ahead by the group's size) and are flagged `tied: true`. Within a tie group, entries are
 * ordered by most recent visit date (from `lastVisitByPlace`) descending — places with no visit
 * sort last in the group — then by name ascending (locale-insensitive lowercase compare).
 *
 * Each returned entry's `score` is the RAW composite score (see `compositeScore`); format it
 * with `formatScore` for display.
 */
export function rankCategory(
  places: Place[],
  category: Category,
  criteria: Criterion[],
  lastVisitByPlace: Map<string, string>
): RankedEntry[] {
  const liveCriterionIds = new Set(
    criteria.filter((c) => c.deletedAt === null).map((c) => c.id)
  );

  const scored = places
    .filter((place) => place.status === "been")
    .map((place) => ({
      place,
      score: compositeScore(place.ratings, category.weights, liveCriterionIds),
    }))
    .filter((entry): entry is { place: Place; score: number } => entry.score !== null)
    .map((entry) => ({ ...entry, displayKey: Math.round(entry.score * 10) }));

  if (scored.length === 0) return [];

  scored.sort((a, b) => {
    if (a.displayKey !== b.displayKey) return b.displayKey - a.displayKey;

    const aVisit = lastVisitByPlace.get(a.place.id);
    const bVisit = lastVisitByPlace.get(b.place.id);
    if (aVisit !== bVisit) {
      if (aVisit === undefined) return 1; // no visit sorts last within the tie group
      if (bVisit === undefined) return -1;
      return aVisit > bVisit ? -1 : 1; // most recent first
    }

    return a.place.name.toLowerCase().localeCompare(b.place.name.toLowerCase());
  });

  const groupSizes = new Map<number, number>();
  for (const entry of scored) {
    groupSizes.set(entry.displayKey, (groupSizes.get(entry.displayKey) ?? 0) + 1);
  }

  let rank = 1;
  return scored.map((entry, index) => {
    if (index > 0 && entry.displayKey !== scored[index - 1].displayKey) {
      rank = index + 1;
    }
    return {
      place: entry.place,
      score: entry.score,
      rank,
      tied: (groupSizes.get(entry.displayKey) ?? 0) > 1,
    };
  });
}
